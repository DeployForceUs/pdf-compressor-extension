import assert from "node:assert/strict";
import test from "node:test";
import {
  isBackgroundSmartPlannerPrepareRequest,
  isOffscreenSmartPlannerPrepareRequest,
  SMART_PLANNER_BACKGROUND_PREPARE,
  SMART_PLANNER_OFFSCREEN_PREPARE,
  toOffscreenSmartPlannerPrepareRequest,
} from "../src/lib/ai/smart-planner-runtime-message-contract";

const backgroundRequest = {
  type: SMART_PLANNER_BACKGROUND_PREPARE,
  requestId: "planner-request-1",
  userGoal: {
    deliveryTarget: "email_20mb",
    qualityIntent: "print",
    speedPreference: "balanced",
    splitAllowed: true,
  },
  engineCapabilities: {
    localAvailable: true,
    officeAvailable: true,
    officeCpuCount: 8,
    officeMemoryGb: 16,
    allowedPresets: ["balanced"],
    maxFileSizeMb: 1000,
  },
};

test("accepts only the explicit background preparation contract", () => {
  assert.equal(isBackgroundSmartPlannerPrepareRequest(backgroundRequest), true);
  assert.equal(isBackgroundSmartPlannerPrepareRequest({ ...backgroundRequest, type: "background:compression-start" }), false);
  assert.equal(isBackgroundSmartPlannerPrepareRequest({ ...backgroundRequest, requestId: "" }), false);
  assert.equal(isBackgroundSmartPlannerPrepareRequest({ ...backgroundRequest, pdfBytes: [1, 2, 3] }), true);
});

test("converts background preparation to the isolated offscreen contract", () => {
  const offscreenRequest = toOffscreenSmartPlannerPrepareRequest(backgroundRequest);
  assert.deepEqual(offscreenRequest, {
    ...backgroundRequest,
    type: SMART_PLANNER_OFFSCREEN_PREPARE,
  });
  assert.equal(isOffscreenSmartPlannerPrepareRequest(offscreenRequest), true);

  const serialized = JSON.stringify(offscreenRequest);
  assert.doesNotMatch(serialized, /pdfBytes|fileName|mimeType|accessToken|baseUrl/);
});

test("rejects malformed or content-bearing offscreen payload shapes", () => {
  const valid = toOffscreenSmartPlannerPrepareRequest(backgroundRequest);
  assert.equal(isOffscreenSmartPlannerPrepareRequest({ ...valid, requestId: 42 }), false);
  assert.equal(isOffscreenSmartPlannerPrepareRequest({ ...valid, engineCapabilities: { ...valid.engineCapabilities, officeCpuCount: -1 } }), false);
  assert.equal(isOffscreenSmartPlannerPrepareRequest({ ...valid, userGoal: { ...valid.userGoal, splitAllowed: "yes" } }), false);
});
