import type { ClassifiedImageCandidate, ImageCandidateClassificationSummary } from "./image-xobject-classifier";
import { classifyImageCandidates } from "./image-xobject-classifier";
import { discoverImageXObjects } from "./image-xobject-discovery";

type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfPdfDocument = InstanceType<MuPdfNamespace["PDFDocument"]>;
type MuPdfPdfObject = InstanceType<MuPdfNamespace["PDFObject"]>;
type MuPdfBuffer = InstanceType<MuPdfNamespace["Buffer"]>;
type MuPdfImage = InstanceType<MuPdfNamespace["Image"]>;
type MuPdfPixmap = InstanceType<MuPdfNamespace["Pixmap"]>;

export type ImageRecompressionFailure = {
  objectReference: string;
  pageNumber: number;
  message: string;
};

export type ImageRecompressionDiagnostics = {
  totalImages: number;
  safeRecompressCount: number;
  successfullyRecompressedCount: number;
  skippedBecauseNewStreamWasNotSmallerCount: number;
  failedRecompressionCount: number;
  unsupportedCount: number;
  originalImageBytes: number;
  rewrittenImageBytes: number;
  structuralPdfSize: number;
  finalPdfSize: number;
  savedBytes: number;
  savedPercent: number;
  usedStructuralFallback: boolean;
  rewrittenObjectReferences: string[];
  failures: ImageRecompressionFailure[];
};

export type SafeImageRecompressionResult = {
  outputBytes: ArrayBuffer;
  pageCount: number;
  diagnostics: ImageRecompressionDiagnostics;
};

const DEFAULT_JPEG_QUALITY = 75;
const METADATA_KEYS = [
  "META_INFO_TITLE",
  "META_INFO_AUTHOR",
  "META_INFO_SUBJECT",
  "META_INFO_KEYWORDS",
  "META_INFO_CREATOR",
  "META_INFO_PRODUCER",
  "META_INFO_CREATIONDATE",
  "META_INFO_MODIFICATIONDATE",
] as const;

function getHeaderPreview(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

function resolveXObjectCandidate(xObject: MuPdfPdfObject) {
  const objectReference = xObject.isIndirect() ? xObject.toString(true, true) : null;
  const resolved = xObject.isIndirect() ? xObject.resolve() : xObject;

  return { objectReference, resolved };
}

function findPdfObjectByReference(
  pdfDocument: MuPdfPdfDocument,
  pageNumber: number,
  objectReference: string,
): MuPdfPdfObject | null {
  const page = pdfDocument.loadPage(pageNumber - 1);
  try {
    const pageObject = page.getObject();
    try {
      const resources = pageObject.getInheritable("Resources");
      if (!resources || resources.isNull()) {
        return null;
      }

      const xObjects = resources.get("XObject");
      if (!xObjects || xObjects.isNull()) {
        return null;
      }

      const stack: MuPdfPdfObject[] = [xObjects];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || !current.isDictionary()) {
          continue;
        }

        let found: MuPdfPdfObject | null = null;
        current.forEach((value) => {
          if (found) {
            return;
          }

          const { objectReference: currentReference, resolved } = resolveXObjectCandidate(value);
          if ((currentReference ?? value.toString(true, true)) === objectReference) {
            found = value.isIndirect() ? value : resolved;
            return;
          }

          const subtype = resolved.get("Subtype");
          const subtypeName = subtype && !subtype.isNull() ? subtype.toString(true, true) : null;
          if (subtypeName === "/Form" || subtypeName === "Form") {
            const nestedResources = resolved.get("Resources");
            if (nestedResources && !nestedResources.isNull()) {
              const nestedXObjects = nestedResources.get("XObject");
              if (nestedXObjects && !nestedXObjects.isNull()) {
                stack.push(nestedXObjects);
              }
            }
          }
        });

        if (found) {
          return found;
        }
      }

      return null;
    } finally {
      pageObject.destroy();
    }
  } finally {
    page.destroy();
  }
}

function readRawStreamBytes(stream: MuPdfPdfObject) {
  let buffer: MuPdfBuffer | null = null;
  try {
    buffer = stream.readRawStream();
    return buffer.asUint8Array().slice();
  } finally {
    buffer?.destroy();
  }
}

function scrubMetadata(doc: MuPdfPdfDocument, mupdf: MuPdfNamespace) {
  for (const key of METADATA_KEYS) {
    const metaKey = mupdf.Document[key];
    if (!metaKey) {
      continue;
    }

    try {
      doc.setMetaData(metaKey, "");
    } catch {
      // Best effort.
    }
  }
}

function rewriteTargetImage(
  pdfDocument: MuPdfPdfDocument,
  targetObject: MuPdfPdfObject,
  jpegBytes: Uint8Array,
) {
  targetObject.writeRawStream(jpegBytes);
  targetObject.put("Filter", pdfDocument.newName("DCTDecode"));
  try {
    targetObject.delete("DecodeParms");
  } catch {
    // Best effort.
  }

  try {
    targetObject.put("Length", pdfDocument.newInteger(jpegBytes.byteLength));
  } catch {
    // Best effort.
  }
}

