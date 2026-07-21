import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/apply-ai-lab-license-recovery.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("AI Lab keeps the existing monetization enforcement boundary", () => {
  assert.match(source, /FREE_DAILY_LIMIT_REACHED/);
  assert.match(source, /PRO_REQUIRED/);
  assert.doesNotMatch(source, /authorizeOperation\s*=|reserveUsage\s*=|dailyCompressionLimit\s*:/);
  assert.doesNotMatch(source, /background:compression-start[^]*offscreen:compression-start/);
});

test("AI Lab offers local Pro activation without logging or persisting the token itself", () => {
  assert.match(source, /type: "license:activate", token: value/);
  assert.match(source, /Pro activation required/);
  assert.match(source, /Activate Pro to continue/);
  assert.match(source, /verified locally/);
  assert.match(source, /token\.value = ""/);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)\([^)]*token/);
  assert.doesNotMatch(source, /chrome\.storage|browser\.storage|localStorage/);
  assert.doesNotMatch(source, /emit\([^)]*token/);
});

test("AI Lab restores the original execution action only after verified Pro activation", () => {
  assert.match(source, /!result\?\.ok \|\| !result\?\.isPro/);
  assert.match(source, /button\.dataset\.aiAction = "process"/);
  assert.match(source, /button\.dataset\.aiOriginalLabel \|\| "Process PDF"/);
  assert.match(source, /status: "license_activated"/);
});

test("AI Lab postbuild applies license recovery after the execution router", () => {
  const postbuild = packageJson.scripts["postbuild:ai"];
  assert.ok(postbuild.indexOf("apply-ai-lab-execution-router.mjs") < postbuild.indexOf("apply-ai-lab-license-recovery.mjs"));
});
