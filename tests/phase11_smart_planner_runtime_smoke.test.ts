import assert from "node:assert/strict";
import test from "node:test";
import {
  isBackgroundSmartPlannerPrepareRequest,
  isOffscreenSmartPlannerPrepareRequest,
  toOffscreenSmartPlannerPrepareRequest,
} from "../src/lib/ai/smart-planner-runtime-message-contract";
import { prepareSmartPlannerRuntimeRequest } from "../src/lib/ai/smart-planner-runtime-preparation";
import type { ContentBlindProfilerResult } from "../src/lib/ai/content-blind-pdf-profiler";

const minimalPdf = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
);

const completeProfile: ContentBlindProfilerResult = {
  schemaVersion: 1,
  status: "complete",
  documentProfile: {
    schemaVersion: 1,
    fileSizeBytes: minimalPdf.byteLength,
    pageCount: 1,
    scannedPageRatio: 0,
    vectorPageRatio: 1,
    textPageRatio: 0,
    imageObjectCount: 0,
    codecCounts: { jpeg: 0, jpx: 0, other: 0 },
    estimatedDpi: { p50: 0, p90: 0, max: 0 },
    estimatedPageSizeBytes: {
      p50: minimalPdf.byteLength,
      p90: minimalPdf.byteLength,
      max: minimalPdf.byteLength,
    },
  },
  unavailableMetrics: [],
};

test("smokes background to offscreen Planner preparation without exposing PDF content", async () => {
  const backgroundMessage = {
    type: "background:smart-planner-prepare" as const,
    requestId: "runtime-smoke",
    userGoal: {
      deliveryTarget: "email_20mb",
      qualityIntent: "screen",
      speedPreference: "balanced",
      splitAllowed: true,
    },
    engineCapabilities: {
      localAvailable: true,
      officeAvailable: true,
      officeCpuCount: 8,
      officeMemoryGb: 16,
      allowedPresets: ["balanced"],
      maxFileSizeMb: 1024,
    },
  };

  assert.equal(isBackgroundSmartPlannerPrepareRequest(backgroundMessage), true);

  const offscreenMessage = toOffscreenSmartPlannerPrepareRequest(backgroundMessage);
  assert.equal(isOffscreenSmartPlannerPrepareRequest(offscreenMessage), true);

  let workerCalls = 0;
  const response = await prepareSmartPlannerRuntimeRequest(
    {
      requestId: offscreenMessage.requestId,
      userGoal: offscreenMessage.userGoal,
      engineCapabilities: offscreenMessage.engineCapabilities,
      mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js",
    },
    {
      readSelectedPdf: async () => ({
        id: "selected-pdf",
        name: "private-client-file.pdf",
        size: minimalPdf.byteLength,
        type: "application/pdf",
        lastModified: 0,
        data: [...minimalPdf],
      }),
      profilePdf: async (request) => {
        workerCalls += 1;
        assert.equal(request.input.byteLength, minimalPdf.byteLength);
        assert.equal(new Uint8Array(request.input)[0], 0x25);
        return completeProfile;
      },
    },
  );

  assert.equal(workerCalls, 1);
  assert.equal(response.ok, true);
  assert.equal(response.executionAllowed, false);
  assert.equal(response.requiresUserConfirmation, true);
  if (!response.ok) return;

  assert.equal(response.preparation.status, "ready");
  assert.equal(response.preparation.executionAllowed, false);
  assert.equal(response.preparation.requiresUserConfirmation, true);

  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /private-client-file\.pdf/);
  assert.doesNotMatch(serialized, /application\/pdf/);
  assert.doesNotMatch(serialized, /%PDF-1\.4/);
  assert.doesNotMatch(serialized, /accessToken|baseUrl|blob|buffer|filename/i);
});