function loadImagePixmap(pdfDocument: MuPdfPdfDocument, targetObject: MuPdfPdfObject) {
  const image = pdfDocument.loadImage(targetObject);
  try {
    const pixmap = image.toPixmap();
    return { image, pixmap };
  } catch (error) {
    image.destroy();
    throw error;
  }
}

function saveDocumentBytes(pdfDocument: MuPdfPdfDocument) {
  const buffer = pdfDocument.saveToBuffer({ garbage: 4 });
  try {
    return buffer.asUint8Array().slice().buffer;
  } finally {
    buffer.destroy();
  }
}

function validateRewrittenImages(
  mupdf: MuPdfNamespace,
  outputBytes: ArrayBuffer,
  pageCount: number,
  rewrittenPageNumbers: number[],
) {
  const reopened = mupdf.Document.openDocument(outputBytes);
  try {
    if (reopened.countPages() !== pageCount) {
      throw new Error(`Output page count changed from ${pageCount} to ${reopened.countPages()}`);
    }

    const reopenedPdf = reopened.asPDF();
    if (!reopenedPdf) {
      throw new Error("Reopened output is not a PDF document");
    }

    const pageSet = new Set(rewrittenPageNumbers);
    const discoveredImages = discoverImageXObjects(reopenedPdf);
    const candidatesToCheck = discoveredImages.candidates.filter((candidate) => pageSet.has(candidate.pageNumber));

    for (const candidate of candidatesToCheck) {
      const targetObject = findPdfObjectByReference(reopenedPdf, candidate.pageNumber, candidate.objectReference);
      if (!targetObject) {
        throw new Error(`Rewritten page ${candidate.pageNumber} could not be reopened`);
      }

      let image: MuPdfImage | null = null;
      let pixmap: MuPdfPixmap | null = null;
      try {
        image = reopenedPdf.loadImage(targetObject);
        pixmap = image.toPixmap();
      } finally {
        pixmap?.destroy();
        image?.destroy();
        targetObject.destroy();
      }
    }
  } finally {
    reopened.destroy();
  }
}

function buildFailure(message: string) {
  return new Error(message);
}

function fingerprintCandidate(candidate: ClassifiedImageCandidate) {
  return [
    candidate.pageNumber,
    candidate.width ?? "null",
    candidate.height ?? "null",
    candidate.bitsPerComponent ?? "null",
    candidate.colorspace ?? "null",
  ].join("|");
}

