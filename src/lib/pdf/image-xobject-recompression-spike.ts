import type { ClassifiedImageCandidate } from "./image-xobject-classifier";
import { classifyImageCandidates } from "./image-xobject-classifier";
import { discoverImageXObjects } from "./image-xobject-discovery";

type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfPdfDocument = InstanceType<MuPdfNamespace["PDFDocument"]>;
type MuPdfPdfObject = InstanceType<MuPdfNamespace["PDFObject"]>;
type MuPdfBuffer = InstanceType<MuPdfNamespace["Buffer"]>;
type MuPdfImage = InstanceType<MuPdfNamespace["Image"]>;
type MuPdfPixmap = InstanceType<MuPdfNamespace["Pixmap"]>;

export type SingleImageRecompressionSpikeRequest = {
  input: ArrayBuffer;
  mupdfRuntimeUrl: string;
  targetObjectReference?: string;
  quality?: number;
};

export type SingleImageRecompressionSpikeResult = {
  selectedCandidate: ClassifiedImageCandidate;
  pageCount: number;
  inputBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
  outputHeader: string;
  outputBuffer: ArrayBuffer;
  imageLoadVerified: boolean;
};

export type SingleImageRecompressionSpikeFailure = {
  code:
    | "NO_SAFE_CANDIDATE"
    | "TARGET_NOT_FOUND"
    | "IMAGE_LOAD_FAILED"
    | "JPEG_ENCODE_FAILED"
    | "INVALID_OUTPUT"
    | "WASM_LOAD_FAILED";
  message: string;
};

function compressionFailure(
  code: SingleImageRecompressionSpikeFailure["code"],
  message: string,
): SingleImageRecompressionSpikeFailure {
  return { code, message };
}

function validateMuPdfRuntimeUrl(mupdfRuntimeUrl: string) {
  if (!mupdfRuntimeUrl.startsWith("chrome-extension://")) {
    throw compressionFailure("WASM_LOAD_FAILED", "MuPDF runtime URL must be an absolute extension URL");
  }
}

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

function pickSingleSafeCandidate(
  classification: ReturnType<typeof classifyImageCandidates>,
  targetObjectReference?: string,
) {
  const safeCandidates = classification.candidates.filter((candidate) => candidate.category === "SAFE_RECOMPRESS");
  if (safeCandidates.length === 0) {
    throw compressionFailure("NO_SAFE_CANDIDATE", "No SAFE_RECOMPRESS image candidate is available");
  }

  if (targetObjectReference) {
    const targeted = safeCandidates.find((candidate) => candidate.objectReference === targetObjectReference);
    if (!targeted) {
      throw compressionFailure("NO_SAFE_CANDIDATE", `No safe candidate matched ${targetObjectReference}`);
    }

    return targeted;
  }

  return safeCandidates[0];
}

function rewriteTargetImage(
  pdfDocument: MuPdfPdfDocument,
  targetObject: MuPdfPdfObject,
  jpegBytes: Uint8Array,
) {
  targetObject.writeRawStream(jpegBytes);
  try {
    targetObject.put("Filter", pdfDocument.newName("DCTDecode"));
  } catch {
    throw compressionFailure("JPEG_ENCODE_FAILED", "Failed to update image filter to DCTDecode");
  }

  try {
    targetObject.delete("DecodeParms");
  } catch {
    // Best effort. Some streams have no decode params.
  }

  try {
    targetObject.put("Length", pdfDocument.newInteger(jpegBytes.byteLength));
  } catch {
    // Best effort. MuPDF will rewrite the stream length during save if needed.
  }
}

