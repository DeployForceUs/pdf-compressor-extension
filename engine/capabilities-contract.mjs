import { ENGINE_LIMITS } from "./processing-config.mjs";
import { detectRuntimeCapabilities } from "./runtime-capabilities.mjs";

export const CAPABILITIES_SCHEMA_VERSION = "1";

function optionalBenchmark(benchmark) {
  if (!benchmark || !Number.isFinite(benchmark.pagesPerMinute) || benchmark.pagesPerMinute <= 0) {
    return undefined;
  }
  return {
    pagesPerMinute: benchmark.pagesPerMinute,
    ...(benchmark.measuredAt ? { measuredAt: benchmark.measuredAt } : {}),
    ...(benchmark.preset ? { preset: benchmark.preset } : {}),
  };
}

export function createCapabilitiesResponse({
  processorVersion = null,
  runtimeCapabilities = detectRuntimeCapabilities(),
  queueDepth = 0,
  activeJobs = 0,
  benchmark,
} = {}) {
  const processingAvailable = Boolean(processorVersion);
  const maxConcurrentJobs = ENGINE_LIMITS.maxConcurrentJobs;
  const availability = !processingAvailable
    ? "unavailable"
    : activeJobs >= maxConcurrentJobs
      ? "busy"
      : "ready";
  const normalizedQueueDepth = Number.isSafeInteger(queueDepth) && queueDepth >= 0 ? queueDepth : 0;
  const normalizedActiveJobs = Number.isSafeInteger(activeJobs) && activeJobs >= 0 ? activeJobs : 0;
  const calibratedBenchmark = optionalBenchmark(benchmark);

  return {
    schemaVersion: CAPABILITIES_SCHEMA_VERSION,
    availability,
    cpuCores: runtimeCapabilities.effectiveCpuCount,
    memoryMb: runtimeCapabilities.effectiveMemoryMb,
    engineMemoryLimitMb: runtimeCapabilities.effectiveMemoryMb,
    queueDepth: normalizedQueueDepth,
    activeJobs: normalizedActiveJobs,
    maxConcurrentJobs,
    ghostscriptVersion: processorVersion,
    maxFileSizeMb: ENGINE_LIMITS.maxFileSizeMb,
    presets: processingAvailable ? ["balanced"] : [],
    runtimeMeasurement: runtimeCapabilities.measurement,
    performanceCalibration: calibratedBenchmark ? "calibrated" : runtimeCapabilities.performanceCalibration,
    ...(calibratedBenchmark ? { benchmark: calibratedBenchmark } : {}),
    ...(!processingAvailable ? { unavailableReason: "processor_unavailable" } : {}),
  };
}
