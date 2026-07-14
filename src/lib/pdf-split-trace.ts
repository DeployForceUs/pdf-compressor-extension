import type { SplitOutputMode } from "./split-output-mode";

export const PDF_SPLIT_TRACE_PREFIX = "[PDF_SPLIT_TRACE]";
export const PDF_SPLIT_TRACE_JOB_ID = "split-pdf";

type SplitTraceDetails = {
  jobId?: string | null;
  outputMode?: SplitOutputMode | null;
  stage: string;
  workerLifecycle?: string | null;
  messageDirection?: string | null;
  success: boolean;
  error?: unknown;
  details?: Record<string, unknown>;
};

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }

  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; message?: unknown };
    return {
      errorName: typeof candidate.name === "string" ? candidate.name : null,
      errorMessage: typeof candidate.message === "string" ? candidate.message : String(error),
    };
  }

  return {
    errorName: error === undefined || error === null ? null : typeof error,
    errorMessage: error === undefined || error === null ? null : String(error),
  };
}

export function tracePdfSplit({
  jobId = PDF_SPLIT_TRACE_JOB_ID,
  outputMode = null,
  stage,
  workerLifecycle = null,
  messageDirection = null,
  success,
  error,
  details = {},
}: SplitTraceDetails) {
  const payload = {
    timestamp: new Date().toISOString(),
    jobId,
    outputMode,
    stage,
    workerLifecycle,
    messageDirection,
    success,
    ...errorDetails(error),
    ...details,
  };

  if (success) {
    console.info(PDF_SPLIT_TRACE_PREFIX, payload);
  } else {
    console.error(PDF_SPLIT_TRACE_PREFIX, payload);
  }
}
