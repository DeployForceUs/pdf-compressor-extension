import { PDFDocument } from "pdf-lib";
import { unzipSync, zipSync } from "fflate";
import { zipPdfParts } from "../archive/zip-parts";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import {
  normalizeSplitOutputMode,
  type CompressionProgressEvent,
  type SplitArtifactDescriptor,
  type SplitOutputMode,
  type SplitProgressEvent,
  type SplitResultMetadata,
  type SplitWarning,
} from "../messaging";
import { compressBalancedPdf, type CompressionOutcome, type CompressionRequest } from "./compressor";
import { planSplit } from "./split-planner";
import { parsePageRangeExpression, validatePageRangesInInputOrder } from "./page-range-parser";
import { buildSplitPart, type SplitByPagesOutputPart } from "./splitter";
import type { SplitPageRange, SplitStrategy } from "./split-strategies";
import { SplitRuntimeError, toSplitRuntimeError } from "./split-errors";
import { loadMuPdfModule, loadSplitSourceDocument, validateGeneratedSplitPartBytes } from "./split-source-loader";

type AbortChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;
type CompressionProgressReporter = (event: CompressionProgressEvent) => void | Promise<void>;
type CompressionPartRunner = (
  request: CompressionRequest,
  isCancelled: AbortChecker,
  onProgress: CompressionProgressReporter,
) => Promise<CompressionOutcome>;

type CompressionFallbackCode =
  | "COMPRESSION_FAILED_FALLBACK"
  | "COMPRESSED_PART_INVALID_FALLBACK"
  | "COMPRESSED_PART_NOT_SMALLER_FALLBACK";

export type SplitArchiveRequest = {
  inputBytes: ArrayBuffer;
  strategy: SplitStrategy;
  documentName?: string;
  outputMode?: SplitOutputMode;
  compressAfter?: boolean;
  mupdfRuntimeUrl?: string;
};

export type SplitArchiveOutcome = {
  zipBytes?: ArrayBuffer;
  artifacts: SplitArtifactPayload[];
  result: SplitResultMetadata;
};

export type SplitArtifactPayload = SplitArtifactDescriptor & {
  data: ArrayBuffer;
};

export type SplitArchiveDependencies = {
  compressPart?: CompressionPartRunner;
  loadMuPdf?: () => Promise<Awaited<ReturnType<typeof loadMuPdfModule>>>;
};

type SplitArchiveSelection = {
  parts: SplitByPagesOutputPart[];
  warnings: SplitWarning[];
};

type FinalizedParts = {
  parts: SplitByPagesOutputPart[];
  warnings: SplitWarning[];
  compressedPartsCount: number;
  fallbackPartsCount: number;
  originalSplitPartsSize: number;
  finalPartsSize: number;
};

function sanitizeDocumentStem(documentName: string | undefined) {
  const trimmed = (documentName ?? "document").trim();
  const withoutExtension = trimmed.replace(/\.[^./\\]+$/, "");
  const sanitized = withoutExtension.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "");
  return sanitized || "document";
}

function buildZipFilename(documentName: string | undefined) {
  return `${sanitizeDocumentStem(documentName)}_split.zip`;
}

function buildPartZipFilename(partFilename: string) {
  return partFilename.replace(/\.pdf$/i, ".zip");
}

function buildArtifactId(bundleId: string, partNumber: number | null, kind: SplitArtifactDescriptor["kind"]) {
  if (partNumber === null) {
    return bundleId;
  }

  return `${bundleId}:part:${String(partNumber).padStart(3, "0")}:${kind}`;
}

function toZipInput(entries: Array<{ filename: string; bytes: Uint8Array | ArrayBuffer }>) {
  return Object.fromEntries(entries.map((entry) => [entry.filename, entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes)])) as Record<string, Uint8Array>;
}

