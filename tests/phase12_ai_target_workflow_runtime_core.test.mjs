import test from "node:test";
import assert from "node:assert/strict";

import {
  claimCompressedResultHandoff,
  executeTargetWorkflowCompletion,
} from "../scripts/ai-lab-target-workflow-runtime-core.mjs";

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

function persistedCompressedRecord(overrides = {}) {
  return {
    id: "compressed-pdf",
    sourceRecordId: "selected-pdf",
    fileName: "fixture.pdf",
    mimeType: "application/pdf",
    data: new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

test("coordinator claims compressed metadata and persisted bytes reference", () => {
  const ownership = claimCompressedResultHandoff({
    resultMetadata: {
      id: "compressed-pdf",
      sourceRecordId: "selected-pdf",
      compressedSize: 3,
    },
    persistedRecord: persistedCompressedRecord(),
  });

  assert.equal(ownership.owner, "target-workflow-coordinator");
  assert.equal(ownership.recordId, "compressed-pdf");
  assert.equal(ownership.sourceRecordId, "selected-pdf");
  assert.equal(ownership.byteLength, 3);
  assert.equal(Object.isFrozen(ownership), true);
  assert.equal(Object.isFrozen(ownership.metadata), true);
});

test("mismatched persisted record is rejected before completion", async () => {
  const calls = [];

  await assert.rejects(
    executeTargetWorkflowCompletion({
      plan,
      actualBytes: 9 * 1024 * 1024,
      resultKind: "compressed",
      result: { id: "compressed-pdf" },
      readPersistedResult: async (recordId) => {
        calls.push(["read", recordId]);
        return persistedCompressedRecord({ id: "selected-pdf" });
      },
      storeSelectedPdf: async () => calls.push(["store"]),
      sendMessage: async () => calls.push(["message"]),
      completePdf: async () => calls.push(["complete"]),
    }),
    /compressed_result_record_mismatch/,
  );

  assert.deepEqual(calls, [["read", "compressed-pdf"]]);
});

test("157 MB result dispatches split:local and never completes as PDF", async () => {
  const calls = [];

  const outcome = await executeTargetWorkflowCompletion({
    plan,
    actualBytes: 157_288_576,
    resultKind: "compressed",
    result: { id: "compressed-pdf" },
    readPersistedResult: async (recordId) => {
      calls.push(["read", recordId]);
      return persistedCompressedRecord();
    },
    storeSelectedPdf: async (record, ownership) =>
      calls.push(["store", record.id, ownership.recordId]),
    sendMessage: async (request, ownership) => {
      calls.push(["message", request, ownership.recordId]);
      return { ok: true, accepted: true };
    },
    completePdf: async () => calls.push(["complete"]),
  });

  assert.equal(outcome.action, "split_zip");
  assert.equal(outcome.ownership.owner, "target-workflow-coordinator");
  assert.equal(calls.some(([kind]) => kind === "complete"), false);
  assert.deepEqual(calls[0], ["read", "compressed-pdf"]);
  assert.deepEqual(calls[1], ["store", "compressed-pdf", "compressed-pdf"]);
  assert.equal(calls[2][0], "message");
  assert.deepEqual(calls[2][1], {
    type: "split:local",
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes: Math.floor(10 * 1024 * 1024 * 0.95),
    },
    outputMode: "single-zip",
    compressAfter: false,
  });
  assert.equal(calls[2][2], "compressed-pdf");
});

test("result inside target completes as PDF only after coordinator ownership", async () => {
  const calls = [];

  const outcome = await executeTargetWorkflowCompletion({
    plan,
    actualBytes: 9 * 1024 * 1024,
    resultKind: "compressed",
    result: { id: "compressed-pdf" },
    readPersistedResult: async (recordId) => {
      calls.push(["read", recordId]);
      return persistedCompressedRecord();
    },
    storeSelectedPdf: async () => calls.push(["store"]),
    sendMessage: async () => {
      calls.push(["message"]);
      return { ok: true };
    },
    completePdf: async (result, ownership) =>
      calls.push(["complete", result.id, ownership.owner]),
  });

  assert.equal(outcome.action, "complete_pdf");
  assert.equal(outcome.ownership.recordId, "compressed-pdf");
  assert.deepEqual(calls, [
    ["read", "compressed-pdf"],
    ["complete", "compressed-pdf", "target-workflow-coordinator"],
  ]);
});
