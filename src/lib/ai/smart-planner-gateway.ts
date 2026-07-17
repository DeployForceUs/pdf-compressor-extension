import {
  requestSmartPlannerPlan,
  type SmartPlannerApiOptions,
  type SmartPlannerApiResult,
} from "./openai-smart-planner-client";
import type {
  ProcessingPlanPolicy,
  SmartPlannerRequestPolicy,
} from "./smart-planner-contract";

export type SmartPlannerGatewayConfig = {
  apiKey: string;
  requestPolicy: SmartPlannerRequestPolicy;
  planPolicy: ProcessingPlanPolicy;
  maxRequestBytes: number;
  timeoutMs: number;
  authorize: (request: Request) => boolean | Promise<boolean>;
  consumeRateLimit: (request: Request) => boolean | Promise<boolean>;
  requestPlan?: (options: SmartPlannerApiOptions) => Promise<SmartPlannerApiResult>;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export async function handleSmartPlannerGatewayRequest(
  request: Request,
  config: SmartPlannerGatewayConfig,
) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }
  if (!isPositiveInteger(config.maxRequestBytes) || !isPositiveInteger(config.timeoutMs)) {
    return jsonResponse(503, { error: "gateway_policy_unavailable" });
  }
  if (!(await config.authorize(request))) {
    return jsonResponse(401, { error: "unauthorized" });
  }
  if (!(await config.consumeRateLimit(request))) {
    return jsonResponse(429, { error: "rate_limited" });
  }

  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonResponse(415, { error: "unsupported_media_type" });
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > config.maxRequestBytes) {
    return jsonResponse(413, { error: "request_too_large" });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse(400, { error: "invalid_request_body" });
  }
  if (new TextEncoder().encode(rawBody).byteLength > config.maxRequestBytes) {
    return jsonResponse(413, { error: "request_too_large" });
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), config.timeoutMs);
  try {
    const result = await (config.requestPlan ?? requestSmartPlannerPlan)({
      apiKey: config.apiKey,
      request: requestBody,
      requestPolicy: config.requestPolicy,
      planPolicy: config.planPolicy,
      signal: timeout.signal,
    });

    if (result.kind === "fallback") {
      return jsonResponse(200, {
        kind: result.kind,
        action: result.action,
        reason: result.reason,
      });
    }
    return jsonResponse(200, {
      kind: result.kind,
      plan: result.plan,
      executionAllowed: result.executionAllowed,
      policyErrors: result.policyErrors,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
