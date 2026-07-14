import type {
  CompressionErrorCode,
  CompressionErrorEvent,
  CompressionProgressEvent,
  CompressionResultEvent,
  CompressionResultMetadata,
  CompressionResultRecord,
  CompressionStartResponse,
} from "../messaging";
import { COMPRESSED_PDF_RECORD_ID } from "../pdf-records";
import type { CompressionOutcome } from "../pdf/compressor";

export type CompressionCompletionFailure = {
  ok: false;
  error: string;
  code: CompressionErrorCode;
};

export type CompressionCompletionSuccess = CompressionStartResponse;

export type CompressionCompletionResult = CompressionCompletionSuccess | CompressionCompletionFailure;

export type CompressionCompletionDependencies = {
  persistResult: (record: CompressionResultRecord) => Promise<CompressionResultRecord>;
  broadcast: (message: CompressionProgressEvent | CompressionResultEvent | CompressionErrorEvent) => void;
};

export type CompressionCompletionContext = {
  recordId?: string;
  timedOut?: boolean;
  cancelled?: boolean;
};

function hasErrorCode(error: unknown): error is { code: string; message?: string } {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

function compressionErrorPayload(
  code: CompressionErrorCode,
  message: string,
  recordId: string | null = COMPRESSED_PDF_RECORD_ID,
): CompressionErrorEvent {
  return {
    type: "compression:error",
    recordId,
    code,
    message,
  };
}

function toCompressionMetadata(result: CompressionResultRecord): CompressionResultMetadata {
  return {
    id: result.id,
    sourceRecordId: result.sourceRecordId,
    fileName: result.fileName,
    mimeType: result.mimeType,
    originalSize: result.originalSize,
    compressedSize: result.compressedSize,
    savedBytes: result.savedBytes,
    savedPercent: result.savedPercent,
    pageCount: result.pageCount,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    status: "complete",
  };
}

export function compressionResultEvent(result: CompressionResultRecord): CompressionResultEvent {
  return {
    type: "compression:result",
    result: toCompressionMetadata(result),
  };
}

export function compressionMetadata(result: CompressionResultRecord): CompressionResultMetadata {
  return toCompressionMetadata(result);
}

function compressionSuccessResponse(result: CompressionResultRecord): CompressionCompletionSuccess {
  const metadata = toCompressionMetadata(result);
  return {
    ok: true,
    recordId: result.id,
    result: metadata,
    details: result.savedBytes > 0 ? "Compression complete" : "Compression complete with no size reduction",
  };
}

function compressionFailure(
  error: unknown,
  context: CompressionCompletionContext,
): CompressionCompletionFailure {
  let code: CompressionErrorCode = "UNKNOWN";
  let message = error instanceof Error ? error.message : "Unknown compression error";

  if (hasErrorCode(error)) {
    code = error.code as CompressionErrorCode;
    message = error.message ?? message;
  } else if (context.timedOut) {
    code = "TIMEOUT";
    message = "Compression timed out";
  } else if (context.cancelled) {
    code = "CANCELLED";
    message = "Compression was cancelled";
  } else if (error instanceof WebAssembly.RuntimeError) {
    code = "WASM_LOAD_FAILED";
  }

  return {
    ok: false,
    code,
    error: message,
  };
}

export async function completeCompressionOutcome(
  outcome: CompressionOutcome,
  deps: CompressionCompletionDependencies,
  context: CompressionCompletionContext = {},
): Promise<CompressionCompletionResult> {
  try {
    const persisted = await deps.persistResult(outcome.result);
    deps.broadcast({
      type: "compression:progress",
      recordId: persisted.id,
      stage: "complete",
      progress: 100,
      pageCount: outcome.pageCount,
      currentPage: outcome.pageCount,
      message: "Compression complete",
    });
    deps.broadcast(compressionResultEvent(persisted));
    return compressionSuccessResponse(persisted);
  } catch (error) {
    const failure = compressionFailure(error, context);
    deps.broadcast(compressionErrorPayload(failure.code, failure.error, context.recordId ?? COMPRESSED_PDF_RECORD_ID));
    return failure;
  }
}
