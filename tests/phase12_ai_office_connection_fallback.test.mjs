import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/apply-ai-lab-office-connection-fallback.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("AI Lab handles an unconnected Office Engine as a recoverable state", () => {
  assert.match(source, /office engine is not connected/i);
  assert.match(source, /renderOfficeConnectionRequired/);
  assert.match(source, /office_connection_required/);
  assert.match(source, /Retry Office Engine/);
});

test("AI Lab offers explicit setup and local fallback actions", () => {
  assert.match(source, /Open Office Engine setup/);
  assert.match(source, /Process locally instead/);
  assert.match(source, /startLocalFallback/);
  assert.match(source, /reason: "office_not_connected"/);
});

test("AI Lab local fallback uses the existing compression entry point", () => {
  assert.match(source, /runtimeSendMessage\(requestFor\("local", preset\)\)/);
  assert.match(source, /renderComplete\(response\.result\)/);
  assert.match(source, /renderLifecycleError\(message, "LOCAL_FALLBACK_FAILED"\)/);
  assert.doesNotMatch(source, /fetch\([^)]*api\/v1\/jobs/);
});

test("AI Lab postbuild applies Office fallback after execution and license recovery", () => {
  const postbuild = packageJson.scripts["postbuild:ai"];
  assert.ok(postbuild.indexOf("apply-ai-lab-execution-router.mjs") < postbuild.indexOf("apply-ai-lab-office-connection-fallback.mjs"));
  assert.ok(postbuild.indexOf("apply-ai-lab-license-recovery.mjs") < postbuild.indexOf("apply-ai-lab-office-connection-fallback.mjs"));
});
