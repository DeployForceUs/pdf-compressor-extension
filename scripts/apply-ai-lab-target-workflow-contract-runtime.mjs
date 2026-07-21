import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  TARGET_WORKFLOW_SCHEMA_VERSION,
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "./ai-lab-target-workflow-contract.mjs";

const routerPath = path.resolve(
  ".output/chrome-mv3-ai-lab/ai-lab-execution-router.js",
);

let router = await readFile(routerPath, "utf8");

const assertSource = assertTargetWorkflowPlan.toString();
const decideSource = decideTargetWorkflowCompletion.toString();
const schemaBinding = `  const TARGET_WORKFLOW_SCHEMA_VERSION = ${JSON.stringify(TARGET_WORKFLOW_SCHEMA_VERSION)};`;

const stateAnchor = "  let activeTargetPartSizeMb = null;";
const stateReplacement = `${stateAnchor}\n  let activeTargetContract = null;`;
if (!router.includes("let activeTargetContract = null;")) {
  if (!router.includes(stateAnchor)) {
    throw new Error("Structured target workflow state anchor not found");
  }
  router = router.replace(stateAnchor, stateReplacement);
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

const handoffStartMarker = "  async function storeCompressedAsSelectedPdf";
const handoffEndMarker = "  function renderSplitComplete";
const handoffStart = router.indexOf(handoffStartMarker);
const handoffEnd = router.indexOf(handoffEndMarker, handoffStart);
if (handoffStart < 0 || handoffEnd < 0) {
  throw new Error("Compressed PDF handoff function boundary not found");
}

const handoffSource = `  async function storeCompressedAsSelectedPdf(record) {
    const bytes = record.data instanceof Uint8Array ? record.data : new Uint8Array(record.data);
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("pdf-compressor-phase1", 2);
      request.onerror = () => reject(request.error || new Error("selected_pdf_database_open_failed"));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("binary-records")) {
          database.createObjectStore("binary-records", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });

    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("binary-records", "readwrite");
        transaction.onerror = () => reject(transaction.error || new Error("selected_pdf_write_failed"));
        transaction.onabort = () => reject(transaction.error || new Error("selected_pdf_write_aborted"));
        transaction.oncomplete = () => resolve();
        transaction.objectStore("binary-records").put({
          id: "selected-pdf",
          name: record.fileName || completedResult?.fileName || "processed.pdf",
          size: bytes.byteLength,
          type: record.mimeType || "application/pdf",
          lastModified: Date.now(),
          pageCount: record.pageCount ?? completedResult?.pageCount ?? null,
          data: bytes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
    } finally {
      db.close();
    }
  }

`;

router =
  router.slice(0, handoffStart) +
  handoffSource +
  router.slice(handoffEnd);

const workflowStartMarker = "  async function continueTargetSizeWorkflow";
const workflowEndMarker = "  async function findArtifactRecord";
const workflowStart = router.indexOf(workflowStartMarker);
const workflowEnd = router.indexOf(workflowEndMarker, workflowStart);
if (workflowStart < 0 || workflowEnd < 0) {
  throw new Error("Structured target workflow function boundary not found");
}

const workflowSource = `  ${schemaBinding.trimStart()}\n\n  ${assertSource}\n\n  ${decideSource}\n\n  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {\n    completedResult = result ?? null;\n    const contract = activeTargetContract;\n    if (!contract) throw new Error("target_workflow_contract_missing_at_completion");\n    const record = await readCompletedResult();\n    if (!record?.data) throw new Error("processed_pdf_not_available_for_size_validation");\n\n    const actualBytes = resultByteLength(record, result);\n    const decision = decideTargetWorkflowCompletion({\n      contract,\n      actualBytes,\n      resultKind,\n    });\n\n    emit({\n      status: "validating_target_size",\n      targetPartSizeMb: contract.targetPartSizeMb,\n      actualBytes,\n      decision: decision.action,\n    });\n\n    if (decision.action === "complete_pdf") {\n      renderComplete(result);\n      return;\n    }\n\n    workflowStage = "splitting";\n    if (activeButton) {\n      activeButton.disabled = true;\n      activeButton.textContent = "Splitting to the delivery limit…";\n      setStatus(activeButton, "Compression complete. Creating parts under " + contract.targetPartSizeMb + " MB…");\n    }\n\n    await storeCompressedAsSelectedPdf(record);\n    const response = await runtimeSendMessage(decision.request);\n    if (response?.ok === false) {\n      throw new Error(response.error || response.code || "split_start_rejected");\n    }\n\n    emit({\n      status: "split_started",\n      route: activeRoute,\n      preset: activePreset,\n      targetPartSizeMb: contract.targetPartSizeMb,\n      response: response ?? null,\n    });\n    if (response?.result) renderSplitComplete(response.result);\n  }\n\n`;

router =
  router.slice(0, workflowStart) +
  workflowSource +
  router.slice(workflowEnd);

const forbiddenReset = "activeTargetContract = null;\n    workflowStage";
if (router.includes(forbiddenReset)) {
  throw new Error("Validated target contract must survive resetActive");
}
if (!router.includes('decision.action === "complete_pdf"')) {
  throw new Error("Structured target workflow decision is not bound at completion");
}

const installedHandoffStart = router.indexOf(handoffStartMarker);
const installedHandoffEnd = router.indexOf(handoffEndMarker, installedHandoffStart);
const installedHandoff = router.slice(installedHandoffStart, installedHandoffEnd);
if (installedHandoff.includes('type: "pdf:store"') || installedHandoff.includes("runtimeSendMessage")) {
  throw new Error("Binary PDF handoff must not use extension messaging");
}
if (!installedHandoff.includes('indexedDB.open("pdf-compressor-phase1", 2)')) {
  throw new Error("Direct selected-PDF IndexedDB handoff is missing");
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
