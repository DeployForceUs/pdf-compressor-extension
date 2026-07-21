import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/apply-ai-lab-execution-router.mjs", import.meta.url), "utf8");

test("ExecutionRouter starts only after explicit recommendation confirmation", () => {
  assert.match(source, /document\.addEventListener\("click"/);
  assert.match(source, /\.ai-lab-process-button/);
  assert.match(source, /confirmExecution\(button\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /DOMContentLoaded[^]*compression-start/);
});

test("ExecutionRouter routes local to the existing local engine entry point", () => {
  assert.match(source, /background:compression-start/);
  assert.match(source, /mode: "Balanced"/);
  assert.match(source, /PRESET_QUALITY/);
});

test("ExecutionRouter routes Office recommendations to the existing Office Engine entry point", () => {
  assert.match(source, /background:office-processing-start/);
  assert.doesNotMatch(source, /fetch\([^)]*api\/v1\/jobs/);
  assert.doesNotMatch(source, /fetch\([^)]*api\/v1\/compress/);
});

test("ExecutionRouter accepts only a current validated Planner recommendation", () => {
  assert.match(source, /plannerResult\?\.status !== "ready"/);
  assert.match(source, /recommendedRoute !== route/);
  assert.match(source, /ALLOWED_ROUTES/);
  assert.match(source, /planner_result_mismatch/);
});

test("ExecutionRouter prevents duplicate starts and exposes debug state", () => {
  assert.match(source, /if \(active\) return/);
  assert.match(source, /button\.disabled = true/);
  assert.match(source, /__AI_LAB_LAST_EXECUTION_ROUTER_RESULT__/);
  assert.match(source, /ai-lab:execution-router-result/);
});

test("ExecutionRouter tracks existing local and Office lifecycle events", () => {
  assert.match(source, /runtime\?\.onMessage\?\.addListener/);
  assert.match(source, /compression:progress/);
  assert.match(source, /compression:result/);
  assert.match(source, /compression:error/);
  assert.match(source, /office:progress/);
  assert.match(source, /office:result/);
  assert.match(source, /office:error/);
});

test("ExecutionRouter closes the local lifecycle when the start response already contains a result", () => {
  assert.match(source, /route === "local" && response\?\.result/);
  assert.match(source, /renderComplete\(response\.result\)/);
  assert.match(source, /status: "complete"/);
  assert.match(source, /resetActive\(\)/);
});

test("ExecutionRouter turns the completed action into an explicit download", () => {
  assert.match(source, /button\.dataset\.aiAction = "download"/);
  assert.match(source, /Download processed PDF/);
  assert.match(source, /downloadProcessedPdf\(button\)/);
  assert.match(source, /indexedDB\.open\(RESULT_DB_NAME, RESULT_DB_VERSION\)/);
  assert.match(source, /compression-results/);
  assert.match(source, /compressed-pdf/);
  assert.match(source, /URL\.createObjectURL\(blob\)/);
  assert.match(source, /anchor\.download = downloadName\(record\)/);
  assert.match(source, /status: "downloaded"/);

  const renderCompleteStart = source.indexOf("  function renderComplete(result) {");
  const lifecycleErrorStart = source.indexOf("  function renderLifecycleError", renderCompleteStart);
  assert.ok(renderCompleteStart >= 0 && lifecycleErrorStart > renderCompleteStart);
  const renderCompleteBody = source.slice(renderCompleteStart, lifecycleErrorStart);
  assert.doesNotMatch(renderCompleteBody, /anchor\.click\(\)/);
});
