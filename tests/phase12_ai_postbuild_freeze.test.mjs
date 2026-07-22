import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FROZEN_EXECUTION_SCRIPTS = new Set([
  "scripts/add-ai-lab-orchestrator-debug.mjs",
  "scripts/add-ai-lab-planner-runtime.mjs",
  "scripts/apply-ai-lab-link-immediate-analysis.mjs",
  "scripts/apply-ai-lab-recommendation-presenter.mjs",
  "scripts/apply-ai-lab-execution-router.mjs",
  "scripts/style-ai-lab-download-action.mjs",
  "scripts/apply-ai-lab-license-recovery.mjs",
  "scripts/apply-ai-lab-office-connection-fallback.mjs",
  "scripts/apply-ai-lab-target-size-workflow.mjs",
  "scripts/fix-ai-lab-target-size-detection.mjs",
  "scripts/fix-ai-lab-target-size-router-state.mjs",
  "scripts/finalize-ai-lab-rendered-plan-fallback.mjs",
  "scripts/apply-ai-lab-target-workflow-contract-runtime.mjs",
]);

const EXECUTION_NAME_PATTERN = /(planner|orchestrator|execution|target-size|target-workflow|completion|split|download)/i;

function scriptPath(command) {
  const match = command.trim().match(/^node\s+(scripts\/[^\s]+\.mjs)$/);
  return match?.[1];
}

test("no new execution-related postbuild script is appended during source-runtime migration", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const chain = String(packageJson.scripts?.["postbuild:ai"] ?? "")
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean);

  const scriptPaths = chain.map(scriptPath);
  assert.equal(scriptPaths.includes(undefined), false, "postbuild:ai contains an unsupported command shape");

  const executionScripts = scriptPaths.filter((path) => EXECUTION_NAME_PATTERN.test(path));
  const unexpected = executionScripts.filter((path) => !FROZEN_EXECUTION_SCRIPTS.has(path));

  assert.deepEqual(
    unexpected,
    [],
    `New execution-related postbuild scripts are forbidden. Implement workflow behavior under src/lib/ai-runtime instead: ${unexpected.join(", ")}`,
  );

  for (const frozenPath of FROZEN_EXECUTION_SCRIPTS) {
    assert.equal(
      scriptPaths.includes(frozenPath),
      true,
      `Frozen legacy script disappeared before an accepted source-runtime replacement: ${frozenPath}`,
    );
  }
});
