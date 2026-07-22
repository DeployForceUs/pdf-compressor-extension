import assert from "node:assert/strict";
import test from "node:test";

import { createTargetContract } from "../src/lib/ai-runtime/domain/target-contract.js";
import { INITIAL_EXECUTION_STATE, transitionExecution } from "../src/lib/ai-runtime/domain/execution-state.js";
import { executionFailure } from "../src/lib/ai-runtime/domain/execution-errors.js";

const contract = createTargetContract({ contractId: "email-10mb", goalKind: "email", targetSizeMb: 10 });

function toCompressing() {
  let state = transitionExecution(INITIAL_EXECUTION_STATE, {
    type: "CONTRACT_CONFIRMED",
    executionId: "execution-1",
    sourceRecordId: "selected-pdf",
    contract,
  });
  state = transitionExecution(state, { type: "PLANNING_STARTED" });
  state = transitionExecution(state, { type: "PLAN_READY", route: "local", preset: "balanced" });
  return transitionExecution(state, { type: "COMPRESSION_STARTED" });
}

test("creates an immutable 10 MB single-zip target contract", () => {
  assert.equal(contract.targetBytes, 10 * 1024 * 1024);
  assert.equal(contract.splitEnabled, true);
  assert.equal(contract.outputMode, "single-zip");
  assert.equal(Object.isFrozen(contract), true);
  assert.throws(() => createTargetContract({ contractId: "bad", goalKind: "email", targetSizeMb: 0 }), /targetSizeMb_invalid/);
});

test("enforces coordinator ownership before compression result handling", () => {
  const state = toCompressing();
  assert.equal(state.status, "compressing");
  if (state.status !== "compressing") throw new Error("unexpected state");
  assert.equal(state.owner, "ai-execution-coordinator");
  assert.equal(state.sourceRecordId, "selected-pdf");
});

test("never completes directly from compressing", () => {
  const state = toCompressing();
  assert.throws(
    () => transitionExecution(state, { type: "COMPRESSED_RESULT_VERIFIED", actualBytes: 1024 }),
    /invalid_transition:compressing:COMPRESSED_RESULT_VERIFIED/,
  );
});

test("completes as PDF only after claiming and verifying persisted compressed bytes", () => {
  let state = toCompressing();
  state = transitionExecution(state, {
    type: "COMPRESSION_RESULT_RECEIVED",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 8 * 1024 * 1024,
  });
  assert.equal(state.status, "claiming_compressed_result");
  state = transitionExecution(state, { type: "COMPRESSED_RESULT_VERIFIED", actualBytes: 8 * 1024 * 1024 });
  assert.equal(state.status, "completed_pdf");
  if (state.status !== "completed_pdf") throw new Error("unexpected state");
  assert.equal(state.compressedRecordId, "compressed-pdf");
});

test("routes oversized compressed result through split validation before ZIP completion", () => {
  let state = toCompressing();
  state = transitionExecution(state, {
    type: "COMPRESSION_RESULT_RECEIVED",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 12 * 1024 * 1024,
  });
  state = transitionExecution(state, { type: "COMPRESSED_RESULT_VERIFIED", actualBytes: 12 * 1024 * 1024 });
  assert.equal(state.status, "validating_compressed_result");
  state = transitionExecution(state, { type: "SPLIT_STARTED" });
  state = transitionExecution(state, { type: "SPLIT_COMPLETED", artifactIds: ["part-1", "part-2"] });
  assert.equal(state.status, "validating_split_parts");
  state = transitionExecution(state, { type: "SPLIT_PARTS_VALIDATED", artifactIds: ["part-1", "part-2"] });
  assert.equal(state.status, "creating_zip");
  state = transitionExecution(state, { type: "ZIP_CREATED", zipRecordId: "zip-1" });
  assert.equal(state.status, "completed_zip");
});

test("rejects mismatched persisted byte length", () => {
  let state = toCompressing();
  state = transitionExecution(state, {
    type: "COMPRESSION_RESULT_RECEIVED",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 100,
  });
  assert.throws(
    () => transitionExecution(state, { type: "COMPRESSED_RESULT_VERIFIED", actualBytes: 99 }),
    /compressed_result_size_mismatch/,
  );
});

test("supports explicit failure, cancellation and reset without browser dependencies", () => {
  const compressing = toCompressing();
  const failed = transitionExecution(compressing, {
    type: "FAILED",
    failure: executionFailure("compression_failed", "Compression failed"),
  });
  assert.equal(failed.status, "failed");
  assert.equal(transitionExecution(failed, { type: "RESET" }).status, "idle");

  const cancelling = transitionExecution(compressing, { type: "CANCEL_REQUESTED" });
  assert.equal(cancelling.status, "cancelling");
  const cancelled = transitionExecution(cancelling, { type: "CANCELLED" });
  assert.equal(cancelled.status, "cancelled");
});
