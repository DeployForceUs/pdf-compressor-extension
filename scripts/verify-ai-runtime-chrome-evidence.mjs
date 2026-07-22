import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const evidencePath = resolve(root, "reports/ai-lab-phase8/evidence.json");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));

function fail(message) {
  throw new Error(`phase8_evidence_invalid:${message}`);
}

if (evidence.schemaVersion !== "1") fail("schemaVersion");
if (evidence.phase !== 8) fail("phase");
if (!evidence.build || evidence.build.implementation !== "source-runtime") fail("implementation");
if (!Array.isArray(evidence.cases) || evidence.cases.length !== 9) fail("case_count");

const ids = evidence.cases.map((item) => item.id);
if (new Set(ids).size !== 9 || ids.some((id, index) => id !== index + 1)) fail("case_ids");

for (const item of evidence.cases) {
  if (!['pending', 'passed', 'failed', 'blocked'].includes(item.status)) fail(`case_${item.id}_status`);
  if (!Array.isArray(item.stateTrace)) fail(`case_${item.id}_stateTrace`);
  if (!Array.isArray(item.artifactRecordIds)) fail(`case_${item.id}_artifactRecordIds`);

  if (item.status === "passed") {
    if (item.stateTrace.length === 0) fail(`case_${item.id}_stateTrace_required`);
    if (typeof item.screenshot !== "string" || !item.screenshot.trim()) fail(`case_${item.id}_screenshot_required`);
    if (typeof item.artifactValidation !== "string" || !item.artifactValidation.trim()) fail(`case_${item.id}_artifactValidation_required`);
    if (item.targetBytes !== null && (!Number.isSafeInteger(item.targetBytes) || item.targetBytes <= 0)) {
      fail(`case_${item.id}_targetBytes`);
    }
    if (item.actualBytes !== null && (!Number.isSafeInteger(item.actualBytes) || item.actualBytes <= 0)) {
      fail(`case_${item.id}_actualBytes`);
    }
  }
}

const passed = evidence.cases.filter((item) => item.status === "passed").length;
const pending = evidence.cases.filter((item) => item.status === "pending").length;
const failed = evidence.cases.filter((item) => item.status === "failed").length;
const blocked = evidence.cases.filter((item) => item.status === "blocked").length;

if (evidence.status === "accepted") {
  if (!evidence.build.commitSha?.trim()) fail("accepted_commitSha_required");
  if (passed !== 9) fail("accepted_requires_all_cases_passed");
}

console.log(`Phase 8 Chrome evidence: ${passed} passed, ${pending} pending, ${failed} failed, ${blocked} blocked`);
console.log(`Phase 8 status: ${evidence.status}`);