export async function runSingleImageRecompressionSpike(
  mupdf: MuPdfNamespace,
  request: SingleImageRecompressionSpikeRequest,
): Promise<SingleImageRecompressionSpikeResult> {
  validateMuPdfRuntimeUrl(request.mupdfRuntimeUrl);

  if (typeof WebAssembly === "undefined") {
    throw compressionFailure("WASM_LOAD_FAILED", "WebAssembly is not supported in this browser context");
  }

  const document = mupdf.Document.openDocument(request.input);
  const pdfDocument = document.asPDF();

  if (!pdfDocument) {
    document.destroy();
    throw compressionFailure("INVALID_OUTPUT", "Selected input is not a PDF document");
  }

  const pageCount = document.countPages();
  const discovery = discoverImageXObjects(pdfDocument);
  const classification = classifyImageCandidates(discovery);
  const selectedCandidate = pickSingleSafeCandidate(classification, request.targetObjectReference);

  const targetObject = findPdfObjectByReference(
    pdfDocument,
    selectedCandidate.pageNumber,
    selectedCandidate.objectReference,
  );

  if (!targetObject) {
    document.destroy();
    throw compressionFailure(
      "TARGET_NOT_FOUND",
      `Could not resolve image object ${selectedCandidate.objectReference} on page ${selectedCandidate.pageNumber}`,
    );
  }

  let image: MuPdfImage | null = null;
  let pixmap: MuPdfPixmap | null = null;
  let outputBuffer: MuPdfBuffer | null = null;
  let verifiedDocument: MuPdfPdfDocument | null = null;

  try {
    image = pdfDocument.loadImage(targetObject);
    pixmap = image.toPixmap();

    const jpegBytes = pixmap.asJPEG(request.quality ?? 75);
    rewriteTargetImage(pdfDocument, targetObject, jpegBytes);

    outputBuffer = pdfDocument.saveToBuffer({ garbage: 4 });
    const outputBytesView = outputBuffer.asUint8Array();
    const outputBufferBytes = outputBytesView.slice().buffer;
    const outputHeader = getHeaderPreview(new Uint8Array(outputBufferBytes));

    if (outputHeader !== "%PDF-") {
      throw compressionFailure("INVALID_OUTPUT", "MuPDF returned data that is not a PDF");
    }

    verifiedDocument = mupdf.Document.openDocument(outputBufferBytes).asPDF();
    if (!verifiedDocument) {
      throw compressionFailure("INVALID_OUTPUT", "Reopened output is not a PDF document");
    }
    const outputPageCount = verifiedDocument.countPages();
    if (outputPageCount !== pageCount) {
      throw compressionFailure(
        "INVALID_OUTPUT",
        `Output page count changed from ${pageCount} to ${outputPageCount}`,
      );
    }

    const verifiedTarget = findPdfObjectByReference(
      verifiedDocument,
      selectedCandidate.pageNumber,
      selectedCandidate.objectReference,
    );

    if (!verifiedTarget) {
      throw compressionFailure(
        "INVALID_OUTPUT",
        `Rewritten image ${selectedCandidate.objectReference} could not be reopened`,
      );
    }

    let verifiedImage: MuPdfImage | null = null;
    try {
      verifiedImage = verifiedDocument.loadImage(verifiedTarget);
      const verifiedPixmap = verifiedImage.toPixmap();
      verifiedPixmap.destroy();
    } finally {
      verifiedImage?.destroy();
      verifiedTarget.destroy();
    }

    const inputBytes = request.input.byteLength;
    const outputBytes = outputBufferBytes.byteLength;
    const savedBytes = Math.max(0, inputBytes - outputBytes);
    const savedPercent = inputBytes > 0 ? savedBytes / inputBytes : 0;

    return {
      selectedCandidate,
      pageCount,
      inputBytes,
      outputBytes,
      savedBytes,
      savedPercent,
      outputHeader,
      outputBuffer: outputBufferBytes,
      imageLoadVerified: true,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      throw error;
    }

    if (error instanceof WebAssembly.RuntimeError) {
      throw compressionFailure("WASM_LOAD_FAILED", error.message);
    }

    if (error instanceof Error) {
      throw compressionFailure("INVALID_OUTPUT", error.message);
    }

    throw compressionFailure("INVALID_OUTPUT", "Unknown recompression spike error");
  } finally {
    verifiedDocument?.destroy();
    outputBuffer?.destroy();
    pixmap?.destroy();
    image?.destroy();
    targetObject.destroy();
    document.destroy();
  }
}