function validateZipBytes(zipBytes: Uint8Array, expectedFilenames: string[]) {
  if (!zipBytes.byteLength) {
    throw new SplitRuntimeError("ZIP_CREATION_FAILED", "ZIP output is empty");
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch {
    throw new SplitRuntimeError("ZIP_CREATION_FAILED", "ZIP output could not be reopened");
  }

  const actualFilenames = Object.keys(entries);
  if (actualFilenames.length !== expectedFilenames.length) {
    throw new SplitRuntimeError("ZIP_CREATION_FAILED", "ZIP entry count did not match input count");
  }

  for (let index = 0; index < expectedFilenames.length; index += 1) {
    if (actualFilenames[index] !== expectedFilenames[index]) {
      throw new SplitRuntimeError("ZIP_CREATION_FAILED", "ZIP entry order or filenames were not preserved");
    }

    const entryBytes = entries[actualFilenames[index]];
    if (!entryBytes || !entryBytes.byteLength) {
      throw new SplitRuntimeError("ZIP_CREATION_FAILED", "ZIP entry bytes were empty");
    }
  }
}

async function zipEntries(entries: Array<{ filename: string; bytes: Uint8Array | ArrayBuffer }>) {
  if (!entries.length) {
    throw new SplitRuntimeError("ZIP_CREATION_FAILED", "At least one ZIP entry is required");
  }

  const filenames = entries.map((entry) => entry.filename);

  try {
    const zipInput = toZipInput(entries);
    const zipBytes = zipSync(zipInput, {
      level: 6,
    });
    validateZipBytes(zipBytes, filenames);
    return {
      zipBytes,
      filenames,
      entryCount: filenames.length,
    };
  } catch (error) {
    throw new SplitRuntimeError("ZIP_CREATION_FAILED", error instanceof Error ? error.message : "ZIP creation failed");
  }
}

async function emitProgress(onProgress: ProgressReporter | undefined, event: SplitProgressEvent) {
  if (!onProgress) {
    return;
  }

  await onProgress(event);
}

async function checkCancelled(isCancelled: AbortChecker | undefined) {
  if (isCancelled && (await isCancelled())) {
    throw new SplitRuntimeError("CANCELLED", "Split job was cancelled");
  }
}

function buildProgress(
  stage: SplitProgressEvent["stage"],
  progress: number,
  partsCount: number,
  currentPart: number,
  message: string,
  details: Partial<Pick<SplitProgressEvent, "sourceByteSize" | "compressedCandidateByteSize" | "selectedByteSize" | "fallbackUsed">> = {},
): SplitProgressEvent {
  return {
    type: "split:progress",
    recordId: SPLIT_PDF_RECORD_ID,
    stage,
    progress,
    partsCount,
    currentPart,
    message,
    ...details,
  };
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer;
}

async function defaultCompressionRunner(
  request: CompressionRequest,
  isCancelled: AbortChecker,
  onProgress: CompressionProgressReporter,
) {
  return compressBalancedPdf(request, isCancelled, onProgress);
}

async function resolveRangesForResolvedStrategies(
  sourcePageCount: number,
  strategy: SplitStrategy,
): Promise<SplitPageRange[]> {
  switch (strategy.type) {
    case "by-pages": {
      const plan = planSplit({
        totalPages: sourcePageCount,
        strategy,
      });

      if (plan.planningState !== "resolved" || plan.strategy.type !== "by-pages") {
        throw new SplitRuntimeError("SPLIT_FAILED", "Failed to resolve the by-pages split plan");
      }

      return plan.parts.map((part) => part.range);
    }
    case "manual-ranges":
      return validatePageRangesInInputOrder(parsePageRangeExpression(strategy.ranges), sourcePageCount);
    case "by-max-size":
      throw new SplitRuntimeError("SPLIT_FAILED", "by-max-size is resolved through size selection");
    default: {
      const exhausted: never = strategy;
      return exhausted;
    }
  }
}

async function buildResolvedSplitParts(
  sourceDocument: PDFDocument,
  ranges: SplitPageRange[],
  documentName: string | undefined,
  isCancelled: AbortChecker | undefined,
): Promise<SplitByPagesOutputPart[]> {
  const parts: SplitByPagesOutputPart[] = [];

  for (let index = 0; index < ranges.length; index += 1) {
    await checkCancelled(isCancelled);
    parts.push(await buildSplitPart(sourceDocument, ranges[index], documentName, index + 1));
  }

  return parts;
}

async function selectMaxSizeParts(
  sourceDocument: PDFDocument,
  sourcePageCount: number,
  maxPartSizeBytes: number,
  documentName: string | undefined,
  isCancelled: AbortChecker | undefined,
): Promise<SplitArchiveSelection> {
  const selection: SplitArchiveSelection = {
    parts: [],
    warnings: [],
  };

  const plan = planSplit({
    totalPages: sourcePageCount,
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes,
    },
  });

  if (plan.strategy.type !== "by-max-size") {
    throw new SplitRuntimeError("INVALID_MAX_PART_SIZE", "Invalid max size strategy");
  }

  let startPage = 1;
  let partNumber = 1;

  while (startPage <= sourcePageCount) {
    await checkCancelled(isCancelled);

    const candidateCache = new Map<number, SplitByPagesOutputPart>();
    const singlePageRange: SplitPageRange = {
      startPage,
      endPage: startPage,
    };
    const singlePagePart = await buildSplitPart(sourceDocument, singlePageRange, documentName, partNumber);
    candidateCache.set(startPage, singlePagePart);

    if (singlePagePart.bytes.byteLength > maxPartSizeBytes) {
      selection.parts.push(singlePagePart);
      selection.warnings.push({
        code: "SINGLE_PAGE_EXCEEDS_LIMIT",
        pageNumber: startPage,
        actualGeneratedByteSize: singlePagePart.bytes.byteLength,
        requestedMaximumByteSize: maxPartSizeBytes,
        fileName: singlePagePart.filename,
        partNumber,
        oversized: true,
      });

      startPage += 1;
      partNumber += 1;
      continue;
    }

    let bestPart = singlePagePart;
    let low = startPage + 1;
    let high = sourcePageCount;

    while (low <= high) {
      await checkCancelled(isCancelled);

      const mid = Math.floor((low + high) / 2);
      let candidate = candidateCache.get(mid);
      if (!candidate) {
        candidate = await buildSplitPart(
          sourceDocument,
          {
            startPage,
            endPage: mid,
          },
          documentName,
          partNumber,
        );
        candidateCache.set(mid, candidate);
      }

      if (candidate.bytes.byteLength <= maxPartSizeBytes) {
        bestPart = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    while (bestPart.range.endPage < sourcePageCount) {
      await checkCancelled(isCancelled);

      const nextEndPage = bestPart.range.endPage + 1;
      let nextCandidate = candidateCache.get(nextEndPage);
      if (!nextCandidate) {
        nextCandidate = await buildSplitPart(
          sourceDocument,
          {
            startPage,
            endPage: nextEndPage,
          },
          documentName,
          partNumber,
        );
        candidateCache.set(nextEndPage, nextCandidate);
      }

      if (nextCandidate.bytes.byteLength <= maxPartSizeBytes) {
        bestPart = nextCandidate;
        continue;
      }

      break;
    }

    selection.parts.push(bestPart);
    startPage = bestPart.range.endPage + 1;
    partNumber += 1;
  }

  return selection;
}

async function resolveSplitSelection(
  sourceDocument: PDFDocument,
  sourcePageCount: number,
  request: SplitArchiveRequest,
  isCancelled: AbortChecker | undefined,
): Promise<SplitArchiveSelection> {
  switch (request.strategy.type) {
    case "by-pages": {
      const ranges = await resolveRangesForResolvedStrategies(sourcePageCount, request.strategy);
      return {
        parts: await buildResolvedSplitParts(sourceDocument, ranges, request.documentName, isCancelled),
        warnings: [],
      };
    }
    case "manual-ranges": {
      const ranges = await resolveRangesForResolvedStrategies(sourcePageCount, request.strategy);
      return {
        parts: await buildResolvedSplitParts(sourceDocument, ranges, request.documentName, isCancelled),
        warnings: [],
      };
    }
    case "by-max-size":
      return selectMaxSizeParts(sourceDocument, sourcePageCount, request.strategy.maxPartSizeBytes, request.documentName, isCancelled);
    default: {
      const exhausted: never = request.strategy;
      return exhausted;
    }
  }
}

function buildCompressionRequest(
  request: SplitArchiveRequest,
  part: SplitByPagesOutputPart,
  partNumber: number,
): CompressionRequest {
  return {
    input: toArrayBuffer(part.bytes),
    mupdfRuntimeUrl: request.mupdfRuntimeUrl ?? "chrome-extension://test/mupdf.js",
    recordId: `${SPLIT_PDF_RECORD_ID}:part:${partNumber}`,
    sourceRecordId: SPLIT_PDF_RECORD_ID,
    fileName: part.filename,
    mimeType: "application/pdf",
    mode: "Balanced",
    timeoutMs: 30_000,
  };
}

function compressionFallbackWarning(
  code: CompressionFallbackCode,
  part: SplitByPagesOutputPart,
  selectedByteSize: number,
  compressedCandidateByteSize?: number,
): SplitWarning {
  return {
    code,
    partNumber: part.partNumber,
    fileName: part.filename,
    sourceByteSize: part.bytes.byteLength,
    compressedCandidateByteSize,
    selectedByteSize,
    fallbackUsed: true,
  };
}

async function finalizeParts(
  request: SplitArchiveRequest,
  selectedParts: SplitByPagesOutputPart[],
  isCancelled: AbortChecker | undefined,
  onProgress: ProgressReporter | undefined,
  compressionRunner: CompressionPartRunner,
  mupdf: Awaited<ReturnType<typeof loadMuPdfModule>>,
): Promise<FinalizedParts> {
  const finalized: SplitByPagesOutputPart[] = [];
  const warnings: SplitWarning[] = [];
  let compressedPartsCount = 0;
  let fallbackPartsCount = 0;
  let originalSplitPartsSize = 0;
  let finalPartsSize = 0;

  for (let index = 0; index < selectedParts.length; index += 1) {
    const part = selectedParts[index];
    const sourceByteSize = part.bytes.byteLength;
    originalSplitPartsSize += sourceByteSize;

    await checkCancelled(isCancelled);
    await emitProgress(
      onProgress,
      buildProgress(
        "creating-part",
        20 + Math.floor((index / Math.max(selectedParts.length, 1)) * 40),
        selectedParts.length,
        part.partNumber,
        `Creating part ${part.partNumber} of ${selectedParts.length}`,
        {
          sourceByteSize,
        },
      ),
    );

    await emitProgress(
      onProgress,
      buildProgress(
        "validating-part",
        30 + Math.floor((index / Math.max(selectedParts.length, 1)) * 30),
        selectedParts.length,
        part.partNumber,
        `Validated part ${part.partNumber} of ${selectedParts.length}`,
        {
          sourceByteSize,
          selectedByteSize: sourceByteSize,
          fallbackUsed: false,
        },
      ),
    );

    await validateGeneratedSplitPartBytes(part.bytes, part.pageCount, mupdf, part.filename);

    let selectedBytes = part.bytes;
    let compressedCandidateByteSize: number | undefined;
    let fallbackWarning: SplitWarning | null = null;

    if (request.compressAfter) {
      await checkCancelled(isCancelled);
      await emitProgress(
        onProgress,
        buildProgress(
          "compressing-part",
          45 + Math.floor((index / Math.max(selectedParts.length, 1)) * 25),
          selectedParts.length,
          part.partNumber,
          `Compressing part ${part.partNumber} of ${selectedParts.length}`,
          {
            sourceByteSize,
          },
        ),
      );

      let compressedOutcome: CompressionOutcome | null = null;

      try {
        compressedOutcome = await compressionRunner(
          buildCompressionRequest(request, part, index + 1),
          isCancelled ?? (() => false),
          async () => undefined,
        );
      } catch (error) {
        const runtimeError = toSplitRuntimeError(error);
        if (runtimeError.code === "CANCELLED") {
          throw runtimeError;
        }

        fallbackWarning = compressionFallbackWarning("COMPRESSION_FAILED_FALLBACK", part, sourceByteSize);
      }

      await checkCancelled(isCancelled);

      if (compressedOutcome && !fallbackWarning) {
        compressedCandidateByteSize = compressedOutcome.outputBytes.byteLength;
        const candidateBytes = new Uint8Array(compressedOutcome.outputBytes);

        await checkCancelled(isCancelled);

        try {
          await validateGeneratedSplitPartBytes(candidateBytes, part.pageCount, mupdf, part.filename);
        } catch {
          fallbackWarning = compressionFallbackWarning(
            "COMPRESSED_PART_INVALID_FALLBACK",
            part,
            sourceByteSize,
            compressedCandidateByteSize,
          );
        }

        if (!fallbackWarning && compressedCandidateByteSize >= sourceByteSize) {
          fallbackWarning = compressionFallbackWarning(
            "COMPRESSED_PART_NOT_SMALLER_FALLBACK",
            part,
            sourceByteSize,
            compressedCandidateByteSize,
          );
        }

        if (!fallbackWarning) {
          selectedBytes = candidateBytes;
          compressedPartsCount += 1;
        }
      }

      if (fallbackWarning) {
        fallbackPartsCount += 1;
        warnings.push(fallbackWarning);
      }
    }

    if (request.compressAfter) {
      await emitProgress(
        onProgress,
        buildProgress(
          "validating-part",
          60 + Math.floor((index / Math.max(selectedParts.length, 1)) * 20),
          selectedParts.length,
          part.partNumber,
          `Validated part ${part.partNumber} of ${selectedParts.length}`,
          {
            sourceByteSize,
            selectedByteSize: selectedBytes.byteLength,
            fallbackUsed: fallbackWarning !== null,
            compressedCandidateByteSize,
          },
        ),
      );
    }

    finalPartsSize += selectedBytes.byteLength;
    finalized.push({
      ...part,
      bytes: selectedBytes,
    });
  }

  return {
    parts: finalized,
    warnings,
    compressedPartsCount,
    fallbackPartsCount,
    originalSplitPartsSize,
    finalPartsSize,
  };
}

type ArtifactBuildResult = {
  artifacts: SplitArtifactPayload[];
  totalArtifactSize: number;
  zipBytes?: ArrayBuffer;
};

function buildSplitResultMetadata(
  request: SplitArchiveRequest,
  selection: SplitArchiveSelection,
  finalized: FinalizedParts,
  artifacts: SplitArtifactPayload[],
  totalArtifactSize: number,
  outputMode: SplitOutputMode,
): SplitResultMetadata {
  const primaryArtifact = artifacts[0] ?? null;

  return {
    zipBlobId: SPLIT_PDF_RECORD_ID,
    outputMode,
    artifactIds: artifacts.map((artifact) => artifact.id),
    artifacts: artifacts.map<SplitArtifactDescriptor>((artifact) => ({
      id: artifact.id,
      bundleId: artifact.bundleId,
      kind: artifact.kind,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      byteLength: artifact.byteLength,
      partNumber: artifact.partNumber,
      pageStart: artifact.pageStart,
      pageEnd: artifact.pageEnd,
      status: artifact.status,
    })),
    artifactCount: artifacts.length,
    fileName: primaryArtifact?.filename ?? buildZipFilename(request.documentName),
    mimeType: outputMode === "single-zip" && primaryArtifact ? primaryArtifact.mimeType : null,
    size: totalArtifactSize,
    compressAfterRequested: request.compressAfter === true,
    originalSplitPartsSize: finalized.originalSplitPartsSize,
    finalPartsSize: finalized.finalPartsSize,
    compressedPartsCount: finalized.compressedPartsCount,
    fallbackPartsCount: finalized.fallbackPartsCount,
    totalBytesSaved: Math.max(0, request.inputBytes.byteLength - totalArtifactSize),
    originalSize: request.inputBytes.byteLength,
    totalPartsSize: finalized.finalPartsSize,
    partsCount: finalized.parts.length,
    strategy: request.strategy,
    warnings: [...selection.warnings, ...finalized.warnings],
    status: "complete",
  };
}

async function buildArtifactsForOutputMode(
  request: SplitArchiveRequest,
  finalizedParts: SplitByPagesOutputPart[],
  outputMode: SplitOutputMode,
  isCancelled: AbortChecker | undefined,
): Promise<ArtifactBuildResult> {
  const bundleId = SPLIT_PDF_RECORD_ID;

  switch (outputMode) {
    case "single-zip": {
      await checkCancelled(isCancelled);
      const archive = await zipPdfParts(
        finalizedParts.map((part) => ({
          filename: part.filename,
          bytes: part.bytes,
        })),
      );

      const zipBytes = archive.zipBytes.slice().buffer;
      return {
        zipBytes,
        totalArtifactSize: zipBytes.byteLength,
        artifacts: [
          {
            id: bundleId,
            bundleId,
            kind: "zip",
            filename: buildZipFilename(request.documentName),
            mimeType: "application/zip",
            byteLength: zipBytes.byteLength,
            pageStart: finalizedParts[0]?.range.startPage,
            pageEnd: finalizedParts[finalizedParts.length - 1]?.range.endPage,
            partNumber: undefined,
            status: "complete",
            data: zipBytes,
          },
        ],
      };
    }
    case "individual-pdfs": {
      const artifacts: SplitArtifactPayload[] = [];
      for (const part of finalizedParts) {
        await checkCancelled(isCancelled);
        const data = part.bytes.slice().buffer;
        artifacts.push({
          id: buildArtifactId(bundleId, part.partNumber, "pdf"),
          bundleId,
          kind: "pdf",
          filename: part.filename,
          mimeType: "application/pdf",
          byteLength: data.byteLength,
          partNumber: part.partNumber,
          pageStart: part.range.startPage,
          pageEnd: part.range.endPage,
          status: "complete",
          data,
        });
      }

      return {
        artifacts,
        totalArtifactSize: artifacts.reduce((total, artifact) => total + artifact.byteLength, 0),
      };
    }
    case "separate-zips": {
      const artifacts: SplitArtifactPayload[] = [];

      for (const part of finalizedParts) {
        await checkCancelled(isCancelled);
        const archive = await zipEntries([
          {
            filename: part.filename,
            bytes: part.bytes,
          },
        ]);

        const zipBytes = archive.zipBytes.slice().buffer;
        artifacts.push({
          id: buildArtifactId(bundleId, part.partNumber, "zip"),
          bundleId,
          kind: "zip",
          filename: buildPartZipFilename(part.filename),
          mimeType: "application/zip",
          byteLength: zipBytes.byteLength,
          partNumber: part.partNumber,
          pageStart: part.range.startPage,
          pageEnd: part.range.endPage,
          status: "complete",
          data: zipBytes,
        });
      }

      return {
        artifacts,
        totalArtifactSize: artifacts.reduce((total, artifact) => total + artifact.byteLength, 0),
      };
    }
    default: {
      const exhausted: never = outputMode;
      return exhausted;
    }
  }
}

export async function createSplitZipArchive(
  request: SplitArchiveRequest,
  isCancelled?: AbortChecker,
  onProgress?: ProgressReporter,
  deps: SplitArchiveDependencies = {},
): Promise<SplitArchiveOutcome> {
  if (request.compressAfter && !request.mupdfRuntimeUrl && !deps.compressPart) {
    throw new SplitRuntimeError("SPLIT_FAILED", "compressAfter requires mupdfRuntimeUrl");
  }

  await checkCancelled(isCancelled);

  const loadMuPdf = deps.loadMuPdf ?? (() => loadMuPdfModule(request.mupdfRuntimeUrl));
  let mupdfPromise: ReturnType<typeof loadMuPdf> | null = null;
  const loadMuPdfOnce = () => (mupdfPromise ??= loadMuPdf());

  const sourceLoad = await loadSplitSourceDocument(request.inputBytes, {
    loadMuPdf: loadMuPdfOnce,
  });
  const sourceDocument = sourceLoad.pdfDocument;
  const mupdf = await loadMuPdfOnce();

  const sourcePageCount = sourceDocument.getPageCount();
  await checkCancelled(isCancelled);

  const selection = await resolveSplitSelection(sourceDocument, sourcePageCount, request, isCancelled);
  const finalized = await finalizeParts(
    request,
    selection.parts,
    isCancelled,
    onProgress,
    deps.compressPart ?? defaultCompressionRunner,
    mupdf,
  );

  const partsCount = finalized.parts.length;

  await checkCancelled(isCancelled);
  const outputMode = normalizeSplitOutputMode(request.outputMode);
  await emitProgress(
    onProgress,
    buildProgress(
      outputMode === "single-zip" ? "creating-zip" : "creating-artifacts",
      90,
      partsCount,
      partsCount,
      outputMode === "single-zip" ? "Creating ZIP archive" : "Creating output artifacts",
    ),
  );

  const artifactBuild = await buildArtifactsForOutputMode(request, finalized.parts, outputMode, isCancelled);
  const result = buildSplitResultMetadata(request, selection, finalized, artifactBuild.artifacts, artifactBuild.totalArtifactSize, outputMode);

  return {
    zipBytes: artifactBuild.zipBytes,
    artifacts: artifactBuild.artifacts,
    result,
  };
}
