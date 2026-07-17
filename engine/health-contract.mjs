export const API_VERSION = "1.0";
export const SERVICE_VERSION = "0.1.0";

export function createHealthResponse() {
  return {
    status: "healthy",
    readiness: "blocked",
    apiVersion: API_VERSION,
    serviceVersion: SERVICE_VERSION,
    engine: {
      kind: "office",
      processor: null,
      processorVersion: null,
      processingAvailable: false,
      disabledReason: "numeric_policy_unapproved",
    },
    capabilities: {
      allowedPresets: [],
      jobCreation: false,
      jobStatus: false,
      resultDownload: false,
      cancellation: false,
    },
    limits: {
      maxFileSizeMb: null,
      processingTimeoutSeconds: null,
      retentionMinutes: null,
    },
  };
}
