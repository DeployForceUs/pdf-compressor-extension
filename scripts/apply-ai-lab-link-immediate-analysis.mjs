import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtimePath = path.resolve(".output/chrome-mv3-ai-lab/ai-lab-pdf-link.js");
let source = await readFile(runtimePath, "utf8");
const marker = "AI Lab immediate linked-PDF analysis transition";

if (!source.includes(marker)) {
  const loadFunctionMarker = "  async function loadPdfFromLink(urlValue, input, button, error) {";
  if (!source.includes(loadFunctionMarker)) {
    throw new Error("AI Lab linked-PDF transition failed: load function was not found");
  }

  const helpers = `  /* ${marker} */
  function setAnalysisScreen() {
    document.body.classList.remove("ai-lab-session-upload", "ai-lab-session-goal");
    document.body.classList.add("ai-lab-session-analysis");
  }

  function removeTransientState() {
    document.querySelector(".ai-lab-link-transfer-state")?.remove();
  }

  function showLinkLoading() {
    setAnalysisScreen();
    removeTransientState();
    const plannerCard = document.querySelector(".planner-card");
    if (!plannerCard) return;
    const state = document.createElement("div");
    state.className = "planner-card__analysis-progress ai-lab-link-transfer-state";
    state.setAttribute("role", "status");
    state.setAttribute("aria-live", "polite");
    state.innerHTML = '<span class="planner-card__spinner" aria-hidden="true"></span>';
    plannerCard.append(state);
  }

  function showLinkError(message) {
    setAnalysisScreen();
    removeTransientState();
    const plannerCard = document.querySelector(".planner-card");
    if (!plannerCard) return;
    const state = document.createElement("p");
    state.className = "planner-card__error ai-lab-link-transfer-state";
    state.setAttribute("role", "alert");
    state.textContent = message;
    plannerCard.append(state);
  }

  function syncTransientState() {
    const transient = document.querySelector(".ai-lab-link-transfer-state");
    if (!transient) return;
    if (document.body.classList.contains("ai-lab-session-upload")) {
      transient.remove();
      return;
    }
    const plannerCard = document.querySelector(".planner-card");
    const nativeProgress = plannerCard?.querySelector(".planner-card__analysis-progress:not(.ai-lab-link-transfer-state)");
    const nativeResult = plannerCard?.querySelector(".planner-card__analysis-result");
    const nativeError = plannerCard?.querySelector(".planner-card__error:not(.ai-lab-link-transfer-state)");
    if (nativeProgress || nativeResult || nativeError) transient.remove();
  }

`;

  source = source.replace(loadFunctionMarker, helpers + loadFunctionMarker);
  source = source.replace(
    "    const originalUrl = urlValue.trim();\n    const url = normalizeGoogleDriveUrl(originalUrl);",
    "    const originalUrl = urlValue.trim();\n    const url = normalizeGoogleDriveUrl(originalUrl);\n    showLinkLoading();",
  );
  source = source.replace(
    '      error.textContent = cause instanceof Error ? cause.message : "This link could not be loaded.";',
    '      const message = cause instanceof Error ? cause.message : "This link could not be loaded.";\n      error.textContent = message;\n      showLinkError(message);',
  );
  source = source.replace(
    "  const observer = new MutationObserver(install);\n  observer.observe(document.documentElement, { childList: true, subtree: true });",
    "  const observer = new MutationObserver(() => { install(); syncTransientState(); });\n  observer.observe(document.documentElement, { childList: true, subtree: true });",
  );

  await writeFile(runtimePath, source, "utf8");
}

const verified = await readFile(runtimePath, "utf8");
for (const required of [marker, "showLinkLoading();", "showLinkError(message)", "syncTransientState();"]) {
  if (!verified.includes(required)) {
    throw new Error(`AI Lab linked-PDF transition verification failed: missing ${required}`);
  }
}

console.log("AI Lab linked-PDF immediate analysis transition verified");
