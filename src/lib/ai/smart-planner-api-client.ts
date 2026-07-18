import {
  validateProcessingPlan,
  validateSmartPlannerRequest,
  type ProcessingPlan,
  type ProcessingPlanPolicy,
  type SmartPlannerRequest,
  type SmartPlannerRequestPolicy,
} from "./smart-planner-contract";

export type SmartPlannerApiResult =
  | { kind: "plan"; plan: ProcessingPlan; executionAllowed: true; policyErrors: [] }
  | { kind: "fallback"; action: "use_existing_local_settings"; reason: string };

export type SmartPlannerApiClientOptions = {
  baseUrl: string;
  accessToken: string;
  requestPolicy: SmartPlannerRequestPolicy;
  planPolicy: ProcessingPlanPolicy;
  fetchImpl?: typeof fetch;
};

export class SmartPlannerApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "SmartPlannerApiError";
    this.code = code;
  }
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSmartPlannerApiClient(options: SmartPlannerApiClientOptions) {
  const baseUrl = new URL(options.baseUrl.trim());
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async createPlan(requestValue: SmartPlannerRequest, signal?: AbortSignal): Promise<SmartPlannerApiResult> {
      const request = validateSmartPlannerRequest(requestValue, options.requestPolicy);
      if (!request.ok) throw new SmartPlannerApiError("invalid_content_blind_profile");

      let response: Response;
      try {
        response = await fetchImpl(new URL("/api/v1/plans", baseUrl), {
          method: "POST",
          cache: "no-store",
          headers: {
            authorization: `Bearer ${options.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(request.value),
          signal,
        });
      } catch {
        throw new SmartPlannerApiError("network_error");
      }
      if (!response.ok) throw new SmartPlannerApiError(`http_${response.status}`);

      const body: unknown = await response.json();
      if (!isRecord(body) || typeof body.kind !== "string") throw new SmartPlannerApiError("invalid_gateway_response");
      if (body.kind === "fallback") {
        if (
          !exactKeys(body, ["kind", "action", "reason"]) ||
          body.action !== "use_existing_local_settings" ||
          typeof body.reason !== "string"
        ) throw new SmartPlannerApiError("invalid_gateway_response");
        return body as SmartPlannerApiResult;
      }
      if (body.kind !== "plan" || !exactKeys(body, ["kind", "plan", "executionAllowed", "policyErrors"])) {
        throw new SmartPlannerApiError("invalid_gateway_response");
      }
      const plan = validateProcessingPlan(body.plan, options.planPolicy);
      if (!plan.ok || !plan.executionAllowed || body.executionAllowed !== true || !Array.isArray(body.policyErrors) || body.policyErrors.length !== 0) {
        throw new SmartPlannerApiError("unexecutable_plan");
      }
      return { kind: "plan", plan: plan.value, executionAllowed: true, policyErrors: [] };
    },
  };
}
