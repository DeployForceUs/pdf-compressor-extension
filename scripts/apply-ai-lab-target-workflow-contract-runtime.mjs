import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "./ai-lab-target-workflow-contract.mjs";

const routerPath = path.resolve(
  ".output/chrome-mv3-ai-lab/ai-lab-execution-router.js",
);

let router = await readFile(routerPath, "utf8");

const assertSource = assertTargetWorkflowPlan.toString();
const decideSource = decideTargetWorkflowCompletion.toString();

const stateAnchor = "  let activeTargetPartSizeMb = null;";
const stateReplacement = `${stateAnchor}\n  let activeTargetWorkflowPlan = null;`;
if (!router.includes("let activeTargetWorkflowPlan = null;")) {
  if (!router.includes(stateAnchor)) {
    throw new Error("Structured target workflow state anchor not found");
  }
  router = router.replace(stateAnchor, stateReplacement);
}

const resetAnchor = `    activeTargetPartSizeMb = null;\n    workflowStage = "compression";`;
const resetReplacement = `    activeTargetPartSizeMb = null;\n    activeTargetWorkflowPlan = null;\n    workflowStage = "compression";`;
if (!router.includes("activeTargetWorkflowPlan = null;\n    workflowStage")) {
  if (!router.includes(resetAnchor)) {
    throw new Error("Structured target workflow reset anchor not found");
  }
  router = router.replace(resetAnchor, resetReplacement);
}

const legacyAssignment = `    activeTargetPartSizeMb =
      targetSizeFromPlannerResult(plannerResult) ??
      targetSizeFromRenderedPlan(button) ??
      null;`;
const structuredAssignment = `    const structuredSplit = plannerResult?.response?.processingPlan?.split;
    activeTargetWorkflowPlan = structuredSplit?.enabled === true
      ? plannerResult.response
      : null;
    if (activeTargetWorkflowPlan) {
      const activeTargetContract = assertTargetWorkflowPlan(activeTargetWorkflowPlan);
      activeTargetPartSizeMb = activeTargetContract.targetPartSizeMb;
    } else {
      activeTargetPartSizeMb = null;
    }`;

if (!router.includes(structuredAssignment)) {
  if (!router.includes(legacyAssignment)) {
    throw new Error("Exact target workflow confirmation anchor not found");
  }
  router = router.replace(legacyAssignment, structuredAssignment);
}

const workflowStartMarker = "  async function continueTargetSizeWorkflow";
const workflowEndMarker = "  async function findArtifactRecord";
const workflowStart = router.indexOf(workflowStartMarker);
const workflowEnd = router.indexOf(workflowEndMarker, workflowStart);
if (workflowStart < 0 || workflowEnd < 0) {
  throw new Error("Structured target workflow function boundary not found");
}

const workflowSource = `  ${assertSource}\n\n  ${decideSource}\n\n  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {\n    completedResult = result ?? null;\n    const contract = assertTargetWorkflowPlan(activeTargetWorkflowPlan);\n    const record = await readCompletedResult();\n    if (!record?.data) throw new Error("processed_pdf_not_available_for_size_validation");\n\n    const actualBytes = resultByteLength(record, result);\n    const decision = decideTargetWorkflowCompletion({\n      contract,\n      actualBytes,\n      resultKind,\n    });\n\n    emit({\n      status: "validating_target_size",\n      targetPartSizeMb: contract.targetPartSizeMb,\n      actualBytes,\n      decision: decision.action,\n    });\n\n    if (decision.action === "complete_pdf") {\n      renderComplete(result);\n      return;\n    }\n\n    workflowStage = "splitting";\n    if (activeButton) {\n      activeButton.disabled = true;\n      activeButton.textContent = "Splitting to the delivery limit…";\n      setStatus(activeButton, "Compression complete. Creating parts under " + contract.targetPartSizeMb + " MB…");\n    }\n\n    await storeCompressedAsSelectedPdf(record);\n    const response = await runtimeSendMessage(decision.request);\n    if (response?.ok === false) {\n      throw new Error(response.error || response.code || "split_start_rejected");\n    }\n\n    emit({\n      status: "split_started",\n      route: activeRoute,\n      preset: activePreset,\n      targetPartSizeMb: contract.targetPartSizeMb,\n      response: response ?? null,\n    });\n    if (response?.result) renderSplitComplete(response.result);\n  }\n\n`;

router =
  router.slice(0, workflowStart) +
  workflowSource +
  router.slice(workflowEnd);

if (!router.includes("activeTargetWorkflowPlan = structuredSplit?.enabled === true")) {
  throw new Error("Structured target workflow plan is not bound at confirmation");
}
if (!router.includes('decision.action === "complete_pdf"')) {
  throw new Error("Structured target workflow decision is not bound at completion");
}

const confirmationStart = router.indexOf("  async function confirmExecution(button)");
const confirmationEnd = router.indexOf("  const runtime =", confirmationStart);
const confirmationSource = router.slice(confirmationStart, confirmationEnd);
if (confirmationSource.includes("targetSizeFromPlannerResult(plannerResult)")) {
  throw new Error("Legacy target inference remains in active confirmation path");
}
if (confirmationSource.includes("targetSizeFromRenderedPlan(button)")) {
  throw new Error("Rendered-plan inference remains in active confirmation path");
}

await writeFile(routerPath, router, "utf8");
process.stdout.write("AI Lab structured target workflow contract runtime C2 applied\n");
