import assert from "node:assert/strict";
import test from "node:test";
import type { ContentBlindProfilerResult } from "../src/lib/ai/content-blind-pdf-profiler";
import { prepareSmartPlannerRequestForSelectedPdf } from "../src/lib/ai/smart-planner-request-preparation";

const profilerResult: ContentBlindProfilerResult = {
  schemaVersion: 1,
  status: "incomplete",
  derivedMetrics: {
    fileSizeBytes: 4,
    pageCount: 1,
    imageObjectCount: 0,
    codecCounts: { jpeg: 0, jpx: 0, other: 0 },
    pageImageStreamSizeDistributionBytes: { p50: null, p90: null, max: null },
  },
  unavailableMetrics: ["pageClassification", "estimatedDpi"],
};

test("profiles the selected PDF bytes but blocks an incomplete Planner request", async () => {
  let capturedBytes: number[] | null = null;
  let capturedRuntimeUrl = "";

  const result = await prepareSmartPlannerRequestForSelectedPdf(
    {
      selectedPdf: {
        id: "selected-pdf",
        name: "private-customer-name.pdf",
        size: 4,
        type: "application/pdf",
        lastModified: 123,
        data: [37, 80, 68, 70],
      },
      mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js",
      requestId: "ephemeral-request",
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
    },
    async (request) => {
      capturedBytes = [...new Uint8Array(request.input)];
      capturedRuntimeUrl = request.mupdfRuntimeUrl;
      return profilerResult;
    },
  );

  assert.deepEqual(capturedBytes, [37, 80, 68, 70]);
  assert.equal(capturedRuntimeUrl, "chrome-extension://test/vendor/mupdf/mupdf.js");
  assert.deepEqual(result, {
    status: "blocked",
    reason: "incomplete_document_profile",
    unavailableMetrics: ["pageClassification", "estimatedDpi"],
    derivedMetrics: profilerResult.derivedMetrics,
    executionAllowed: false,
    requiresUserConfirmation: true,
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private-customer-name/);
  assert.doesNotMatch(serialized, /ephemeral-request/);
  assert.doesNotMatch(serialized, /email_20mb/);
  assert.doesNotMatch(serialized, /application\/pdf/);
  assert.doesNotMatch(serialized, /37,80,68,70/);
});

test("forwards cancellation to the profiler and never creates an executable plan", async () => {
  const cancelled = () => true;
  let receivedCancellation: (() => boolean | Promise<boolean>) | null = null;

  await assert.rejects(
    prepareSmartPlannerRequestForSelectedPdf(
      {
        selectedPdf: {
          id: "selected-pdf",
          name: "secret.pdf",
          size: 1,
          type: "application/pdf",
          lastModified: 0,
          data: [1],
        },
        mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js",
        requestId: "request",
        userGoal: {
          deliveryTarget: "email_20mb",
          qualityIntent: "print",
          speedPreference: "balanced",
          splitAllowed: false,
        },
        engineCapabilities: {
          localAvailable: true,
          officeAvailable: false,
          officeCpuCount: 0,
          officeMemoryGb: 0,
          allowedPresets: ["balanced"],
          maxFileSizeMb: 250,
        },
      },
      async (_request, isCancelled) => {
        receivedCancellation = isCancelled;
        if (await isCancelled()) throw new Error("cancelled");
        return profilerResult;
      },
      cancelled,
    ),
    /cancelled/,
  );

  assert.equal(receivedCancellation, cancelled);
});
