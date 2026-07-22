import assert from "node:assert/strict";
import test from "node:test";

import { createTargetContract } from "../src/lib/ai-runtime/domain/target-contract.js";
import { AiExecutionCoordinator } from "../src/lib/ai-runtime/execution-coordinator.js";
import type {
  CompressedResultStore,
  CompressionPort,
  SplitPort,
  SplitStartRequest,
} from "../src/lib/ai-runtime/ports.js";

const contract = createTargetContract({
  contractId: "email-10mb",
  goalKind: "email",
  targetSizeMb: 10,
});

function harness() {
  const splitRequests: SplitStartRequest[] = [];
  const compression: CompressionPort = { async start() {} };
  const compressedResults: CompressedResultStore = {
    async read(recordId) {
      if (recordId !== "compressed-pdf") return null;
      return {
        recordId: "compressed-pdf",
        sourceRecordId: "selected-pdf",
        byteLength: 12 * 1024 * 1024,
      };
    },
  };
  const split: SplitPort = {
    async start(request) {
      splitRequests.push(request);
    },
  };
  const coordinator = new AiExecutionCoordinator({ compression, compressedResults, split });
  coordinator.confirmContract({
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    contract,
  });
  coordinator.beginPlanning();
  coordinator.acceptPlan({ route: "local", preset: "balanced" });
  return { coordinator, splitRequests };
}

async function toSplitPreparation() {
  const result = harness();
  await result.coordinator.startCompression();
  assert.equal(await result.coordinator.handleCompressionResult({
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 12 * 1024 * 1024,
  }), true);
  assert.equal(result.coordinator.evaluateCompressedResultSize(), "prepare_split");
  assert.equal(result.coordinator.state.status, "splitting");
  return result;
}

test("dispatches split with owned compressed artifact and contract-derived settings", async () => {
  const { coordinator, splitRequests } = await toSplitPreparation();
  assert.equal(coordinator.snapshot().capabilities.canPrepareSplit, true);

  await coordinator.startSplit();

  assert.deepEqual(splitRequests, [{
    executionId: "execution-1",
    compressedRecordId: "compressed-pdf",
    targetBytes: contract.targetBytes,
    outputMode: contract.outputMode,
  }]);
  assert.notEqual(splitRequests[0]?.compressedRecordId, "selected-pdf");
  assert.equal(coordinator.snapshot().capabilities.canPrepareSplit, false);
});

test("makes duplicate split dispatch impossible", async () => {
  const { coordinator, splitRequests } = await toSplitPreparation();
  await coordinator.startSplit();
  await assert.rejects(() => coordinator.startSplit(), /split_already_dispatched:execution-1/);
  assert.equal(splitRequests.length, 1);
});

test("ignores stale or mismatched split results safely", async () => {
  const { coordinator } = await toSplitPreparation();
  await coordinator.startSplit();

  assert.equal(coordinator.handleSplitResult({
    executionId: "stale-execution",
    compressedRecordId: "compressed-pdf",
    artifactIds: ["part-1", "part-2"],
  }), false);
  assert.equal(coordinator.handleSplitResult({
    executionId: "execution-1",
    compressedRecordId: "other-compressed-pdf",
    artifactIds: ["part-1", "part-2"],
  }), false);
  assert.equal(coordinator.state.status, "splitting");
});

test("accepts one correlated split result and enters part validation", async () => {
  const { coordinator } = await toSplitPreparation();
  await coordinator.startSplit();

  assert.equal(coordinator.handleSplitResult({
    executionId: "execution-1",
    compressedRecordId: "compressed-pdf",
    artifactIds: ["part-1", "part-2"],
  }), true);
  assert.equal(coordinator.state.status, "validating_split_parts");
  if (coordinator.state.status !== "validating_split_parts") throw new Error("unexpected state");
  assert.deepEqual(coordinator.state.artifactIds, ["part-1", "part-2"]);
});

test("cancellation prevents a late split result from changing state", async () => {
  const { coordinator } = await toSplitPreparation();
  await coordinator.startSplit();
  coordinator.cancel();
  assert.equal(coordinator.state.status, "cancelled");

  assert.equal(coordinator.handleSplitResult({
    executionId: "execution-1",
    compressedRecordId: "compressed-pdf",
    artifactIds: ["part-1", "part-2"],
  }), false);
  assert.equal(coordinator.state.status, "cancelled");
});
