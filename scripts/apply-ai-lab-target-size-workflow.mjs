import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const PRESENTER_PATH = path.join(OUTPUT_DIR, "ai-lab-recommendation-presenter.js");
const ROUTER_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");

let presenter = await readFile(PRESENTER_PATH, "utf8");

const presenterAnchor = `  function runtimeFor(response) {`;
const presenterHelpers = `  function targetSizeMb(orchestration, response) {
    const explicit = response?.processingPlan?.split?.targetPartSizeMb ?? response?.split?.targetPartSizeMb;
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const values = [];
    const visit = (value) => {
      if (typeof value === "string") values.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(orchestration?.userGoal);
    visit(orchestration?.plannerRequest?.userGoal);
    for (const value of values) {
      const match = value.match(/(?:under|below|to|target(?:ing)?|maximum|max)?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

`;

if (!presenter.includes("function targetSizeMb(")) {
  if (!presenter.includes(presenterAnchor)) throw new Error("Target-size presenter anchor not found");
  presenter = presenter.replace(presenterAnchor, presenterHelpers + presenterAnchor);
}

const presenterRouteBoundary = `    const routeLabel = response.recommendedRoute === "office_current" ? "Current Office Engine" : "This device";
    resetPanel(target, response.recommendedRoute === "office_current" ? "Use the Office Engine" : "Process on this device");`;
const presenterRouteReplacement = `    const routeLabel = response.recommendedRoute === "office_current" ? "Current Office Engine" : "This device";
    const targetMb = targetSizeMb(orchestration, response);
    const workflowTitle = targetMb
      ? "Compress, then split to the delivery limit"
      : response.recommendedRoute === "office_current" ? "Use the Office Engine" : "Process on this device";
    resetPanel(target, workflowTitle);`;
if (!presenter.includes(presenterRouteReplacement)) {
  if (!presenter.includes(presenterRouteBoundary)) throw new Error("Target-size presenter route boundary not found");
  presenter = presenter.replace(presenterRouteBoundary, presenterRouteReplacement);
}

const presenterRowsBoundary = `    addRow(rows, "Recommended preset", titleCase(response.recommendedPreset));`;
const presenterRowsReplacement = `    addRow(rows, "Recommended preset", titleCase(response.recommendedPreset));
    if (targetMb) addRow(rows, "Delivery workflow", "Compress, validate, then split into parts under " + targetMb + " MB");`;
if (!presenter.includes(presenterRowsReplacement)) {
  if (!presenter.includes(presenterRowsBoundary)) throw new Error("Target-size presenter rows boundary not found");
  presenter = presenter.replace(presenterRowsBoundary, presenterRowsReplacement);
}

const presenterButtonBoundary = `      response.recommendedRoute === "office_current" ? "Process with Office Engine" : "Process locally",
    );`;
const presenterButtonReplacement = `      targetMb
        ? "Compress and split into parts"
        : response.recommendedRoute === "office_current" ? "Process with Office Engine" : "Process locally",
    );`;
if (!presenter.includes(presenterButtonReplacement)) {
  if (!presenter.includes(presenterButtonBoundary)) throw new Error("Target-size presenter button boundary not found");
  presenter = presenter.replace(presenterButtonBoundary, presenterButtonReplacement);
}

const presenterDatasetBoundary = `    confirm.dataset.aiRecommendedPreset = response.recommendedPreset;`;
const presenterDatasetReplacement = `    confirm.dataset.aiRecommendedPreset = response.recommendedPreset;
    if (targetMb) confirm.dataset.aiTargetPartSizeMb = String(targetMb);`;
if (!presenter.includes(presenterDatasetReplacement)) {
  if (!presenter.includes(presenterDatasetBoundary)) throw new Error("Target-size presenter dataset boundary not found");
  presenter = presenter.replace(presenterDatasetBoundary, presenterDatasetReplacement);
}

await writeFile(PRESENTER_PATH, presenter, "utf8");

let router = await readFile(ROUTER_PATH, "utf8");

const stateBoundary = `  let completedResult = null;`;
const stateReplacement = `  let completedResult = null;
  let completedSplitResult = null;
  let activeTargetPartSizeMb = null;
  let workflowStage = "compression";`;
