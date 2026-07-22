import assert from "node:assert/strict";
import test from "node:test";

import { AiExecutionCoordinator } from "../src/lib/ai-runtime/execution-coordinator.js";
import { createTargetContract } from "../src/lib/ai-runtime/domain/target-contract.js";
import type { CompressedResultStore, CompressionPort, PersistedCompressedResult } from "../src/lib/ai-runtime/ports.js";

const contract = createTargetContract({ contractId: "email-10mb", goalKind: "email", targetSizeMb: 10 });

function harness(records: readonly PersistedCompressedResult[] = []) {
  const starts: unknown[] = [];
  const compression: CompressionPort = {
    async start(request) {
      starts.push(request);
    },
  };
  const compressedResults: CompressedResultStore = {
    async read(recordId) {
      return records.find((record) => record.recordId === recordId) ?? null;
    },
  };
  const coordinator = new AiExecutionCoordinator({ compression, compressedResults, now: () => 1234 });
  coordinator.confirmContract({ executionId: "execution-1", sourceRecordId: "selected-pdf", contract });
  coordinator.beginPlanning();
  coordinator.acceptPlan({ route: "local", preset: "balanced" });
  return { coordinator, starts };
}

test("starts compression through an injected port with the active execution identity", async () => {
  const { coordinator, starts } = harness();
  await coordinator.startCompression();
  assert.equal(coordinator.state.status, "compressing");
  assert.deepEqual(starts, [{
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    route: "local",
    preset: "balanced",
  }]);
});

test("ignores stale and mismatched compression result events", async () => {
  const { coordinator } = harness();
  await coordinator.startCompression();
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "stale-execution",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 100,
  }), false);
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "execution-1",
    sourceRecordId: "other-source",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 100,
  }), false);
  assert.equal(coordinator.state.status, "compressing");
});

test("rejects substitution of the original selected PDF", async () => {
  const { coordinator } = harness();
  await coordinator.startCompression();
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "selected-pdf",
    metadataBytes: 100,
  }), false);
  assert.equal(coordinator.state.status, "failed");
});

test("claims persisted compressed bytes and stops before the phase 3 size decision", async () => {
  const { coordinator } = harness([{ recordId: "compressed-pdf", sourceRecordId: "selected-pdf", byteLength: 8 * 1024 * 1024 }]);
  await coordinator.startCompression();
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 8 * 1024 * 1024,
  }), true);
  assert.equal(coordinator.state.status, "validating_compressed_result");
  const snapshot = coordinator.snapshot();
  assert.deepEqual(snapshot, {
    executionId: "execution-1",
    owner: "ai-execution-coordinator",
    state: "validating_compressed_result",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 8 * 1024 * 1024,
    actualBytes: 8 * 1024 * 1024,
    lastTransition: "COMPRESSED_RESULT_VERIFIED",
    timestamp: 1234,
  });
});

test("fails safely when persisted identity or byte length does not match metadata", async () => {
  const { coordinator } = harness([{ recordId: "compressed-pdf", sourceRecordId: "selected-pdf", byteLength: 99 }]);
  await coordinator.startCompression();
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 100,
  }), false);
  assert.equal(coordinator.state.status, "failed");
});
