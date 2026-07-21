import type {
  OfficeAvailability,
  OfficeCapabilities,
  PlannerPreset,
} from "../../../lib/ai-orchestrator/contracts";

export interface OfficeCapabilityClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface OfficeCapabilitiesWireResponse {
  schemaVersion?: unknown;
  availability?: unknown;
  cpuCores?: unknown;
  memoryMb?: unknown;
  engineMemoryLimitMb?: unknown;
  queueDepth?: unknown;
  activeJobs?: unknown;
  maxConcurrentJobs?: unknown;
  ghostscriptVersion?: unknown;
  maxFileSizeMb?: unknown;
  presets?: unknown;
  performanceCalibration?: unknown;
  benchmark?: unknown;
}

const SUPPORTED_PRESETS = new Set<PlannerPreset>([
  "safe",
  "balanced",
  "strong",
]);

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeAvailability(value: unknown): OfficeAvailability {
  if (value === "ready" || value === "busy") return value;
  return "unavailable";
}

function normalizePresets(value: unknown): readonly PlannerPreset[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (preset): preset is PlannerPreset =>
      typeof preset === "string" &&
      SUPPORTED_PRESETS.has(preset as PlannerPreset),
  );
}

function normalizeBenchmark(value: unknown): OfficeCapabilities["benchmark"] {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const pagesPerMinute = positiveNumber(record.pagesPerMinute);
  const measuredAt = nonEmptyString(record.measuredAt);
  const preset =
    typeof record.preset === "string" &&
    SUPPORTED_PRESETS.has(record.preset as PlannerPreset)
      ? (record.preset as PlannerPreset)
      : undefined;

  if (!pagesPerMinute && !measuredAt && !preset) return undefined;

  return { pagesPerMinute, measuredAt, preset };
}

function unavailable(reason: string): OfficeCapabilities {
  return {
    availability: "unavailable",
    presets: [],
    unavailableReason: reason,
  };
}

export function normalizeOfficeCapabilities(
  payload: OfficeCapabilitiesWireResponse,
): OfficeCapabilities {
  const availability = normalizeAvailability(payload.availability);
  const ghostscriptVersion = nonEmptyString(payload.ghostscriptVersion);
  const presets = normalizePresets(payload.presets);

  if (availability === "unavailable") {
    return unavailable(
      ghostscriptVersion ? "office_engine_unavailable" : "processor_unavailable",
    );
  }

  return {
    availability,
    cpuCores: positiveNumber(payload.cpuCores),
    memoryMb: positiveNumber(payload.memoryMb),
    engineMemoryLimitMb: positiveNumber(payload.engineMemoryLimitMb),
    queueDepth: nonNegativeInteger(payload.queueDepth),
    maxConcurrentJobs: nonNegativeInteger(payload.maxConcurrentJobs),
    ghostscriptVersion,
    maxFileSizeMb: positiveNumber(payload.maxFileSizeMb),
    presets,
    benchmark: normalizeBenchmark(payload.benchmark),
  };
}

export async function fetchOfficeCapabilities(
  options: OfficeCapabilityClientOptions,
): Promise<OfficeCapabilities> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `${options.baseUrl.replace(/\/$/, "")}/api/v1/capabilities`,
      {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json" },
      },
    );

    if (!response.ok) return unavailable(`http_${response.status}`);

    const payload = (await response.json()) as OfficeCapabilitiesWireResponse;
    return normalizeOfficeCapabilities(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return unavailable("timeout");
    }

    return unavailable("network_error");
  } finally {
    clearTimeout(timeout);
  }
}
