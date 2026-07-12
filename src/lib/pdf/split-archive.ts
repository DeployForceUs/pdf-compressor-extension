import { PDFDocument } from "pdf-lib";
import { zipPdfParts } from "../archive/zip-parts";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import type { SplitProgressEvent, SplitResultMetadata } from "../messaging";
import { planSplit } from "./split-planner";
import { parsePageRangeExpression, validatePageRangesInInputOrder } from "./page-range-parser";
import { formatSplitFilename, splitPdfPartsFromRanges } from "./splitter";
import type { SplitStrategy, SplitPageRange } from "./split-strategies";
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

async function resolveRangesForStrategy(sourcePageCount: number, strategy: SplitStrategy): Promise<SplitPageRange[]> {
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
      throw new SplitRuntimeError("INVALID_MAX_PART_SIZE", "by-max-size split is not implemented in Slice 6A", {
        strategy,
      });
    default: {
      const exhausted: never = strategy;
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
    throw new SplitRuntimeError("SPLIT_FAILED", "compressAfter is not implemented in Slice 6A");
  }

  await checkCancelled(isCancelled);

  let sourceDocument!: PDFDocument;
  try {
    sourceDocument = await PDFDocument.load(new Uint8Array(request.inputBytes));
  } catch (error) {
    throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", { cause: error instanceof Error ? error.message : String(error) });
  }

  const sourcePageCount = sourceDocument.getPageCount();
  await checkCancelled(isCancelled);

  const ranges = await resolveRangesForStrategy(sourcePageCount, request.strategy);
  const partsCount = ranges.length;
  const collectedParts: Array<{ filename: string; bytes: Uint8Array; range: SplitPageRange; partNumber: number; pageCount: number }> = [];

  let totalPartsSize = 0;
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const partNumber = index + 1;

    await checkCancelled(isCancelled);
    await emitProgress(
      onProgress,
      buildProgress("creating-part", 20 + Math.floor((index / Math.max(partsCount, 1)) * 40), partsCount, partNumber, `Creating part ${partNumber} of ${partsCount}`),
    );

    const [part] = await splitPdfPartsFromRanges(sourceDocument, [range], request.documentName);
    const normalizedPart = {
      ...part,
      partNumber,
      filename: formatSplitFilename(request.documentName, partNumber, range),
    };
    collectedParts.push(normalizedPart);
    totalPartsSize += normalizedPart.bytes.byteLength;

    await emitProgress(
      onProgress,
      buildProgress("validating-part", 35 + Math.floor((index / Math.max(partsCount, 1)) * 40), partsCount, partNumber, `Validated part ${partNumber} of ${partsCount}`),
    );
  }

  await checkCancelled(isCancelled);
  await emitProgress(onProgress, buildProgress("creating-zip", 90, partsCount, partsCount, "Creating ZIP archive"));

  let zipBytes: Uint8Array;
  try {
    const archive = await zipPdfParts(collectedParts.map((part) => ({ filename: part.filename, bytes: part.bytes })));
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
    status: "complete",
  };

  return {
    zipBytes: zipArrayBuffer,
    result,
  };
}
