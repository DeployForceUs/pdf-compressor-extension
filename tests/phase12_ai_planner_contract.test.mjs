import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicPlannerFallback,
  validatePlannerResponse,
} from "../engine/ai-planner-contract.mjs";
import { createPlannerRecommendation } from "../engine/ai-planner-service.mjs";

const request = {
  schemaVersion: "1",
  documentProfile: {
    pageCount: 37,
    fileSizeBytes: 1_528_924,
    imageObjectCount: 0,
    scannedRatio: 0,
    textRatio: 1,
    vectorRatio: 0,
    complexitySignals: [],
  },
  userGoal: { kind: "email", targetSizeMb: 20 },
  localCapabilities: {
    available: true,
    logicalCores: 8,
    memoryClassGb: 8,
    wasmSupported: true,
    benchmark: { status: "missing" },
  },
  officeCapabilities: {
    availability: "ready",
    cpuCores: 4,
    memoryMb: 16_384,
    presets: ["safe", "balanced", "strong"],
  },
  capacityCatalog: [
    { id: "small", cpuCores: 2, memoryMb: 4_096, label: "2 vCPU · 4 GB RAM" },
    { id: "medium", cpuCores: 4, memoryMb: 8_192, label: "4 vCPU · 8 GB RAM" },
    { id: "large", cpuCores: 8, memoryMb: 16_384, label: "8 vCPU · 16 GB RAM" },
  ],
};

const validResponse = {
  schemaVersion: "1",
  recommendedRoute: "office_current",
  recommendedPreset: "balanced",
  currentLocalAssessment: "sufficient_but_slower",
  currentOfficeAssessment: "recommended",
  idealConfiguration: request.capacityCatalog[1],
  oversizedConfiguration: {
    ...request.capacityCatalog[2],
    reason: "Extra capacity is not required for the current document.",
  },
  estimatedRuntime: {
    local: { min: 90, max: 180 },
    officeCurrent: { min: 30, max: 60 },
    idealConfiguration: { min: 30, max: 60 },
  },
  explanation: "The current Office Engine is the best available route.",
  confidence: "medium",
};

test("accepts a valid strict PlannerResponse", () => {
  assert.deepEqual(validatePlannerResponse(validResponse, request), validResponse);
});

test("accepts a local preset when Office Engine exposes no presets", () => {
  const localRequest = {
    ...request,
    officeCapabilities: {
      ...request.officeCapabilities,
      availability: "unavailable",
      presets: [],
    },
  };
  const localResponse = {
    ...validResponse,
    recommendedRoute: "local",
    recommendedPreset: "balanced",
    currentLocalAssessment: "recommended",
    currentOfficeAssessment: "unavailable",
    estimatedRuntime: {
      ...validResponse.estimatedRuntime,
      officeCurrent: null,
    },
  };

  assert.equal(validatePlannerResponse(localResponse, localRequest).recommendedPreset, "balanced");
});

test("rejects an unavailable preset for an Office Engine route", () => {
  const limitedRequest = {
    ...request,
    officeCapabilities: {
      ...request.officeCapabilities,
      presets: ["safe"],
    },
  };

  assert.throws(
    () => validatePlannerResponse(validResponse, limitedRequest),
    /recommendedPreset_not_available/,
  );
});

test("rejects office route when Office Engine is unavailable", () => {
  const unavailableRequest = {
    ...request,
    officeCapabilities: { ...request.officeCapabilities, availability: "unavailable" },
  };
  assert.throws(() => validatePlannerResponse(validResponse, unavailableRequest), /office_route_unavailable/);
});

test("rejects an unapproved capacity profile", () => {
  assert.throws(
    () => validatePlannerResponse({ ...validResponse, idealConfiguration: { id: "xlarge", cpuCores: 16, memoryMb: 32_768, label: "16 vCPU · 32 GB RAM" } }, request),
    /idealConfiguration_not_approved/,
  );
});

test("rejects unordered runtime ranges", () => {
  assert.throws(
    () => validatePlannerResponse({ ...validResponse, estimatedRuntime: { ...validResponse.estimatedRuntime, local: { min: 180, max: 90 } } }, request),
    /estimatedRuntime_local_unordered/,
  );
});

test("returns deterministic fallback when model output fails validation", async () => {
  const result = await createPlannerRecommendation(request, {
    requestModel: async () => ({ ...validResponse, recommendedRoute: "invalid" }),
  });
  assert.equal(result.status, "fallback");
  assert.equal(result.source, "deterministic");
  assert.equal(result.response.confidence, "low");
});

test("fallback never starts processing and remains contract-shaped", () => {
  const fallback = createDeterministicPlannerFallback(request, "test_failure");
  assert.equal(fallback.recommendedRoute, "office_current");
  assert.match(fallback.explanation, /No processing was started/);
});
