import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const PLANNER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-planner-runtime.js");
const PRESENTER_PATH = path.join(OUTPUT_DIR, "ai-lab-recommendation-presenter.js");
const ROUTER_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const CONTEST_ACCESS_PATH = path.join(OUTPUT_DIR, "ai-lab-contest-access.js");
const CONTRACT_PATH = path.resolve("scripts/ai-lab-target-workflow-contract.mjs");

const REVISION = "H16-CONTRACT-C9";

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function pass(label) { process.stdout.write(`PASS ${label}\n`); }
function fail(label, detail) {
  process.stderr.write(`FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
  process.exitCode = 1;
}
function requireMarker(source, marker, label) {
  if (source.includes(marker)) pass(label);
  else fail(label, `missing marker: ${marker}`);
}
function requirePattern(source, pattern, label) {
  if (pattern.test(source)) pass(label);
  else fail(label, `missing semantic pattern: ${pattern}`);
}
function forbidMarker(source, marker, label) {
  if (!source.includes(marker)) pass(label);
  else fail(label, `forbidden marker remains active: ${marker}`);
}

const [plannerRuntime, presenter, router, manifestText, contestAccess, contractSource] = await Promise.all([
  readFile(PLANNER_RUNTIME_PATH, "utf8"),
  readFile(PRESENTER_PATH, "utf8"),
  readFile(ROUTER_PATH, "utf8"),
  readFile(MANIFEST_PATH, "utf8"),
  readFile(CONTEST_ACCESS_PATH, "utf8"),
  readFile(CONTRACT_PATH, "utf8"),
]);

const manifest = JSON.parse(manifestText);
const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
const confirmationStart = router.indexOf("async function confirmExecution(button)");
const confirmationEnd = router.indexOf("const runtime =", confirmationStart);
const confirmationSource = confirmationStart >= 0 && confirmationEnd > confirmationStart
  ? router.slice(confirmationStart, confirmationEnd)
  : "";
const handoffStart = router.indexOf("async function storeCompressedAsSelectedPdf");
const handoffEnd = router.indexOf("function renderSplitComplete", handoffStart);
const handoffSource = handoffStart >= 0 && handoffEnd > handoffStart
  ? router.slice(handoffStart, handoffEnd)
  : "";

process.stdout.write(`AI Lab build commit: ${gitCommit()}\n`);
process.stdout.write(`AI Lab target-size workflow revision: ${REVISION}\n`);

requireMarker(plannerRuntime, "normalizePlannerSplitPlan", "Planner split normalization");
requireMarker(plannerRuntime, 'strategy: "by-max-size"', "Planner normalized split strategy");
requireMarker(plannerRuntime, 'outputMode: "single-zip"', "Planner normalized ZIP output");
requireMarker(plannerRuntime, "targetPartSizeMb", "Planner normalized target size");
requireMarker(presenter, "aiTargetPartSizeMb", "Presenter target-size binding");
requireMarker(presenter, "Compress, validate, then split into parts under", "Presenter delivery workflow");
requireMarker(router, '__AI_LAB_TARGET_WORKFLOW_CONTRACT_REVISION__ = "C9"', "Router canonical lifecycle integration");
requireMarker(router, 'const TARGET_WORKFLOW_SCHEMA_VERSION = "1"', "Router schema dependency binding");
requireMarker(router, "let activeTargetContract = null", "Router validated contract state");
requirePattern(confirmationSource, /activeTargetContract\s*=\s*structuredSplit\?\.enabled\s*===\s*true/, "Canonical contract activation");
requirePattern(confirmationSource, /activeTargetPartSizeMb\s*=\s*activeTargetContract\?\.targetPartSizeMb\s*\?\?\s*null/, "Target size derived from contract");
forbidMarker(confirmationSource, "button.dataset.aiTargetPartSizeMb", "Button dataset removed from active execution path");
forbidMarker(confirmationSource, "targetSizeFromPlannerResult(plannerResult)", "Planner text inference removed from active execution path");
forbidMarker(confirmationSource, "targetSizeFromRenderedPlan(button)", "Rendered-plan inference removed from active execution path");
requireMarker(router, "const contract = activeTargetContract", "Completion uses retained contract");
requireMarker(router, 'status: "target_workflow_not_required"', "Non-split completion fallback");
forbidMarker(router, "target_workflow_contract_missing_at_completion", "Missing-contract crash removed");
forbidMarker(router, "activeTargetContract = null;\n    workflowStage", "Reset does not clear retained contract");
requireMarker(router, "decideTargetWorkflowCompletion", "Router deterministic completion decision");
requirePattern(router, /decision\.action\s*===\s*["']complete_pdf["']/, "Router complete-or-split boundary");
requireMarker(router, "validating_target_size", "Router target-size validation event");
requireMarker(router, "split_started", "Split workflow start");
requireMarker(router, 'dataset.aiAction = "download-split"', "ZIP download route");
requireMarker(handoffSource, 'indexedDB.open("pdf-compressor-phase1", 2)', "Direct IndexedDB PDF handoff");
requireMarker(handoffSource, 'transaction.objectStore("binary-records").put', "Selected PDF record write");
requireMarker(handoffSource, 'id: "selected-pdf"', "Selected PDF handoff record");
forbidMarker(handoffSource, 'type: "pdf:store"', "Binary PDF excluded from runtime messaging");
forbidMarker(handoffSource, "runtimeSendMessage", "Handoff avoids runtime messaging");
requireMarker(contractSource, 'split.strategy !== "by-max-size"', "Deterministic by-max-size contract");
requireMarker(contractSource, 'split.outputMode !== "single-zip"', "Single ZIP output contract");
requireMarker(contractSource, 'type: "split:local"', "Local split dispatch contract");

if (hostPermissions.includes("https://pdf-66-55-75-239.sslip.io/*")) pass("Office host permission");
else fail("Office host permission", "required host is absent from manifest");

if (contestAccess.trim().length > 0) pass("Contest access artifact");
else fail("Contest access artifact", "generated file is empty");

if (process.exitCode) throw new Error("AI Lab build verification failed");
process.stdout.write("AI Lab build verification complete\n");
