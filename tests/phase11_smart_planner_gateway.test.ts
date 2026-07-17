import assert from "node:assert/strict";
import { handleSmartPlannerGatewayRequest } from "../src/lib/ai/smart-planner-gateway";
import type { SmartPlannerRequest } from "../src/lib/ai/smart-planner-contract";

const request: SmartPlannerRequest = {
  schemaVersion: 1,
  requestId: "buildweek-request-0003",
  userGoal: {
    deliveryTarget: "email_20mb",
    qualityIntent: "print",
    speedPreference: "balanced",
    splitAllowed: true,
  },
  documentProfile: {
    fileSizeBytes: 838_860_800,
    pageCount: 620,
    imageObjectCount: 1310,
    scannedPageRatio: 0.94,
    vectorPageRatio: 0.02,
    textPageRatio: 0.04,
    estimatedDpiBuckets: { under150: 0.02, "150to300": 0.21, over300: 0.77 },
    codecCounts: { jpeg: 1280, jpx: 30, other: 0 },
    pageSizeDistributionBytes: { p50: 1_100_000, p90: 2_100_000, max: 7_400_000 },
  },
  engineCapabilities: {
    localAvailable: true,
    officeAvailable: true,
    officeCpuCount: 16,
    officeMemoryGb: 32,
    allowedPresets: ["balanced"],
    maxFileSizeMb: 1000,
  },
};

const baseConfig = {
  apiKey: "gateway-only-secret",
  requestPolicy: {
    deliveryTargets: ["email_20mb"],
    qualityIntents: ["print"],
    speedPreferences: ["balanced"],
  },
  planPolicy: {
    allowedPresets: ["balanced"],
    localAvailable: true,
    officeAvailable: true,
    splitAllowed: true,
    officeEntitled: true,
  },
  maxRequestBytes: 32_768,
  timeoutMs: 10_000,
  authorize: () => true,
  consumeRateLimit: () => true,
  requestPlan: async () => ({
    kind: "fallback" as const,
    action: "use_existing_local_settings" as const,
    reason: "network_error" as const,
    errors: ["internal detail that must not be returned"],
  }),
};

const unauthorized = await handleSmartPlannerGatewayRequest(
  new Request("https://gateway.test/api/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }),
  { ...baseConfig, authorize: () => false },
);
assert.equal(unauthorized.status, 401);
assert.equal(unauthorized.headers.get("Cache-Control"), "no-store");

const wrongMediaType = await handleSmartPlannerGatewayRequest(
  new Request("https://gateway.test/api/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(request),
  }),
  baseConfig,
);
assert.equal(wrongMediaType.status, 415);

const oversized = await handleSmartPlannerGatewayRequest(
  new Request("https://gateway.test/api/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }),
  { ...baseConfig, maxRequestBytes: 16 },
);
assert.equal(oversized.status, 413);

const fallback = await handleSmartPlannerGatewayRequest(
  new Request("https://gateway.test/api/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }),
  baseConfig,
);
assert.equal(fallback.status, 200);
const fallbackBody = (await fallback.json()) as Record<string, unknown>;
assert.deepEqual(fallbackBody, {
  kind: "fallback",
  action: "use_existing_local_settings",
  reason: "network_error",
});
assert.equal(JSON.stringify(fallbackBody).includes("internal detail"), false);
assert.equal(JSON.stringify(fallbackBody).includes("gateway-only-secret"), false);

console.info("phase11 Smart Planner gateway security assertions passed");
