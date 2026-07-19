export const API_VERSION = "1.0";
export const SERVICE_VERSION = "0.3.0";

import { ENGINE_LIMITS } from "./processing-config.mjs";
import { detectRuntimeCapabilities } from "./runtime-capabilities.mjs";

export function createHealthResponse({
  processorVersion = null,
  runtimeCapabilities = detectRuntimeCapabilities(),
} = {}) {
  const processingAvailable = Boolean(processorVersion);
  return {
    status: "healthy",
    readiness: processingAvailable ? "ready" : "blocked",
    apiVersion: API_VERSION,
    serviceVersion: SERVICE_VERSION,
    engine: {
      kind: "office",
      processor: "ghostscript",
      processorVersion,
      processingAvailable,
      ...(processingAvailable ? {} : { disabledReason: "processor_unavailable" }),
    },
    capabilities: {
      allowedPresets: processingAvailable ? ["balanced"] : [],
      jobCreation: processingAvailable,
      jobStatus: true,
      resultDownload: processingAvailable,
      cancellation: processingAvailable,
    },
    limits: {
      maxFileSizeMb: ENGINE_LIMITS.maxFileSizeMb,
      processingTimeoutSeconds: ENGINE_LIMITS.processingTimeoutSeconds,
      retentionMinutes: ENGINE_LIMITS.retentionMinutes,
      maxConcurrentJobs: ENGINE_LIMITS.maxConcurrentJobs,
    },
    runtime: runtimeCapabilities,
  };
}
