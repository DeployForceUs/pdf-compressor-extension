import { PDFDocument } from "pdf-lib";
import { zipPdfParts } from "../archive/zip-parts";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import type { SplitProgressEvent, SplitResultMetadata, SplitWarning } from "../messaging";
import { planSplit } from "./split-planner";
import { parsePageRangeExpression, validatePageRangesInInputOrder } from "./page-range-parser";
import { buildSplitPart, type SplitByPagesOutputPart } from "./splitter";
import type { SplitPageRange, SplitStrategy } from "./split-strategies";
import { SplitRuntimeError, toSplitRuntimeError } from "./split-errors";

type AbortChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;

export type SplitArchiveRequest = {
  inputBytes: ArrayBuffer;
  strategy: SplitStrategy;
  documentName?: string;
  compressAfter?: boolean;
};

export type SplitArchiveOutcome = {
  zipBytes: ArrayBuffer;
  result: SplitResultMetadata;
};

type SplitArchiveSelection = {
  parts: SplitByPagesOutputPart[];
  warnings: SplitWarning[];
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
): SplitProgressEvent {
  return {
    type: "split:progress",
    recordId: SPLIT_PDF_RECORD_ID,
    stage,
    progress,
    partsCount,
    currentPart,
    message,
  };
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

async function measurePart(
  sourceDocument: PDFDocument,
  range: SplitPageRange,
  documentName: string | undefined,
  partNumber: number,
) {
  return buildSplitPart(sourceDocument, range, documentName, partNumber);
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

    const singlePageRange: SplitPageRange = {
      startPage,
      endPage: startPage,
    };
    const candidateCache = new Map<number, Awaited<ReturnType<typeof measurePart>>>();
    const singlePagePart = await measurePart(sourceDocument, singlePageRange, documentName, partNumber);
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
        candidate = await measurePart(
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
        nextCandidate = await measurePart(
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
      const parts: SplitArchiveSelection["parts"] = [];

      for (let index = 0; index < ranges.length; index += 1) {
        await checkCancelled(isCancelled);
        parts.push(await buildSplitPart(sourceDocument, ranges[index], request.documentName, index + 1));
      }

      return {
        parts,
        warnings: [],
      };
    }
    case "manual-ranges": {
      const ranges = await resolveRangesForResolvedStrategies(sourcePageCount, request.strategy);
      const parts: SplitArchiveSelection["parts"] = [];

      for (let index = 0; index < ranges.length; index += 1) {
        await checkCancelled(isCancelled);
        parts.push(await buildSplitPart(sourceDocument, ranges[index], request.documentName, index + 1));
      }

      return {
        parts,
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

export async function createSplitZipArchive(
  request: SplitArchiveRequest,
  isCancelled?: AbortChecker,
  onProgress?: ProgressReporter,
): Promise<SplitArchiveOutcome> {
  if (request.compressAfter) {
    throw new SplitRuntimeError("SPLIT_FAILED", "compressAfter is not implemented in Slice 7");
  }

  await checkCancelled(isCancelled);

  let sourceDocument!: PDFDocument;
  try {
    sourceDocument = await PDFDocument.load(new Uint8Array(request.inputBytes));
  } catch (error) {
    throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const sourcePageCount = sourceDocument.getPageCount();
  await checkCancelled(isCancelled);

  const selection = await resolveSplitSelection(sourceDocument, sourcePageCount, request, isCancelled);
  const partsCount = selection.parts.length;
  const totalPartsSize = selection.parts.reduce((total, part) => total + part.bytes.byteLength, 0);

  for (let index = 0; index < selection.parts.length; index += 1) {
    const part = selection.parts[index];
    await emitProgress(
      onProgress,
      buildProgress(
        "creating-part",
        20 + Math.floor((index / Math.max(partsCount, 1)) * 40),
        partsCount,
        part.partNumber,
        `Creating part ${part.partNumber} of ${partsCount}`,
      ),
    );
    await emitProgress(
      onProgress,
      buildProgress(
        "validating-part",
        35 + Math.floor((index / Math.max(partsCount, 1)) * 40),
        partsCount,
        part.partNumber,
        `Validated part ${part.partNumber} of ${partsCount}`,
      ),
    );
  }

  await checkCancelled(isCancelled);
  await emitProgress(onProgress, buildProgress("creating-zip", 90, partsCount, partsCount, "Creating ZIP archive"));

  let zipBytes: Uint8Array;
  try {
    const archive = await zipPdfParts(selection.parts.map((part) => ({ filename: part.filename, bytes: part.bytes })));
    zipBytes = archive.zipBytes;
  } catch (error) {
    throw toSplitRuntimeError(error, "ZIP_CREATION_FAILED");
  }

  const zipArrayBuffer = zipBytes.slice().buffer;
  const result: SplitArchiveOutcome["result"] = {
    zipBlobId: SPLIT_PDF_RECORD_ID,
    fileName: buildZipFilename(request.documentName),
    mimeType: "application/zip",
    size: zipArrayBuffer.byteLength,
    originalSize: request.inputBytes.byteLength,
    totalPartsSize,
    partsCount,
    strategy: request.strategy,
    warnings: selection.warnings,
    status: "complete",
  };

  return {
    zipBytes: zipArrayBuffer,
    result,
  };
}
