export const BALANCED_PROCESSING_POLICY = Object.freeze({
  preset: "balanced",
  quality: 65,
  dpi: 144,
  targetPartSizeMb: 20,
  maxAdditionalPasses: 1,
});

export const ENGINE_LIMITS = Object.freeze({
  maxFileSizeMb: 1024,
  maxFileSizeBytes: 1024 * 1024 * 1024,
  processingTimeoutSeconds: 300,
  retentionMinutes: 15,
  maxConcurrentJobs: 1,
});

export const DEFAULT_ENGINE_WORK_ROOT = "/var/lib/pdf-office-engine/jobs";
