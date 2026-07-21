import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const PLANNER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-planner-runtime.js");
const PRESENTER_PATH = path.join(OUTPUT_DIR, "ai-lab-recommendation-presenter.js");
const ROUTER_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const CONTEST_ACCESS_PATH = path.join(OUTPUT_DIR, "ai-lab-contest-access.js");

const REVISION = "H7-N2";

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function pass(label) {
  process.stdout.write(`PASS ${label}\n`);
}

function fail(label, detail) {
  process.stderr.write(`FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
  process.exitCode = 1;
}

function requireMarker(source, marker, label) {
  if (source.includes(marker)) pass(label);
  else fail(label, `missing marker: ${marker}`);
}

const [plannerRuntime, presenter, router, manifestText, contestAccess] = await Promise.all([
  readFile(PLANNER_RUNTIME_PATH, "utf8"),
  readFile(PRESENTER_PATH, "utf8"),
  readFile(ROUTER_PATH, "utf8"),
  readFile(MANIFEST_PATH, "utf8"),
  readFile(CONTEST_ACCESS_PATH, "utf8"),
]);

const manifest = JSON.parse(manifestText);
const hostPermissions = Array.isArray(manifest.host_permissions)
  ? manifest.host_permissions
  : [];

process.stdout.write(`AI Lab build commit: ${gitCommit()}\n`);
process.stdout.write(`AI Lab target-size workflow revision: ${REVISION}\n`);

requireMarker(plannerRuntime, "normalizePlannerSplitPlan", "Planner split normalization");
requireMarker(plannerRuntime, 'strategy: "by-max-size"', "Planner normalized split strategy");
requireMarker(plannerRuntime, 'outputMode: "single-zip"', "Planner normalized ZIP output");
requireMarker(plannerRuntime, "targetPartSizeMb", "Planner normalized target size");
requireMarker(plannerRuntime, "compression|compress|reduce|shrink", "Planner approximate compression target detection");
requireMarker(presenter, "aiTargetPartSizeMb", "Presenter target-size binding");
requireMarker(presenter, "Compress, validate, then split into parts under", "Presenter delivery workflow");
requireMarker(router, "validating_target_size", "Router target-size validation");
requireMarker(router, "split_started", "Split workflow start");
requireMarker(router, 'dataset.aiAction = "download-split"', "ZIP download route");
requireMarker(router, 'type: "by-max-size"', "Deterministic by-max-size strategy");
requireMarker(router, 'outputMode: "single-zip"', "Single ZIP output mode");
requireMarker(router, "targetSizeFromRenderedPlan", "Rendered-plan fallback");

if (hostPermissions.includes("https://pdf-66-55-75-239.sslip.io/*")) {
  pass("Office host permission");
} else {
  fail("Office host permission", "required host is absent from manifest");
}

if (contestAccess.trim().length > 0) pass("Contest access artifact");
else fail("Contest access artifact", "generated file is empty");

if (process.exitCode) {
  throw new Error("AI Lab build verification failed");
}

process.stdout.write("AI Lab build verification complete\n");
