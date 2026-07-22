import type { ExecutionRoute } from "./runtime-config.js";
import type { AiRuntimeConfig } from "./runtime-config.js";

export type PlannerPreset = "safe" | "balanced" | "strong";

export interface PlannerRequest {
  readonly executionId: string;
  readonly targetBytes: number;
  readonly preferredRoute?: ExecutionRoute;
}

export interface PlannerPlan {
  readonly route: ExecutionRoute;
  readonly preset: PlannerPreset;
  readonly source: "planner" | "deterministic_fallback";
}

export type PlannerFailureCode =
  | "planner_network_failed"
  | "planner_http_failed"
  | "planner_response_invalid"
  | "office_endpoint_missing";

export interface PlannerFailure {
  readonly code: PlannerFailureCode;
  readonly message: string;
}

export interface PlannerResult {
  readonly plan: PlannerPlan;
  readonly failure: PlannerFailure | null;
}

export interface PlannerFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type PlannerFetch = (
  input: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
  },
) => Promise<PlannerFetchResponse>;

function fallback(failure: PlannerFailure): PlannerResult {
  return Object.freeze({
    plan: Object.freeze({ route: "local", preset: "balanced", source: "deterministic_fallback" }),
    failure: Object.freeze(failure),
  });
}

function parsePlan(value: unknown, config: AiRuntimeConfig): PlannerResult {
  if (!value || typeof value !== "object") {
    return fallback({ code: "planner_response_invalid", message: "Planner response must be an object" });
  }

  const candidate = value as { route?: unknown; preset?: unknown };
  const route = candidate.route;
  const preset = candidate.preset;
  if (route !== "local" && route !== "office_current") {
    return fallback({ code: "planner_response_invalid", message: "Planner route is invalid" });
  }
  if (preset !== "safe" && preset !== "balanced" && preset !== "strong") {
    return fallback({ code: "planner_response_invalid", message: "Planner preset is invalid" });
  }
  if (route === "office_current" && !config.officeEndpoint) {
    return fallback({ code: "office_endpoint_missing", message: "Office route requires an explicitly configured endpoint" });
  }

  return Object.freeze({
    plan: Object.freeze({ route, preset, source: "planner" }),
    failure: null,
  });
}

export class SourcePlannerClient {
  readonly #config: AiRuntimeConfig;
  readonly #fetch: PlannerFetch;

  constructor(config: AiRuntimeConfig, fetcher: PlannerFetch) {
    this.#config = config;
    this.#fetch = fetcher;
  }

  async createPlan(request: PlannerRequest): Promise<PlannerResult> {
    try {
      const response = await this.#fetch(`${this.#config.plannerEndpoint}/plan`, {
        method: "POST",
        headers: Object.freeze({ "content-type": "application/json" }),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return fallback({
          code: "planner_http_failed",
          message: `Planner returned HTTP ${response.status}`,
        });
      }

      return parsePlan(await response.json(), this.#config);
    } catch (error) {
      return fallback({
        code: "planner_network_failed",
        message: error instanceof Error ? error.message : "Planner network request failed",
      });
    }
  }
}
