import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  TARGET_WORKFLOW_SCHEMA_VERSION,
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "./ai-lab-target-workflow-contract.mjs";
import { claimCompressedResultHandoff } from "./ai-lab-target-workflow-runtime-core.mjs";

const routerPath = path.resolve(
  ".output/chrome-mv3-ai-lab/ai-lab-execution-router.js",
);

let router = await readFile(routerPath, "utf8");

const schemaSource = `const TARGET_WORKFLOW_SCHEMA_VERSION = ${JSON.stringify(TARGET_WORKFLOW_SCHEMA_VERSION)};`;
const assertSource = assertTargetWorkflowPlan.toString();
const decideSource = decideTargetWorkflowCompletion.toString();
const claimSource = claimCompressedResultHandoff.toString();

const stateAnchor = "  let activeTargetPartSizeMb = null;";
const stateReplacement = `${stateAnchor}\n  let activeTargetContract = null;\n  let activeCompressionOwnership = null;`;
if (!router.includes("let activeTargetContract = null;")) {
  if (!router.includes(stateAnchor)) {
    throw new Error("Structured target workflow state anchor not found");
  }
  router = router.replace(stateAnchor, stateReplacement);
} else if (!router.includes("let activeCompressionOwnership = null;")) {
  router = router.replace(
    "  let activeTargetContract = null;",
    "  let activeTargetContract = null;\n  let activeCompressionOwnership = null;",
  );
}

const confirmationStart = router.indexOf("async function confirmExecution(button)");
const confirmationEnd = router.indexOf("const runtime =", confirmationStart);
if (confirmationStart < 0 || confirmationEnd <= confirmationStart) {
  throw new Error("Execution confirmation boundary not found");
}

let confirmationSource = router.slice(confirmationStart, confirmationEnd);
const lifecycleBoundary = /(\n\s*completedResult\s*=\s*null;)([\s\S]*?)(\n\s*active\s*=\s*true;)/;
const lifecycleMatch = confirmationSource.match(lifecycleBoundary);
if (!lifecycleMatch) {
  throw new Error("Canonical target workflow lifecycle boundary not found");
}

const canonicalLifecycle = `${lifecycleMatch[1]}
    completedSplitResult = null;
    activeCompressionOwnership = null;
    const structuredSplit = plannerResult?.response?.processingPlan?.split;
    activeTargetContract = structuredSplit?.enabled === true
      ? assertTargetWorkflowPlan(plannerResult.response)
      : null;
    activeTargetPartSizeMb = activeTargetContract?.targetPartSizeMb ?? null;
    workflowStage = "compression";${lifecycleMatch[3]}`;
confirmationSource = confirmationSource.replace(lifecycleBoundary, canonicalLifecycle);

if ((confirmationSource.match(/activeTargetContract\s*=/g) || []).length !== 1) {
  throw new Error("Target contract must have exactly one assignment in confirmation");
}
if ((confirmationSource.match(/activeTargetPartSizeMb\s*=/g) || []).length !== 1) {
  throw new Error("Target size must have exactly one derived assignment in confirmation");
}
if ((confirmationSource.match(/activeCompressionOwnership\s*=\s*null/g) || []).length !== 1) {
  throw new Error("Compression ownership must reset exactly once at confirmation");
}
if (confirmationSource.includes("targetSizeFromPlannerResult(plannerResult)")) {
  throw new Error("Legacy target inference remains in active confirmation path");
}
if (confirmationSource.includes("targetSizeFromRenderedPlan(button)")) {
  throw new Error("Rendered-plan inference remains in active confirmation path");
}
if (confirmationSource.includes("button.dataset.aiTargetPartSizeMb")) {
  throw new Error("Button dataset remains an execution source in confirmation");
}

router =
  router.slice(0, confirmationStart) +
  confirmationSource +
  router.slice(confirmationEnd);

const workflowStartMarker = "  async function continueTargetSizeWorkflow";
const workflowEndMarker = "  async function findArtifactRecord";
const workflowStart = router.indexOf(workflowStartMarker);
const workflowEnd = router.indexOf(workflowEndMarker, workflowStart);
if (workflowStart < 0 || workflowEnd < 0) {
  throw new Error("Structured target workflow function boundary not found");
}

