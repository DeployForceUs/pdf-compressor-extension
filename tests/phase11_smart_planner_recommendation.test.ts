import assert from "node:assert/strict";
import test from "node:test";
import {
  requestSmartPlannerRecommendation,
  type SmartPlannerGatewayRequest,
} from "../src/lib/ai/smart-planner-recommendation";
import type { SmartPlannerRequest } from "../src/lib/ai/smart-planner-contract";

const request: SmartPlannerRequest = {
  schemaVersion: 1,
  requestId: "planner-request-0001",
  userGoal: {
    deliveryTarget: "email_20mb",
    qualityIntent: "print",
    speedPreference: "balanced",
    splitAllowed: true,
  },
  documentProfile: {
    fileSizeBytes: 5_500_000,
    pageCount: 220,
    imageObjectCount: 233,
    scannedPageRatio: 0,
    vectorPageRatio: 0,
    textPageRatio: 1,
    estimatedDpiBuckets: {
      under150: 0,
      "150to300": 1,
      over300: 0,
    },
    codecCounts: {
      jpeg: 233,
      jpx: 0,
      other: 0,
    },
    pageSizeDistributionBytes: {
      p50: 25_000,
      p90: 40_000,
      max: 90_000,
    },
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

const validPlan = {
  schemaVersion: 1,
  engine: "local",
  preset: "balanced",
  quality: 65,
  dpi: 144,
  split: {
    enabled: false,
    strategy: "by-max-size",
    targetPartSizeMb: 20,
  },
  retryPolicy: {
    allowed: true,
    maxAdditionalPasses: 1,
  },
  explanation: "Use the approved balanced local preset and keep the document in one file.",
} as const;

test("returns a validated non-executable recommendation preview", async () => {
  let gatewayInput: SmartPlannerGatewayRequest | undefined;
  const result = await requestSmartPlannerRecommendation(request, async (input) => {
    gatewayInput = input;
    return validPlan;
  });

  assert.equal(result.status, "ready");
  assert.equal(result.executionAllowed, false);
  assert.equal(result.requiresUserConfirmation, true);
  assert.deepEqual(result.plan, validPlan);
  assert.deepEqual(gatewayInput?.request, request);
  assert.equal(gatewayInput?.responseSchema.additionalProperties, false);
});

test("forces a healthy Office Engine for a large predominantly scanned PDF", async () => {
  const largeScannedRequest: SmartPlannerRequest = {
    ...request,
    documentProfile: {
      ...request.documentProfile,
      fileSizeBytes: 150 * 1024 * 1024,
      imageObjectCount: 220,
      scannedPageRatio: 1,
      textPageRatio: 0,
    },
  };

  const result = await requestSmartPlannerRecommendation(largeScannedRequest, async () => validPlan);

  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("Expected ready recommendation");
  assert.equal(result.plan.engine, "office");
  assert.equal(result.plan.quality, 65);
  assert.equal(result.plan.dpi, 144);
  assert.match(result.plan.explanation, /Office Engine is required/);
});

test("does not force Office when the controlled server is unavailable", async () => {
  const largeScannedRequest: SmartPlannerRequest = {
    ...request,
    documentProfile: {
      ...request.documentProfile,
      fileSizeBytes: 150 * 1024 * 1024,
      scannedPageRatio: 1,
      textPageRatio: 0,
    },
    engineCapabilities: {
      ...request.engineCapabilities,
      officeAvailable: false,
      officeCpuCount: 0,
      officeMemoryGb: 0,
    },
  };

  const result = await requestSmartPlannerRecommendation(largeScannedRequest, async () => validPlan);

  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("Expected ready recommendation");
  assert.equal(result.plan.engine, "local");
});

test("blocks invalid requests before the gateway is called", async () => {
  let calls = 0;
  const result = await requestSmartPlannerRecommendation(
    { ...request, requestId: "short" },
    async () => {
      calls += 1;
      return validPlan;
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "invalid_request");
  assert.equal(result.executionAllowed, false);
});

test("blocks a plan outside the approved numeric policy", async () => {
  const result = await requestSmartPlannerRecommendation(request, async () => ({
    ...validPlan,
    quality: 80,
  }));

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "invalid_plan");
  assert.equal(result.executionAllowed, false);
  assert.match(result.errors.join("\n"), /outside approved range/);
});

test("blocks Office Engine recommendations when Office is unavailable", async () => {
  const result = await requestSmartPlannerRecommendation(
    {
      ...request,
      engineCapabilities: {
        ...request.engineCapabilities,
        officeAvailable: false,
      },
    },
    async () => ({
      ...validPlan,
      engine: "office",
    }),
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "invalid_plan");
  assert.match(result.errors.join("\n"), /Office Engine is unavailable/);
});

test("converts gateway failures into a blocked preview", async () => {
  const result = await requestSmartPlannerRecommendation(request, async () => {
    throw new Error("gateway unavailable");
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "gateway_error");
  assert.deepEqual(result.errors, ["gateway unavailable"]);
  assert.equal(result.executionAllowed, false);
});
