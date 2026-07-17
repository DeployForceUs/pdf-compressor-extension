import assert from "node:assert/strict";
import test from "node:test";

import { evaluateOutputArtifact } from "../engine/output-artifact-policy.mjs";

const valid = {
  inputBytes: 6_398_446,
  inputPageCount: 220,
  outputBytes: 5_000_000,
  outputPageCount: 220,
  outputOpens: true,
};

test("accepts only an open, page-preserving, smaller output", () => {
  assert.deepEqual(evaluateOutputArtifact(valid), {
    action: "accept_output",
    reason: "validated_smaller_output",
    savedBytes: 1_398_446,
  });
});

test("retains original when output is equal or larger", () => {
  assert.deepEqual(
    evaluateOutputArtifact({ ...valid, outputBytes: valid.inputBytes }),
    { action: "retain_original", reason: "not_smaller" },
  );
  assert.deepEqual(
    evaluateOutputArtifact({ ...valid, outputBytes: 6_520_108 }),
    { action: "retain_original", reason: "not_smaller" },
  );
});

test("retains original for invalid output or page-count mismatch", () => {
  assert.deepEqual(evaluateOutputArtifact({ ...valid, outputOpens: false }), {
    action: "retain_original",
    reason: "output_invalid",
  });
  assert.deepEqual(
    evaluateOutputArtifact({ ...valid, outputPageCount: 219 }),
    { action: "retain_original", reason: "page_count_mismatch" },
  );
});

test("rejects invalid metric values rather than guessing", () => {
  assert.throws(
    () => evaluateOutputArtifact({ ...valid, outputBytes: 0 }),
    /outputBytes must be a positive safe integer/,
  );
});
