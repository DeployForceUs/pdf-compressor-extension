import assert from "node:assert/strict";
import test from "node:test";
import { prepareSmartPlannerRequestForSelectedPdf } from "../src/lib/ai/smart-planner-request-preparation";

const documentProfile = {
  fileSizeBytes: 1000,
  pageCount: 1,
  imageObjectCount: 1,
  scannedPageRatio: 1,
  vectorPageRatio: 0,
  textPageRatio: 0,
  estimatedDpiBuckets: { under150: 0, "150to300": 1, over300: 0 },
  codecCounts: { jpeg: 1, jpx: 0, other: 0 },
  pageSizeDistributionBytes: { p50: 800, p90: 800, max: 800 },
};

test("creates a real Planner request but keeps execution blocked pending confirmation", async () => {
  const result = await prepareSmartPlannerRequestForSelectedPdf(
    {
      selectedPdf: {
        id: "selected-pdf",
        name: "private.pdf",
        size: 4,
        type: "application/pdf",
        lastModified: 0,
        data: [37, 80, 68, 70],
      },
      mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js",
      requestId: "request-123",
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
    async () => ({
      schemaVersion: 1,
      status: "complete",
      documentProfile,
      unavailableMetrics: [],
    }),
  );

  assert.equal(result.status, "ready");
  assert.equal(result.executionAllowed, false);
  assert.equal(result.requiresUserConfirmation, true);
  if (result.status !== "ready") throw new Error("Expected ready request");
  assert.deepEqual(result.request.documentProfile, documentProfile);
  assert.equal(result.request.requestId, "request-123");
  assert.equal(result.request.userGoal.deliveryTarget, "email_20mb");

  const serialized = JSON.stringify(result.request);
  assert.doesNotMatch(serialized, /private\.pdf/);
  assert.doesNotMatch(serialized, /application\/pdf/);
  assert.doesNotMatch(serialized, /37,80,68,70/);
});
