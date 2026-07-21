import test from "node:test";
import assert from "node:assert/strict";

import {
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "../scripts/ai-lab-target-workflow-contract.mjs";

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

test("157 MB Office result must split for a 10 MB contract", () => {
  const contract = assertTargetWorkflowPlan(plan);
  const decision = decideTargetWorkflowCompletion({
    contract,
    actualBytes: 157_288_576,
    resultKind: "compressed",
  });

  assert.equal(decision.action, "split_zip");
  assert.deepEqual(decision.request, {
    type: "split:local",
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes: Math.floor(10 * 1024 * 1024 * 0.95),
    },
    outputMode: "single-zip",
    compressAfter: false,
  });
});

test("Office original result must split even when reported inside target", () => {
  const contract = assertTargetWorkflowPlan(plan);
  const decision = decideTargetWorkflowCompletion({
    contract,
    actualBytes: 9 * 1024 * 1024,
    resultKind: "original",
  });

  assert.equal(decision.action, "split_zip");
});

test("compressed result inside target completes as PDF", () => {
  const contract = assertTargetWorkflowPlan(plan);
  const decision = decideTargetWorkflowCompletion({
    contract,
    actualBytes: 9 * 1024 * 1024,
    resultKind: "compressed",
  });

  assert.deepEqual(decision, { action: "complete_pdf" });
});

test("missing structured split contract is rejected", () => {
  assert.throws(
    () => assertTargetWorkflowPlan({ processingPlan: {} }),
    /target_workflow_split_required/,
  );
});
