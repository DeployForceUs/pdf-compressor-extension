import {
  normalizeSplitOutputMode,
  type PdfRecord,
  type SplitProgressEvent,
  type SplitStartResponse,
  type SplitResultBundle,
  type SplitArtifactRecord,
} from "../messaging";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import type { CompressionWorkerApi } from "./worker";
import { SplitRuntimeError, toSplitRuntimeError } from "../pdf/split-errors";
import type { SplitArchiveRequest } from "../pdf/split-archive";
import type { SplitLocalRequest, SplitResultMetadata } from "../messaging";
import { buildSplitResultMetadataFromBundle } from "../storage/pdf-split-bundles-db";

type CancellationChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;
type SplitWorkerGateway = Pick<CompressionWorkerApi, "split">;
export type SplitRuntimeRequest = {
  strategy: SplitLocalRequest["strategy"];
  outputMode?: SplitLocalRequest["outputMode"];
  compressAfter?: boolean;
};

export type SplitRuntimeDependencies = {
  workerApi: SplitWorkerGateway;
  persistResult: (bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) => Promise<SplitResultBundle>;
  isCancelled: CancellationChecker;
  onProgress: ProgressReporter;
};

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
  const outputMode = normalizeSplitOutputMode(request.outputMode);
  const splitRequest: SplitArchiveRequest = {
    inputBytes,
    strategy: request.strategy,
    documentName: inputRecord.name,
    outputMode,
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
  const artifacts = outcome.artifacts.map<SplitArtifactRecord>((artifact) => ({
    ...artifact,
    data: artifact.data,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  }));

  const bundle: SplitResultBundle = {
    id: outcome.result.zipBlobId,
    sourceRecordId: inputRecord.id,
    sourceFileName: inputRecord.name,
    outputMode: outcome.result.outputMode,
    strategy: outcome.result.strategy,
    partsCount: outcome.result.partsCount,
    originalSize: outcome.result.originalSize,
    totalArtifactSize: outcome.result.size,
    warnings: outcome.result.warnings,
    artifactIds: [...outcome.result.artifactIds],
    compressAfterRequested: request.compressAfter === true,
    originalSplitPartsSize: outcome.result.originalSplitPartsSize,
    finalPartsSize: outcome.result.finalPartsSize,
    compressedPartsCount: outcome.result.compressedPartsCount,
    fallbackPartsCount: outcome.result.fallbackPartsCount,
    totalBytesSaved: outcome.result.totalBytesSaved,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  };

  let persisted: SplitResultBundle;
  try {
    persisted = await deps.persistResult(bundle, artifacts);
  } catch (error) {
    throw toSplitRuntimeError(error, "STORAGE_QUOTA_EXCEEDED");
  }

  const result: SplitResultMetadata = buildSplitResultMetadataFromBundle(persisted, artifacts);

  await emitProgress(deps.onProgress, {
    type: "split:progress",
    recordId: persisted.id,
    stage: "complete",
    progress: 100,
    partsCount: persisted.partsCount,
    currentPart: persisted.partsCount,
    message: "Split complete",
  });

  return {
    ok: true,
    zipBlobId: result.zipBlobId,
    result,
    details: "Split ZIP archive created",
  };
}