if (!router.includes(stateReplacement)) {
  if (!router.includes(stateBoundary)) throw new Error("Target-size router state boundary not found");
  router = router.replace(stateBoundary, stateReplacement);
}

const resetBoundary = `    activePreset = null;
  }`;
const resetReplacement = `    activePreset = null;
    activeTargetPartSizeMb = null;
    workflowStage = "compression";
  }`;
if (!router.includes(resetReplacement)) {
  if (!router.includes(resetBoundary)) throw new Error("Target-size router reset boundary not found");
  router = router.replace(resetBoundary, resetReplacement);
}

const lifecycleAnchor = `  function renderLifecycleError(message, code) {`;
const targetWorkflowHelpers = `  function resultByteLength(record, metadata) {
    return record?.data?.byteLength ?? record?.data?.length ?? metadata?.compressedSize ?? metadata?.size ?? 0;
  }

  async function storeCompressedAsSelectedPdf(record) {
    const bytes = record.data instanceof Uint8Array ? record.data : new Uint8Array(record.data);
    const response = await runtimeSendMessage({
      type: "pdf:store",
      record: {
        id: "selected-pdf",
        name: record.fileName || completedResult?.fileName || "processed.pdf",
        size: bytes.byteLength,
        type: record.mimeType || "application/pdf",
        lastModified: Date.now(),
        pageCount: record.pageCount ?? completedResult?.pageCount ?? null,
        data: bytes,
      },
    });
    if (!response?.ok) throw new Error(response?.error || "compressed_pdf_handoff_failed");
  }

  function renderSplitComplete(result) {
    if (!activeButton) return;
    const button = activeButton;
    const route = activeRoute;
    const preset = activePreset;
    completedSplitResult = result ?? null;
    button.disabled = false;
    button.dataset.aiAction = "download-split";
    button.textContent = "Download split ZIP";
    setStatus(button, "Compression and size-based splitting are complete. Your ZIP is ready.");
    emit({ status: "split_complete", route, preset, result: completedSplitResult });
    resetActive();
  }

  async function continueTargetSizeWorkflow(result) {
    completedResult = result ?? null;
    if (!activeTargetPartSizeMb) {
      renderComplete(result);
      return;
    }

    const record = await readCompletedResult();
    if (!record?.data) throw new Error("processed_pdf_not_available_for_size_validation");
    const targetBytes = Math.floor(activeTargetPartSizeMb * 1024 * 1024);
    const actualBytes = resultByteLength(record, result);
    emit({ status: "validating_target_size", targetPartSizeMb: activeTargetPartSizeMb, actualBytes });

    if (actualBytes <= targetBytes) {
      renderComplete(result);
      return;
    }

    workflowStage = "splitting";
    if (activeButton) {
      activeButton.disabled = true;
      activeButton.textContent = "Splitting to the delivery limit…";
      setStatus(activeButton, "Compression complete. Creating parts under " + activeTargetPartSizeMb + " MB…");
    }
    await storeCompressedAsSelectedPdf(record);
    const response = await runtimeSendMessage({
      type: "split:local",
      strategy: {
        type: "by-max-size",
        maxPartSizeBytes: Math.max(1, Math.floor(targetBytes * 0.95)),
      },
      outputMode: "single-zip",
      compressAfter: false,
    });
    if (response?.ok === false) throw new Error(response.error || response.code || "split_start_rejected");
    emit({ status: "split_started", route: activeRoute, preset: activePreset, targetPartSizeMb: activeTargetPartSizeMb, response: response ?? null });
    if (response?.result) renderSplitComplete(response.result);
  }

  async function findArtifactRecord(artifactId) {
    if (!artifactId || !indexedDB.databases) return null;
    const databases = await indexedDB.databases();
    for (const info of databases) {
      if (!info.name) continue;
      const db = await new Promise((resolve) => {
        const request = indexedDB.open(info.name);
        request.onerror = () => resolve(null);
        request.onsuccess = () => resolve(request.result);
      });
      if (!db) continue;
      try {
        for (const storeName of Array.from(db.objectStoreNames)) {
          const record = await new Promise((resolve) => {
            const transaction = db.transaction(storeName, "readonly");
            const request = transaction.objectStore(storeName).get(artifactId);
            request.onerror = () => resolve(null);
            request.onsuccess = () => resolve(request.result || null);
          });
          if (record?.data) return record;
        }
      } finally {
        db.close();
      }
    }
    return null;
  }

  async function downloadSplitZip(button) {
    button.disabled = true;
    button.textContent = "Preparing ZIP…";
    setStatus(button, "Reading the completed split ZIP from local storage…");
    try {
      const artifactId = completedSplitResult?.zipBlobId || completedSplitResult?.artifactIds?.[0];
      const record = await findArtifactRecord(artifactId);
      if (!record?.data) throw new Error("split_zip_not_available");
      const blob = new Blob([record.data], { type: record.mimeType || "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.filename || completedSplitResult?.fileName || "processed-parts.zip";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      button.disabled = false;
      button.textContent = "Download ZIP again";
      setStatus(button, "ZIP download started. Check your Downloads folder.");
      emit({ status: "split_downloaded", fileName: anchor.download, byteLength: record.data.byteLength ?? blob.size });
    } catch (error) {
      const message = error instanceof Error ? error.message : "split_zip_download_failed";
      button.disabled = false;
      button.textContent = "Try ZIP download again";
      setStatus(button, message, "alert");
      emit({ status: "split_download_error", error: message });
    }
  }

`;
if (!router.includes("async function continueTargetSizeWorkflow")) {
  if (!router.includes(lifecycleAnchor)) throw new Error("Target-size router lifecycle anchor not found");
  router = router.replace(lifecycleAnchor, targetWorkflowHelpers + lifecycleAnchor);
}

