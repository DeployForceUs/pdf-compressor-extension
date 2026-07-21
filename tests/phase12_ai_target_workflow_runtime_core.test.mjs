import test from "node:test";
import assert from "node:assert/strict";

import { executeTargetWorkflowCompletion } from "../scripts/ai-lab-target-workflow-runtime-core.mjs";

const plan = {
  processingPlan: {
    split: {
      enabled: true,
      strategy: "by-max-size",
      targetPartSizeMb: 10,
      outputMode: "single-zip",
    },
  },
};

test("157 MB result dispatches split:local and never completes as PDF", async () => {
  const calls = [];

  const outcome = await executeTargetWorkflowCompletion({
    plan,
    actualBytes: 157_288_576,
    resultKind: "compressed",
    result: { id: "compressed-pdf" },
    storeSelectedPdf: async (result) => calls.push(["store", result.id]),
    sendMessage: async (request) => {
      calls.push(["message", request]);
      return { ok: true, accepted: true };
    },
    completePdf: async () => calls.push(["complete"]),
  });

  assert.equal(outcome.action, "split_zip");
  assert.equal(calls.some(([kind]) => kind === "complete"), false);
  assert.deepEqual(calls[0], ["store", "compressed-pdf"]);
  assert.equal(calls[1][0], "message");
  assert.deepEqual(calls[1][1], {
    type: "split:local",
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes: Math.floor(10 * 1024 * 1024 * 0.95),
    },
    outputMode: "single-zip",
    compressAfter: false,
  });
});

test("result inside target completes as PDF and never dispatches split", async () => {
  const calls = [];

  const outcome = await executeTargetWorkflowCompletion({
    plan,
    actualBytes: 9 * 1024 * 1024,
    resultKind: "compressed",
    result: { id: "compressed-pdf" },
    storeSelectedPdf: async () => calls.push(["store"]),
    sendMessage: async () => {
      calls.push(["message"]);
      return { ok: true };
    },
    completePdf: async (result) => calls.push(["complete", result.id]),
  });

  assert.equal(outcome.action, "complete_pdf");
  assert.deepEqual(calls, [["complete", "compressed-pdf"]]);
});
