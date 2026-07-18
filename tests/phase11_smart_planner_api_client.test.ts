import assert from "node:assert/strict";
import test from "node:test";

import { createSmartPlannerApiClient, SmartPlannerApiError } from "../src/lib/ai/smart-planner-api-client";
import { APPROVED_BALANCED_NUMERIC_POLICY, type SmartPlannerRequest } from "../src/lib/ai/smart-planner-contract";

const validRequest: SmartPlannerRequest = {
  schemaVersion: 1,
  requestId: "ephemeral-request-1234",
  userGoal: { deliveryTarget: "email_20mb", qualityIntent: "print", speedPreference: "balanced", splitAllowed: true },
  documentProfile: {
    fileSizeBytes: 100,
    pageCount: 1,
    imageObjectCount: 1,
    scannedPageRatio: 1,
    vectorPageRatio: 0,
    textPageRatio: 0,
    estimatedDpiBuckets: { under150: 0, "150to300": 1, over300: 0 },
    codecCounts: { jpeg: 1, jpx: 0, other: 0 },
    pageSizeDistributionBytes: { p50: 100, p90: 100, max: 100 },
  },
  engineCapabilities: {
    localAvailable: true,
    officeAvailable: true,
    officeCpuCount: 4,
    officeMemoryGb: 8,
    allowedPresets: ["balanced"],
    maxFileSizeMb: 1024,
  },
};

function client(fetchImpl: typeof fetch) {
  return createSmartPlannerApiClient({
    baseUrl: "https://pdf.example.test",
    accessToken: "token",
    requestPolicy: { deliveryTargets: ["email_20mb"], qualityIntents: ["print"], speedPreferences: ["balanced"] },
    planPolicy: {
      allowedPresets: ["balanced"],
      localAvailable: true,
      officeAvailable: true,
      splitAllowed: true,
      officeEntitled: true,
      numericPolicy: APPROVED_BALANCED_NUMERIC_POLICY,
    },
    fetchImpl,
  });
}

test("accepts only a locally revalidated executable plan", async () => {
  const result = await client(async (_input, init) => {
    assert.equal(init?.body, JSON.stringify(validRequest));
    return Response.json({
      kind: "plan",
      plan: {
        schemaVersion: 1,
        engine: "office",
        preset: "balanced",
        quality: 65,
        dpi: 144,
        split: { enabled: true, strategy: "by-max-size", targetPartSizeMb: 20 },
        retryPolicy: { allowed: true, maxAdditionalPasses: 1 },
        explanation: "Use Office Engine for this bounded workflow.",
      },
      executionAllowed: true,
      policyErrors: [],
    });
  }).createPlan(validRequest);
  assert.equal(result.kind, "plan");
  if (result.kind === "plan") assert.equal(result.plan.engine, "office");
});

test("blocks forbidden content before any network request", async () => {
  let called = false;
  const unsafe = { ...validRequest, documentProfile: { ...validRequest.documentProfile, extractedText: "secret" } };
  await assert.rejects(
    client(async () => { called = true; return Response.json({}); }).createPlan(unsafe as SmartPlannerRequest),
    (error: unknown) => error instanceof SmartPlannerApiError && error.code === "invalid_content_blind_profile",
  );
  assert.equal(called, false);
});