const confirmStateBoundary = `    completedResult = null;
    active = true;`;
const confirmStateReplacement = `    completedResult = null;
    completedSplitResult = null;
    activeTargetPartSizeMb = Number.parseFloat(button.dataset.aiTargetPartSizeMb || "") || null;
    workflowStage = "compression";
    active = true;`;
if (!router.includes(confirmStateReplacement)) {
  if (!router.includes(confirmStateBoundary)) throw new Error("Target-size router confirm state boundary not found");
  router = router.replace(confirmStateBoundary, confirmStateReplacement);
}

const officeResultBoundary = `      } else if (type === "office:result") {
        renderComplete(message.result);`;
const officeResultReplacement = `      } else if (type === "office:result") {
        void continueTargetSizeWorkflow(message.result).catch((error) => {
          renderLifecycleError(error instanceof Error ? error.message : "target_size_workflow_failed", "TARGET_SIZE_WORKFLOW_FAILED");
        });`;
if (!router.includes(officeResultReplacement)) {
  if (!router.includes(officeResultBoundary)) throw new Error("Target-size Office result boundary not found");
  router = router.replace(officeResultBoundary, officeResultReplacement);
}

const listenerBoundary = `    if (activeRoute === "office_current") {
      if (type === "office:progress") {`;
const listenerReplacement = `    if (workflowStage === "splitting") {
      if (type === "split:progress") {
        renderProgress(message.message || "Splitting to the delivery limit…", message.progress);
      } else if (type === "split:result") {
        renderSplitComplete(message.result);
      } else if (type === "split:error") {
        renderLifecycleError(message.message, message.code);
      }
      return;
    }

    if (activeRoute === "office_current") {
      if (type === "office:progress") {`;
if (!router.includes(listenerReplacement)) {
  if (!router.includes(listenerBoundary)) throw new Error("Target-size split listener boundary not found");
  router = router.replace(listenerBoundary, listenerReplacement);
}

const clickBoundary = `    if (button.dataset.aiAction === "download") {
      void downloadProcessedPdf(button);
      return;
    }`;
const clickReplacement = `    if (button.dataset.aiAction === "download") {
      void downloadProcessedPdf(button);
      return;
    }
    if (button.dataset.aiAction === "download-split") {
      void downloadSplitZip(button);
      return;
    }`;
if (!router.includes(clickReplacement)) {
  if (!router.includes(clickBoundary)) throw new Error("Target-size download click boundary not found");
  router = router.replace(clickBoundary, clickReplacement);
}

await writeFile(ROUTER_PATH, router, "utf8");
process.stdout.write("AI Lab target-size compress-validate-split workflow applied\n");
