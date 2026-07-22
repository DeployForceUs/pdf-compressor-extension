import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { AI_RUNTIME_BUILD } from "../src/lib/ai-runtime/build-metadata.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const staticScripts = [
  "scripts/mark-ai-lab-build.mjs",
  "scripts/apply-ai-lab-palette.mjs",
  "scripts/force-ai-lab-english.mjs",
  "scripts/reset-ai-lab-selected-pdf.mjs",
  "scripts/add-ai-lab-pdf-link.mjs",
  "scripts/fix-ai-lab-pdf-link-input.mjs",
  "scripts/fix-ai-lab-pdf-link-reinstall.mjs",
  "scripts/fix-ai-lab-google-drive-permissions.mjs",
];

const legacyExecutionScripts = [
  "scripts/apply-ai-lab-workflow-navigation.mjs",
  "scripts/apply-ai-lab-link-immediate-analysis.mjs",
  "scripts/add-ai-lab-email-goal-flow.mjs",
  "scripts/extend-ai-lab-goal-flows.mjs",
  "scripts/fix-ai-lab-upload-stage-reset.mjs",
  "scripts/add-ai-lab-orchestrator-debug.mjs",
  "scripts/add-ai-lab-planner-runtime.mjs",
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
];

const implementation = AI_RUNTIME_BUILD.implementation;
if (implementation !== "legacy-patched" && implementation !== "source-runtime") {
  throw new Error(`Unknown AI runtime implementation: ${String(implementation)}`);
}

const scripts = implementation === "legacy-patched"
  ? [...staticScripts, ...legacyExecutionScripts]
  : staticScripts;

console.log(`[AI Lab] postbuild implementation: ${implementation}`);

for (const script of scripts) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (implementation === "source-runtime") {
  console.log("[AI Lab] legacy execution postbuild scripts skipped");
}
