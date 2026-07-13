import type { PdfRecord, SplitProgressEvent, SplitStartResponse } from "../messaging";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import type { CompressionWorkerApi } from "./worker";
import { SplitRuntimeError, toSplitRuntimeError } from "../pdf/split-errors";
import type { SplitArchiveRequest } from "../pdf/split-archive";
import type { SplitResultRecord, SplitLocalRequest, SplitResultMetadata } from "../messaging";

type CancellationChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;
type SplitWorkerGateway = Pick<CompressionWorkerApi, "split">;
export type SplitRuntimeRequest = {
  strategy: SplitLocalRequest["strategy"];
  compressAfter?: boolean;
};

export type SplitRuntimeDependencies = {
  workerApi: SplitWorkerGateway;
  persistResult: (record: SplitResultRecord) => Promise<SplitResultRecord>;
  isCancelled: CancellationChecker;
  onProgress: ProgressReporter;
};

function toSplitMetadata(record: SplitResultRecord): SplitResultMetadata {
  return {
    zipBlobId: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.data.byteLength,
    compressAfterRequested: record.compressAfterRequested,
    originalSplitPartsSize: record.originalSplitPartsSize,
    finalPartsSize: record.finalPartsSize,
    compressedPartsCount: record.compressedPartsCount,
    fallbackPartsCount: record.fallbackPartsCount,
    totalBytesSaved: record.totalBytesSaved,
    originalSize: record.originalSize,
    totalPartsSize: record.totalPartsSize,
    partsCount: record.partsCount,
    strategy: record.strategy,
    warnings: record.warnings ?? [],
    status: "complete",
  };
}

async function emitProgress(onProgress: ProgressReporter, event: SplitProgressEvent) {
  await onProgress(event);
}

function toUint8Array(data: number[]) {
  return Uint8Array.from(data);
}

export async function runSplitJob(
  inputRecord: PdfRecord,
  request: SplitRuntimeRequest,
  deps: SplitRuntimeDependencies,
): Promise<SplitStartResponse> {
  if (!inputRecord) {
    throw new SplitRuntimeError("INVALID_PDF", "No selected PDF record is available");
  }

  if (await deps.isCancelled()) {
    throw new SplitRuntimeError("CANCELLED", "Split job was cancelled before processing started");
  }

  await emitProgress(deps.onProgress, {
    type: "split:progress",
    recordId: SPLIT_PDF_RECORD_ID,
    stage: "validating",
    progress: 0,
    partsCount: 0,
    currentPart: 0,
    message: "Validating source PDF",
  });

  const inputBytes = toUint8Array(inputRecord.data).buffer;
  const splitRequest: SplitArchiveRequest = {
    inputBytes,
    strategy: request.strategy,
    documentName: inputRecord.name,
    compressAfter: request.compressAfter,
  };

  await emitProgress(deps.onProgress, {
    type: "split:progress",
    recordId: SPLIT_PDF_RECORD_ID,
    stage: "planning-parts",
    progress: 10,
    partsCount: 0,
    currentPart: 0,
    message: "Planning split parts",
  });

  let outcome;
  try {
    outcome = await deps.workerApi.split(splitRequest, deps.isCancelled, deps.onProgress);
  } catch (error) {
    throw toSplitRuntimeError(error);
  }

  if (await deps.isCancelled()) {
    throw new SplitRuntimeError("CANCELLED", "Split job was cancelled before persistence");
  }

  await emitProgress(deps.onProgress, {
    type: "split:progress",
    recordId: SPLIT_PDF_RECORD_ID,
    stage: "persisting",
    progress: 95,
    partsCount: outcome.result.partsCount,
    currentPart: outcome.result.partsCount,
    message: "Persisting split ZIP result",
  });

  const now = Date.now();
  let persisted: SplitResultRecord;
  try {
    persisted = await deps.persistResult({
      id: outcome.result.zipBlobId,
      sourceRecordId: inputRecord.id,
      fileName: outcome.result.fileName,
      mimeType: outcome.result.mimeType,
      compressAfterRequested: request.compressAfter === true,
      originalSplitPartsSize: outcome.result.originalSplitPartsSize,
      finalPartsSize: outcome.result.finalPartsSize,
      compressedPartsCount: outcome.result.compressedPartsCount,
      fallbackPartsCount: outcome.result.fallbackPartsCount,
      totalBytesSaved: outcome.result.totalBytesSaved,
      originalSize: outcome.result.originalSize,
      totalPartsSize: outcome.result.totalPartsSize,
      partsCount: outcome.result.partsCount,
      strategy: outcome.result.strategy,
      warnings: outcome.result.warnings,
      data: outcome.zipBytes,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    throw toSplitRuntimeError(error, "STORAGE_QUOTA_EXCEEDED");
  }

  await emitProgress(deps.onProgress, {
    type: "split:progress",
    recordId: persisted.id,
    stage: "complete",
    progress: 100,
    partsCount: persisted.partsCount,
    currentPart: persisted.partsCount,
    message: "Split complete",
  });

  const result = toSplitMetadata(persisted);
  return {
    ok: true,
    zipBlobId: result.zipBlobId,
    result,
    details: "Split ZIP archive created",
  };
}
