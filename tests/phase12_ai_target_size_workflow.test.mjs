import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../scripts/apply-ai-lab-target-size-workflow.mjs", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("target-size recommendation exposes compress-validate-split workflow", () => {
  assert.match(source, /function targetSizeMb/);
  assert.match(source, /Compress, validate, then split into parts under/);
  assert.match(source, /aiTargetPartSizeMb/);
  assert.match(source, /Compress and split into parts/);
});

test("Office result is validated before target-size splitting", () => {
  assert.match(source, /continueTargetSizeWorkflow/);
  assert.match(source, /resultByteLength/);
  assert.match(source, /actualBytes <= targetBytes/);
  assert.match(source, /validating_target_size/);
});

test("oversized Office result is handed to the existing split pipeline", () => {
  assert.match(source, /type: "pdf:store"/);
  assert.match(source, /id: "selected-pdf"/);
  assert.match(source, /type: "split:local"/);
  assert.match(source, /type: "by-max-size"/);
  assert.match(source, /maxPartSizeBytes: Math\.max\(1, Math\.floor\(targetBytes \* 0\.95\)\)/);
  assert.match(source, /outputMode: "single-zip"/);
  assert.match(source, /compressAfter: false/);
});

test("split lifecycle ends with an explicit ZIP download", () => {
  assert.match(source, /split:progress/);
  assert.match(source, /split:result/);
  assert.match(source, /split:error/);
  assert.match(source, /button\.dataset\.aiAction = "download-split"/);
  assert.match(source, /Download split ZIP/);
  assert.match(source, /indexedDB\.databases\(\)/);
  assert.match(source, /split_downloaded/);
});

test("AI Lab postbuild applies target-size workflow after Office fallback", () => {
  const postbuild = packageJson.scripts["postbuild:ai"];
  const fallbackIndex = postbuild.indexOf("apply-ai-lab-office-connection-fallback.mjs");
  const targetIndex = postbuild.indexOf("apply-ai-lab-target-size-workflow.mjs");
  assert.ok(fallbackIndex >= 0);
  assert.ok(targetIndex > fallbackIndex);
});