const workflowSource = `  ${schemaSource}\n\n  ${assertSource}\n\n  ${decideSource}\n\n  ${claimSource}\n\n  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {\n    const contract = activeTargetContract;\n    if (!contract) throw new Error("target_workflow_contract_missing_at_completion");\n    const record = await readCompletedResult();\n    activeCompressionOwnership = claimCompressedResultHandoff({\n      resultMetadata: result,\n      persistedRecord: record,\n    });\n    completedResult = activeCompressionOwnership.metadata;\n\n    emit({\n      status: "compression_handoff_owned",\n      owner: activeCompressionOwnership.owner,\n      recordId: activeCompressionOwnership.recordId,\n      sourceRecordId: activeCompressionOwnership.sourceRecordId,\n      byteLength: activeCompressionOwnership.byteLength,\n    });\n\n    const actualBytes = activeCompressionOwnership.byteLength;\n    const decision = decideTargetWorkflowCompletion({\n      contract,\n      actualBytes,\n      resultKind,\n    });\n\n    emit({\n      status: "validating_target_size",\n      targetPartSizeMb: contract.targetPartSizeMb,\n      actualBytes,\n      decision: decision.action,\n    });\n\n    if (decision.action === "complete_pdf") {\n      renderComplete(activeCompressionOwnership.metadata);\n      return;\n    }\n\n    workflowStage = "splitting";\n    if (activeButton) {\n      activeButton.disabled = true;\n      activeButton.textContent = "Splitting to the delivery limit…";\n      setStatus(activeButton, "Compression complete. Creating parts under " + contract.targetPartSizeMb + " MB…");\n    }\n\n    await storeCompressedAsSelectedPdf(record);\n    const response = await runtimeSendMessage(decision.request);\n    if (response?.ok === false) {\n      throw new Error(response.error || response.code || "split_start_rejected");\n    }\n\n    emit({\n      status: "split_started",\n      route: activeRoute,\n      preset: activePreset,\n      compressedRecordId: activeCompressionOwnership.recordId,\n      targetPartSizeMb: contract.targetPartSizeMb,\n      response: response ?? null,\n    });\n    if (response?.result) renderSplitComplete(response.result);\n  }\n\n`;

router =
  router.slice(0, workflowStart) +
  workflowSource +
  router.slice(workflowEnd);

const forbiddenReset = "activeTargetContract = null;\n    workflowStage";
if (router.includes(forbiddenReset)) {
  throw new Error("Validated target contract must survive resetActive");
}
if (!router.includes('const TARGET_WORKFLOW_SCHEMA_VERSION = "1";')) {
  throw new Error("Target workflow schema dependency is not inlined");
}
if (!router.includes('decision.action === "complete_pdf"')) {
  throw new Error("Structured target workflow decision is not bound at completion");
}
if (!router.includes('owner: "target-workflow-coordinator"')) {
  throw new Error("Compressed result handoff ownership is not inlined");
}
if (router.indexOf("claimCompressedResultHandoff({") > router.indexOf("renderComplete(activeCompressionOwnership.metadata)")) {
  throw new Error("Completion appears before coordinator ownership");
}

const revisionMarker =
  '  globalThis.__AI_LAB_TARGET_WORKFLOW_CONTRACT_REVISION__ = "C8";\n';
const existingRevision = /  globalThis\.__AI_LAB_TARGET_WORKFLOW_CONTRACT_REVISION__ = "C\d+";\n/;
if (existingRevision.test(router)) {
  router = router.replace(existingRevision, revisionMarker);
} else {
  const readyMarker = '  console.info("[AI Lab] ExecutionRouter ready");';
  if (!router.includes(readyMarker)) {
    throw new Error("ExecutionRouter ready marker not found");
  }
  router = router.replace(readyMarker, revisionMarker + readyMarker);
}

await writeFile(routerPath, router, "utf8");
process.stdout.write("AI Lab structured target workflow contract runtime C8 applied\n");
