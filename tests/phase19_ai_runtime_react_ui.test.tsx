import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AiRuntimeExecutionPanel } from "../src/entrypoints/popup/AiRuntimeExecutionPanel.js";
import type { CoordinatorSnapshot } from "../src/lib/ai-runtime/execution-coordinator.js";
import { executionViewModel } from "../src/lib/ai-runtime/ui/execution-view-model.js";

function snapshot(
  state: CoordinatorSnapshot["state"],
  capabilities: CoordinatorSnapshot["capabilities"],
): CoordinatorSnapshot {
  return {
    executionId: state === "idle" ? null : "execution-ui",
    owner: "ai-execution-coordinator",
    state,
    sourceRecordId: state === "idle" ? null : "selected-pdf",
    compressedRecordId: state === "idle" ? null : "compressed-pdf",
    metadataBytes: null,
    actualBytes: null,
    targetBytes: state === "idle" ? null : 10 * 1024 * 1024,
    capabilities,
    lastTransition: "test",
    timestamp: 1234,
  };
}

const none = Object.freeze({
  canDownloadPdf: false,
  canDownloadZip: false,
  canPrepareSplit: false,
});

test("non-terminal states never expose a download action", () => {
  const states: CoordinatorSnapshot["state"][] = [
    "idle",
    "contract_ready",
    "planning",
    "plan_ready",
    "compressing",
    "claiming_compressed_result",
    "validating_compressed_result",
    "splitting",
    "validating_split_parts",
    "creating_zip",
    "cancelling",
    "cancelled",
    "failed",
  ];

  for (const state of states) {
    const view = executionViewModel(snapshot(state, none));
    assert.equal(view.showTerminalDownload, false, state);
    assert.notEqual(view.primaryAction, "download_pdf", state);
    assert.notEqual(view.primaryAction, "download_zip", state);
  }
});

test("split preparation is rendered only from coordinator capability", () => {
  const current = snapshot("splitting", {
    canDownloadPdf: false,
    canDownloadZip: false,
    canPrepareSplit: true,
  });
  const html = renderToStaticMarkup(<AiRuntimeExecutionPanel snapshot={current} />);
  assert.match(html, />Prepare split</);
  assert.doesNotMatch(html, />Download PDF</);
  assert.doesNotMatch(html, />Download ZIP</);
});

test("completed PDF exposes only the PDF download", () => {
  const current = snapshot("completed_pdf", {
    canDownloadPdf: true,
    canDownloadZip: false,
    canPrepareSplit: false,
  });
  const html = renderToStaticMarkup(<AiRuntimeExecutionPanel snapshot={current} />);
  assert.match(html, />Download PDF</);
  assert.doesNotMatch(html, />Download ZIP</);
  assert.doesNotMatch(html, />Prepare split</);
});

test("completed ZIP exposes only the ZIP download", () => {
  const current = snapshot("completed_zip", {
    canDownloadPdf: false,
    canDownloadZip: true,
    canPrepareSplit: false,
  });
  const html = renderToStaticMarkup(<AiRuntimeExecutionPanel snapshot={current} />);
  assert.match(html, />Download ZIP</);
  assert.doesNotMatch(html, />Download PDF</);
  assert.doesNotMatch(html, />Prepare split</);
});

test("reset visibility is state-driven", () => {
  assert.equal(executionViewModel(snapshot("idle", none)).canReset, false);
  assert.equal(executionViewModel(snapshot("cancelling", none)).canReset, false);
  assert.equal(executionViewModel(snapshot("failed", none)).canReset, true);
  assert.equal(executionViewModel(snapshot("completed_zip", {
    canDownloadPdf: false,
    canDownloadZip: true,
    canPrepareSplit: false,
  })).canReset, true);
});
