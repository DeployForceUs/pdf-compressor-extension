import assert from "node:assert/strict";
import {
  createSmartPlannerResponseBody,
  requestSmartPlannerPlan,
  SMART_PLANNER_MODEL,
} from "../src/lib/ai/openai-smart-planner-client";
import type { SmartPlannerRequest } from "../src/lib/ai/smart-planner-contract";

const requestPolicy = {
  deliveryTargets: ["email_20mb"],
  qualityIntents: ["print"],
  speedPreferences: ["balanced"],
} as const;

const request: SmartPlannerRequest = {
  schemaVersion: 1,
  requestId: "buildweek-request-0002",
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

const body = createSmartPlannerResponseBody(request, requestPolicy);
assert.equal(body.ok, true);
if (!body.ok) throw new Error(body.errors.join("\n"));
assert.equal(body.value.model, SMART_PLANNER_MODEL);
assert.equal(body.value.store, false);
assert.deepEqual(body.value.tools, []);
assert.equal(body.value.text.format.type, "json_schema");
assert.equal(body.value.text.format.strict, true);
assert.equal(body.value.input.includes("PDF-1."), false);
assert.equal(body.value.input.includes("filename"), false);

const modelPlan = {
  schemaVersion: 1,
  engine: "office",
  preset: "balanced",
  quality: 78,
  dpi: 180,
  split: { enabled: true, strategy: "by-max-size", targetPartSizeMb: 20 },
  retryPolicy: { allowed: true, maxAdditionalPasses: 1 },
  explanation: "Use Office Engine and create email-sized parts.",
};

let capturedAuthorization = "";
let capturedRequestBody = "";
const successfulFetch = async (_input: string | URL | Request, init?: RequestInit) => {
  capturedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
  capturedRequestBody = String(init?.body ?? "");
  return new Response(
    JSON.stringify({
      id: "resp_test_123",
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(modelPlan) }],
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const result = await requestSmartPlannerPlan({
  apiKey: "server-secret-test-key",
  request,
  requestPolicy,
  planPolicy: {
    allowedPresets: ["balanced"],
    localAvailable: true,
    officeAvailable: true,
    splitAllowed: true,
    officeEntitled: true,
  },
  fetchImpl: successfulFetch,
});
assert.equal(result.kind, "plan");
if (result.kind !== "plan") throw new Error(result.errors.join("\n"));
assert.equal(result.responseId, "resp_test_123");
assert.equal(result.executionAllowed, false);
assert.match(result.policyErrors.join("\n"), /numeric policy is approved/);
assert.equal(capturedAuthorization, "Bearer server-secret-test-key");
assert.equal(capturedRequestBody.includes("server-secret-test-key"), false);
assert.equal(capturedRequestBody.includes('"store":false'), true);
assert.equal(capturedRequestBody.includes('"model":"gpt-5.6"'), true);

let invalidRequestFetchCalls = 0;
const invalidRequestResult = await requestSmartPlannerPlan({
  apiKey: "server-secret-test-key",
  request: { ...request, pdfBytes: new Uint8Array([37, 80, 68, 70]) },
  requestPolicy,
  planPolicy: {
    allowedPresets: ["balanced"],
    localAvailable: true,
    officeAvailable: true,
    splitAllowed: true,
    officeEntitled: true,
  },
  fetchImpl: async () => {
    invalidRequestFetchCalls += 1;
    return new Response();
  },
});
assert.equal(invalidRequestResult.kind, "fallback");
assert.equal(invalidRequestFetchCalls, 0);

const malformedOutputResult = await requestSmartPlannerPlan({
  apiKey: "server-secret-test-key",
  request,
  requestPolicy,
  planPolicy: {
    allowedPresets: ["balanced"],
    localAvailable: true,
    officeAvailable: true,
    splitAllowed: true,
    officeEntitled: true,
  },
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: '{"engine":"office"}' }] }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
});
assert.equal(malformedOutputResult.kind, "fallback");
if (malformedOutputResult.kind === "fallback") {
  assert.equal(malformedOutputResult.reason, "invalid_model_output");
  assert.equal(malformedOutputResult.action, "use_existing_local_settings");
}

console.info("phase11 OpenAI Smart Planner request and fallback assertions passed");
