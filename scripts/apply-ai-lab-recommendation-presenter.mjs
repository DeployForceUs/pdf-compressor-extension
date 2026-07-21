import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const GOAL_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-all-goal-flows.js");
const PRESENTER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-recommendation-presenter.js");
const SCRIPT_NAME = "ai-lab-recommendation-presenter.js";

const goalRuntime = await readFile(GOAL_RUNTIME_PATH, "utf8");
const startMarker = "  function planFor(";
const endMarker = "  function bindPanel(";
const startIndex = goalRuntime.indexOf(startMarker);
const endIndex = goalRuntime.indexOf(endMarker, startIndex);
if (startIndex < 0 || endIndex < 0) {
  throw new Error("AI Lab recommendation template boundary not found");
}

const waitingRenderer = `  function renderRecommendation(panel, goal, option, customText = "") {
    panel.dataset.aiLabGoalView = "recommendation";
    panel.dataset.aiLabActiveGoal = goal;
    panel.dataset.aiLabSelectedOption = option;
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to goal choices">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">Recommended Plan</p>',
      '<h2 id="ai-lab-goal-title">Building your plan…</h2>',
      '<div class="ai-lab-recommendation ai-lab-recommendation--loading" aria-live="polite">',
      '<span><strong>Status</strong> Checking this device, Office Engine, and AI Planner…</span>',
      '</div>',
    ].join("");
  }

`;

await writeFile(
  GOAL_RUNTIME_PATH,
  goalRuntime.slice(0, startIndex) + waitingRenderer + goalRuntime.slice(endIndex),
  "utf8",
);

const presenterRuntime = `(() => {
  const RESULT_EVENT = "ai-lab:planner-result";

  function panel() {
    return document.querySelector(".ai-lab-goal-panel");
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addRow(container, label, value) {
    const row = element("span", "ai-lab-recommendation__row");
    row.append(element("strong", "", label), document.createTextNode(" " + value));
    container.append(row);
  }

  function titleCase(value) {
    return String(value || "").split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
  }

  function formatDuration(range) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return "Not available";
    const minMinutes = Math.max(1, Math.ceil(range.min / 60));
    const maxMinutes = Math.max(minMinutes, Math.ceil(range.max / 60));
    return minMinutes === maxMinutes ? minMinutes + " min" : minMinutes + "–" + maxMinutes + " min";
  }

  function runtimeFor(response) {
    return response.recommendedRoute === "office_current"
      ? response.estimatedRuntime?.officeCurrent
      : response.estimatedRuntime?.local;
  }

  function currentConfiguration(orchestration, response) {
    if (response.recommendedRoute === "office_current") {
      const office = orchestration.computeSnapshot?.office || {};
      return Number.isFinite(office.cpuCores) && Number.isFinite(office.memoryMb)
        ? office.cpuCores + " vCPU · " + Math.round(office.memoryMb / 1024) + " GB RAM"
        : "Current Office Engine";
    }
    const local = orchestration.computeSnapshot?.local || {};
    const parts = [];
    if (Number.isFinite(local.logicalCores)) parts.push(local.logicalCores + " logical cores");
    if (Number.isFinite(local.memoryClassGb)) parts.push(local.memoryClassGb + " GB RAM class");
    return parts.length ? parts.join(" · ") : "This device";
  }

  function resetPanel(target, title) {
    target.dataset.aiLabGoalView = "recommendation";
    target.replaceChildren();
    const back = element("button", "ai-lab-goal-back", "← Back");
    back.type = "button";
    back.setAttribute("aria-label", "Back to goal choices");
    target.append(back, element("p", "ai-lab-goal-panel__eyebrow", "Recommended Plan"), element("h2", "", title));
  }

  function renderLoading(orchestration) {
    const target = panel();
    if (!target || target.dataset.aiLabGoalView !== "recommendation") return;
    resetPanel(target, "Building your plan…");
    const rows = element("div", "ai-lab-recommendation ai-lab-recommendation--loading");
    rows.setAttribute("aria-live", "polite");
    addRow(rows, "Status", "Consulting AI Planner…");
    target.append(rows);
  }

  function renderReady(orchestration, plannerResult) {
    const target = panel();
    const response = plannerResult?.response;
    if (!target || !response) return;

    const routeLabel = response.recommendedRoute === "office_current" ? "Current Office Engine" : "This device";
    resetPanel(target, response.recommendedRoute === "office_current" ? "Use the Office Engine" : "Process on this device");

    const rows = element("div", "ai-lab-recommendation");
    addRow(rows, "Best route", routeLabel);
    addRow(rows, "Recommended preset", titleCase(response.recommendedPreset));
    addRow(rows, "Current configuration", currentConfiguration(orchestration, response));
    addRow(rows, "Ideal configuration for similar workloads", response.idealConfiguration.label);
    if (response.oversizedConfiguration) {
      addRow(rows, "Larger configuration", response.oversizedConfiguration.label + " — " + response.oversizedConfiguration.reason);
    }
    addRow(rows, "Estimated runtime", formatDuration(runtimeFor(response)));
    addRow(rows, "Confidence", titleCase(response.confidence));

    const why = element("div", "ai-lab-recommendation__why");
    why.append(element("strong", "", "Why"), element("p", "", response.explanation));

    const confirm = element(
      "button",
      "primary ai-lab-process-button ai-lab-process-button--pending-router",
      response.recommendedRoute === "office_current" ? "Process with Office Engine" : "Process locally",
    );
    confirm.type = "button";
    confirm.disabled = true;
    confirm.setAttribute("aria-disabled", "true");
    confirm.dataset.aiRecommendedRoute = response.recommendedRoute;
    confirm.dataset.aiRecommendedPreset = response.recommendedPreset;

    target.append(rows, why, confirm);
  }

  function renderFallback(orchestration, plannerResult) {
    const target = panel();
    if (!target) return;
    resetPanel(target, "A safe local plan is available");
    const rows = element("div", "ai-lab-recommendation");
    addRow(rows, "Planner status", "AI recommendation unavailable");
    addRow(rows, "Fallback", "No processing has started. You can go back and try again.");
    if (plannerResult?.error) addRow(rows, "Reason", plannerResult.error);
    target.append(rows);
  }

  globalThis.addEventListener(RESULT_EVENT, (event) => {
    const detail = event.detail;
    if (!detail) return;
    if (detail.plannerResultStatus === "requesting") renderLoading(detail);
    else if (detail.plannerResultStatus === "ready") renderReady(detail, detail.plannerResult);
    else if (detail.plannerResultStatus === "fallback") renderFallback(detail, detail.plannerResult);
  });

  console.info("[AI Lab] Recommendation presenter ready");
})();
`;

await writeFile(PRESENTER_RUNTIME_PATH, presenterRuntime, "utf8");

const popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
const scriptTag = `<script src="/${SCRIPT_NAME}"></script>`;
const nextHtml = popupHtml.includes(scriptTag)
  ? popupHtml
  : popupHtml.replace("</body>", `${scriptTag}</body>`);
await writeFile(POPUP_HTML_PATH, nextHtml, "utf8");

process.stdout.write("AI Lab real Planner recommendation presenter applied\n");
