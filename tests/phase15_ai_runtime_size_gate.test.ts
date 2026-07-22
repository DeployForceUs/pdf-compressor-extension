import assert from "node:assert/strict";
import test from "node:test";

import { createTargetContract } from "../src/lib/ai-runtime/domain/target-contract.js";
import { AiExecutionCoordinator } from "../src/lib/ai-runtime/execution-coordinator.js";
import type { CompressedResultStore, CompressionPort, PersistedCompressedResult } from "../src/lib/ai-runtime/ports.js";

const TARGET_BYTES = 10 * 1024 * 1024;

async function coordinatorAtVerifiedSize(actualBytes: number): Promise<AiExecutionCoordinator> {
  const compression: CompressionPort = { async start() {} };
  const persisted: PersistedCompressedResult = {
    recordId: "compressed-pdf",
    sourceRecordId: "selected-pdf",
    byteLength: actualBytes,
  };
  const compressedResults: CompressedResultStore = {
    async read(recordId) {
      return recordId === persisted.recordId ? persisted : null;
    },
  };

  const coordinator = new AiExecutionCoordinator({ compression, compressedResults, now: () => 1234 });
  coordinator.confirmContract({
    executionId: "execution-size-gate",
    sourceRecordId: "selected-pdf",
    contract: createTargetContract({ contractId: "email-10mb", goalKind: "email", targetSizeMb: 10 }),
  });
  coordinator.beginPlanning();
  coordinator.acceptPlan({ route: "local", preset: "balanced" });
  await coordinator.startCompression();
  const claimed = await coordinator.handleCompressionResult({
    executionId: "execution-size-gate",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: actualBytes,
  });
  assert.equal(claimed, true);
  assert.equal(coordinator.state.status, "validating_compressed_result");
  return coordinator;
}

test("below target completes as PDF only after deterministic size evaluation", async () => {
  const coordinator = await coordinatorAtVerifiedSize(TARGET_BYTES - 1);
  assert.equal(coordinator.snapshot().capabilities.canDownloadPdf, false);
  assert.equal(coordinator.evaluateCompressedResultSize(), "complete_pdf");
  assert.equal(coordinator.state.status, "completed_pdf");
  assert.equal(coordinator.snapshot().capabilities.canDownloadPdf, true);
});

test("equal to target completes as PDF", async () => {
  const coordinator = await coordinatorAtVerifiedSize(TARGET_BYTES);
  assert.equal(coordinator.evaluateCompressedResultSize(), "complete_pdf");
  assert.equal(coordinator.state.status, "completed_pdf");
});

test("above target never completes as PDF and enters split preparation", async () => {
  const coordinator = await coordinatorAtVerifiedSize(TARGET_BYTES + 1);
  assert.equal(coordinator.evaluateCompressedResultSize(), "prepare_split");
  assert.equal(coordinator.state.status, "splitting");
  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.capabilities.canDownloadPdf, false);
  assert.equal(snapshot.capabilities.canPrepareSplit, true);
});

test("download capability is unavailable before the terminal PDF decision", async () => {
  const coordinator = await coordinatorAtVerifiedSize(TARGET_BYTES - 1);
  const snapshot = coordinator.snapshot();
  assert.equal(snapshot.state, "validating_compressed_result");
  assert.equal(snapshot.capabilities.canDownloadPdf, false);
  assert.equal(snapshot.lastTransition, "COMPRESSED_RESULT_VERIFIED");
});

test("repeated runs produce the same boundary decisions", async () => {
  const sizes = [TARGET_BYTES - 1, TARGET_BYTES, TARGET_BYTES + 1] as const;
  const first: string[] = [];
  const second: string[] = [];

  for (const size of sizes) first.push((await coordinatorAtVerifiedSize(size)).evaluateCompressedResultSize());
  for (const size of sizes) second.push((await coordinatorAtVerifiedSize(size)).evaluateCompressedResultSize());

  assert.deepEqual(first, ["complete_pdf", "complete_pdf", "prepare_split"]);
  assert.deepEqual(second, first);
});

test("size evaluation cannot run before compressed artifact verification", () => {
  const coordinator = new AiExecutionCoordinator({
    compression: { async start() {} },
    compressedResults: { async read() { return null; } },
  });
  assert.throws(() => coordinator.evaluateCompressedResultSize(), /size_gate_invalid_state:idle/);
});
