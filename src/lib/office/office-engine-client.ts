import type { SmartPlannerEngineCapabilities } from "../ai/smart-planner-contract";

export type OfficeEngineHealth = {
  status: "healthy";
  readiness: "ready" | "blocked";
  apiVersion: string;
  serviceVersion: string;
  engine: {
    kind: "office";
    processor: string | null;
    processorVersion: string | null;
    processingAvailable: boolean;
    disabledReason?: string;
  };
  capabilities: {
    allowedPresets: string[];
    jobCreation: boolean;
    jobStatus: boolean;
    resultDownload: boolean;
    cancellation: boolean;
  };
  limits: {
    maxFileSizeMb: number;
    processingTimeoutSeconds: number;
    retentionMinutes: number;
    maxConcurrentJobs: number;
  };
  runtime?: {
    effectiveCpuCount: number;
    effectiveMemoryMb: number;
    measurement: "effective_runtime_limits";
    performanceCalibration: "not_calibrated";
  };
};

export type OfficeJob = {
  jobId: string;
  status: "queued" | "processing" | "cancelling" | "cancelled" | "completed";
  progress: number;
  preset: "balanced";
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  result?: {
    kind: "compressed" | "original";
    reason: string;
    bytes: number;
    savedBytes: number;
  };
};

export type OfficeEngineClientOptions = {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
};

export class OfficeEngineClientError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, status: number | null = null) {
    super(code);
    this.name = "OfficeEngineClientError";
    this.code = code;
    this.status = status;
  }
}

function normalizedBaseUrl(raw: string) {
  const url = new URL(raw.trim());
  const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new OfficeEngineClientError("secure_server_url_required");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function errorCode(response: Response) {
  try {
    const body = await response.json();
    return isRecord(body) && typeof body.error === "string" ? body.error : `http_${response.status}`;
  } catch {
    return `http_${response.status}`;
  }
}

export function parseOfficeEngineHealth(value: unknown): OfficeEngineHealth {
  if (!isRecord(value) || value.status !== "healthy" || (value.readiness !== "ready" && value.readiness !== "blocked")) {
    throw new OfficeEngineClientError("invalid_health_response");
  }
  const engine = value.engine;
  const capabilities = value.capabilities;
  const limits = value.limits;
  const runtime = value.runtime;
  if (
    !isRecord(engine) || engine.kind !== "office" || typeof engine.processingAvailable !== "boolean" ||
    !isRecord(capabilities) || !Array.isArray(capabilities.allowedPresets) ||
    !isRecord(limits) || typeof limits.maxFileSizeMb !== "number"
  ) {
    throw new OfficeEngineClientError("invalid_health_response");
  }
  if (
    runtime !== undefined &&
    (
      !isRecord(runtime) ||
      !isPositiveNumber(runtime.effectiveCpuCount) ||
      !isPositiveNumber(runtime.effectiveMemoryMb) ||
      !Number.isSafeInteger(runtime.effectiveMemoryMb) ||
      runtime.measurement !== "effective_runtime_limits" ||
      runtime.performanceCalibration !== "not_calibrated"
    )
  ) {
    throw new OfficeEngineClientError("invalid_health_response");
  }
  return value as OfficeEngineHealth;
}

export function createPlannerCapabilitiesFromOfficeHealth(
  health: OfficeEngineHealth,
  localAvailable = true,
): SmartPlannerEngineCapabilities {
  const runtimeAvailable = health.runtime !== undefined;
  const officeCpuCount = runtimeAvailable
    ? Math.floor(health.runtime!.effectiveCpuCount)
    : 0;
  const officeAvailable =
    runtimeAvailable &&
    officeCpuCount > 0 &&
    health.readiness === "ready" &&
    health.engine.processingAvailable &&
    health.capabilities.jobCreation;

  return {
    localAvailable,
    officeAvailable,
    officeCpuCount,
    officeMemoryGb: runtimeAvailable
      ? Number((health.runtime!.effectiveMemoryMb / 1024).toFixed(3))
      : 0,
    allowedPresets: health.capabilities.allowedPresets.length > 0
      ? [...health.capabilities.allowedPresets]
      : ["balanced"],
    maxFileSizeMb: health.limits.maxFileSizeMb,
  };
}

function validateJob(value: unknown): OfficeJob {
  if (
    !isRecord(value) ||
    typeof value.jobId !== "string" ||
    !["queued", "processing", "cancelling", "cancelled", "completed"].includes(String(value.status)) ||
    typeof value.progress !== "number"
  ) {
    throw new OfficeEngineClientError("invalid_job_response");
  }
  return value as OfficeJob;
}

export function createOfficeEngineClient(options: OfficeEngineClientOptions) {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const accessToken = options.accessToken.trim();
  if (!accessToken) throw new OfficeEngineClientError("access_token_required");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, baseUrl), {
        ...init,
        cache: "no-store",
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new OfficeEngineClientError("network_error");
    }
    if (!response.ok) {
      throw new OfficeEngineClientError(await errorCode(response), response.status);
    }
    return response;
  }

  return {
    async health() {
      const response = await request("/api/v1/office/health");
      return parseOfficeEngineHealth(await response.json());
    },
    async createJob(pdf: Blob, signal?: AbortSignal) {
      if (pdf.type && pdf.type !== "application/pdf") {
        throw new OfficeEngineClientError("unsupported_media_type");
      }
      const response = await request("/api/v1/office/compress", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: pdf,
        signal,
      });
      return validateJob(await response.json());
    },
    async getJob(jobId: string, signal?: AbortSignal) {
      const response = await request(`/api/v1/office/jobs/${encodeURIComponent(jobId)}`, { signal });
      return validateJob(await response.json());
    },
    async downloadResult(jobId: string, signal?: AbortSignal) {
      const response = await request(`/api/v1/office/jobs/${encodeURIComponent(jobId)}/result`, { signal });
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "application/pdf") throw new OfficeEngineClientError("invalid_result_type");
      return {
        bytes: await response.arrayBuffer(),
        kind: response.headers.get("x-result-kind") === "original" ? "original" as const : "compressed" as const,
      };
    },
    async cancelJob(jobId: string) {
      const response = await request(`/api/v1/office/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      return validateJob(await response.json());
    },
  };
}