export async function recompressSafeImageCandidates(
  mupdf: MuPdfNamespace,
  inputBytes: ArrayBuffer,
  pdfDocument: MuPdfPdfDocument,
  classification: ImageCandidateClassificationSummary,
  quality = DEFAULT_JPEG_QUALITY,
): Promise<SafeImageRecompressionResult> {
  const pageCount = pdfDocument.countPages();
  const baselineDocument = mupdf.Document.openDocument(inputBytes);
  let structuralBytes: ArrayBuffer;
  try {
    const baselinePdf = baselineDocument.asPDF();
    if (!baselinePdf) {
      throw buildFailure("Input snapshot is not a PDF document");
    }

    scrubMetadata(baselinePdf, mupdf);
    structuralBytes = saveDocumentBytes(baselinePdf);
  } finally {
    baselineDocument.destroy();
  }

  let workingBytes = structuralBytes;
  let originalImageBytes = 0;
  let rewrittenImageBytes = 0;
  let successfullyRecompressedCount = 0;
  let skippedBecauseNewStreamWasNotSmallerCount = 0;
  let failedRecompressionCount = 0;
  const rewrittenObjectReferences: Array<{ pageNumber: number; objectReference: string }> = [];
  const processedFingerprints = new Set<string>();
  const failures: ImageRecompressionFailure[] = [];
  let abandonRecompression = false;

  for (;;) {
    if (abandonRecompression) {
      break;
    }

    const liveDiscovery = discoverImageXObjects(pdfDocument);
    const liveClassification = classifyImageCandidates(liveDiscovery);
    const nextCandidate = liveClassification.candidates
      .filter((candidate): candidate is ClassifiedImageCandidate & { category: "SAFE_RECOMPRESS" } =>
        candidate.category === "SAFE_RECOMPRESS",
      )
      .sort((left, right) => (right.estimatedStreamSize ?? 0) - (left.estimatedStreamSize ?? 0))
      .find((candidate) => !processedFingerprints.has(fingerprintCandidate(candidate)));

    if (!nextCandidate) {
      break;
    }

    const candidate = nextCandidate;
    const candidateFingerprint = fingerprintCandidate(candidate);
    const targetObject = findPdfObjectByReference(pdfDocument, candidate.pageNumber, candidate.objectReference);
    if (!targetObject) {
      failedRecompressionCount += 1;
      failures.push({
        objectReference: candidate.objectReference,
        pageNumber: candidate.pageNumber,
        message: "Image object could not be resolved in the live document",
      });
      processedFingerprints.add(candidateFingerprint);
      continue;
    }

    try {
      if (!targetObject.isIndirect()) {
        failedRecompressionCount += 1;
        failures.push({
          objectReference: candidate.objectReference,
          pageNumber: candidate.pageNumber,
          message: "Image object is not indirect and cannot be rewritten in place",
        });
        processedFingerprints.add(candidateFingerprint);
        continue;
      }

      const originalStreamBytes = readRawStreamBytes(targetObject);
      originalImageBytes += originalStreamBytes.byteLength;

      const { image, pixmap } = loadImagePixmap(pdfDocument, targetObject);
      try {
        const jpegBytes = pixmap.asJPEG(quality);
        if (jpegBytes.byteLength >= originalStreamBytes.byteLength) {
          skippedBecauseNewStreamWasNotSmallerCount += 1;
          continue;
        }

        rewriteTargetImage(pdfDocument, targetObject, jpegBytes);

        const candidateBytes = saveDocumentBytes(pdfDocument);
        const header = getHeaderPreview(new Uint8Array(candidateBytes));
        if (header !== "%PDF-") {
          throw buildFailure("Recompressed output did not start with %PDF-");
        }

        workingBytes = candidateBytes;
        rewrittenObjectReferences.push({
          pageNumber: candidate.pageNumber,
          objectReference: candidate.objectReference,
        });
        successfullyRecompressedCount += 1;
        rewrittenImageBytes += jpegBytes.byteLength;
        processedFingerprints.add(candidateFingerprint);
      } finally {
        pixmap.destroy();
        image.destroy();
      }
    } catch (error) {
      failedRecompressionCount += 1;
      failures.push({
        objectReference: candidate.objectReference,
        pageNumber: candidate.pageNumber,
        message: error instanceof Error ? error.message : String(error),
      });
      processedFingerprints.add(candidateFingerprint);
      abandonRecompression = true;
    } finally {
      targetObject.destroy();
    }
  }

  let finalBytes = workingBytes;
  let usedStructuralFallback = false;

  try {
    const finalHeader = getHeaderPreview(new Uint8Array(finalBytes));
    if (finalHeader !== "%PDF-") {
      throw buildFailure("Final output did not start with %PDF-");
    }

    validateRewrittenImages(
      mupdf,
      finalBytes,
      pageCount,
      rewrittenObjectReferences.map((candidate) => candidate.pageNumber),
    );

    if (finalBytes.byteLength > structuralBytes.byteLength) {
      finalBytes = structuralBytes;
      usedStructuralFallback = true;
    }
  } catch {
    finalBytes = structuralBytes;
    usedStructuralFallback = true;
  }

  const finalPdfSize = finalBytes.byteLength;
  const savedBytes = Math.max(0, structuralBytes.byteLength - finalPdfSize);
  const savedPercent = structuralBytes.byteLength > 0 ? savedBytes / structuralBytes.byteLength : 0;

  return {
    outputBytes: finalBytes,
    pageCount,
    diagnostics: {
      totalImages: classification.totalImages,
      safeRecompressCount: classification.safeRecompressCount,
      successfullyRecompressedCount,
      skippedBecauseNewStreamWasNotSmallerCount,
      failedRecompressionCount,
      unsupportedCount: classification.unsupportedCount,
      originalImageBytes,
      rewrittenImageBytes,
      structuralPdfSize: structuralBytes.byteLength,
      finalPdfSize,
      savedBytes,
      savedPercent,
      usedStructuralFallback,
      rewrittenObjectReferences: rewrittenObjectReferences.map((candidate) => candidate.objectReference),
      failures,
    },
  };
}

export function formatSafeImageRecompressionDiagnostics(diagnostics: ImageRecompressionDiagnostics) {
  return {
    totalImages: diagnostics.totalImages,
    safeRecompressCount: diagnostics.safeRecompressCount,
    successfullyRecompressedCount: diagnostics.successfullyRecompressedCount,
    skippedBecauseNewStreamWasNotSmallerCount: diagnostics.skippedBecauseNewStreamWasNotSmallerCount,
    failedRecompressionCount: diagnostics.failedRecompressionCount,
    unsupportedCount: diagnostics.unsupportedCount,
    originalImageBytes: diagnostics.originalImageBytes,
    rewrittenImageBytes: diagnostics.rewrittenImageBytes,
    structuralPdfSize: diagnostics.structuralPdfSize,
    finalPdfSize: diagnostics.finalPdfSize,
    savedBytes: diagnostics.savedBytes,
    savedPercent: diagnostics.savedPercent,
    usedStructuralFallback: diagnostics.usedStructuralFallback,
    rewrittenObjectReferences: diagnostics.rewrittenObjectReferences,
    failures: diagnostics.failures,
  };
}
