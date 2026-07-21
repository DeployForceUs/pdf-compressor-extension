import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlindProfilerResult } from "../src/lib/ai/content-blind-pdf-profiler";
import { prepareSmartPlannerRuntimeRequest } from "../src/lib/ai/smart-planner-runtime-preparation";

const completeProfile: ContentBlindProfilerResult = {
  schemaVersion: 1,
  status: "complete",
  documentProfile: {
    schemaVersion: 1,
    fileSizeBytes: 4,
    pageCount: 1,
    scannedPageRatio: 1,
    vectorPageRatio: 0,
    textPageRatio: 0,
    imageObjectCount: 1,
    codecCounts: { jpeg: 1, jpx: 0, other: 0 },
    estimatedDpi: { p50: 300, p90: 300, max: 300 },
    estimatedPageSizeBytes: { p50: 4, p90: 4, max: 4 },
  },
  unavailableMetrics: [],
};

const input = {
  requestId: "runtime-request",
  mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js",
  userGoal: {
    deliveryTarget: "email_20mb" as const,
    qualityIntent: "print" as const,
    speedPreference: "balanced" as const,
    splitAllowed: true,
  },
  engineCapabilities: {
    localAvailable: true,
    officeAvailable: true,
    officeCpuCount: 8,
    officeMemoryGb: 16,
    allowedPresets: ["balanced" as const],
    maxFileSizeMb: 1000,
  },
};

test("reads the selected PDF and returns only a non-executable preparation", async () => {
  let profileCalls = 0;
  const response = await prepareSmartPlannerRuntimeRequest(input, {
    readSelectedPdf: async () => ({
      id: "selected-pdf",
      name: "private.pdf",
      size: 4,
      type: "application/pdf",
      lastModified: 0,
      data: [37, 80, 68, 70],
    }),
    profilePdf: async () => {
      profileCalls += 1;
      return completeProfile;
    },
  });

  assert.equal(profileCalls, 1);
  assert.equal(response.ok, true);
  assert.equal(response.executionAllowed, false);
  assert.equal(response.requiresUserConfirmation, true);
  if (!response.ok) return;
  assert.equal(response.preparation.status, "ready");
  assert.equal(response.preparation.executionAllowed, false);
  assert.equal(response.preparation.requiresUserConfirmation, true);

  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /private\.pdf/);
  assert.doesNotMatch(serialized, /application\/pdf/);
  assert.doesNotMatch(serialized, /37,80,68,70/);
});

test("does not profile when no selected PDF exists", async () => {
  let profileCalls = 0;
  const response = await prepareSmartPlannerRuntimeRequest(input, {
    readSelectedPdf: async () => null,
    profilePdf: async () => {
      profileCalls += 1;
      return completeProfile;
    },
  });

  assert.equal(profileCalls, 0);
  assert.deepEqual(response, {
    ok: false,
    error: "NO_SELECTED_PDF",
    message: "No selected PDF record is available",
    executionAllowed: false,
    requiresUserConfirmation: true,
  });
});

test("cancellation prevents selected PDF access and profiling", async () => {
  let readCalls = 0;
  let profileCalls = 0;
  const response = await prepareSmartPlannerRuntimeRequest(input, {
    readSelectedPdf: async () => {
      readCalls += 1;
      return null;
    },
    profilePdf: async () => {
      profileCalls += 1;
      return completeProfile;
    },
    isCancelled: () => true,
  });

  assert.equal(readCalls, 0);
  assert.equal(profileCalls, 0);
  assert.deepEqual(response, {
    ok: false,
    error: "CANCELLED",
    message: "Smart Planner preparation was cancelled",
    executionAllowed: false,
    requiresUserConfirmation: true,
  });
});
