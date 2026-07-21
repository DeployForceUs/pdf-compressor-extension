import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const CSS_MARKER = "Phase 12.2 explicit workflow navigation";
const JS_MARKER = "Phase 12.2 explicit workflow navigation runtime";

const WORKFLOW_CSS = `

/* ${CSS_MARKER} */
body.ai-lab-session-upload .input-card {
  display: block !important;
  min-height: 330px !important;
  max-height: 330px !important;
  padding: 20px !important;
  overflow: hidden !important;
}

body.ai-lab-session-upload .input-card__header,
body.ai-lab-session-upload .metadata-card,
body.ai-lab-session-upload .planner-card,
body.ai-lab-session-upload .ai-lab-goal-panel {
  display: none !important;
}

body.ai-lab-session-upload .dropzone {
  display: flex !important;
  min-height: 290px !important;
  height: 290px !important;
  flex-direction: column !important;
  justify-content: center !important;
}

body.ai-lab-session-analysis .input-card,
body.ai-lab-session-goal .input-card {
  display: block !important;
  min-height: 330px !important;
  max-height: 330px !important;
  padding: 0 !important;
  overflow: hidden !important;
}

body.ai-lab-session-analysis .input-card__header,
body.ai-lab-session-analysis .dropzone,
body.ai-lab-session-analysis .metadata-card,
body.ai-lab-session-analysis .ai-lab-goal-panel,
body.ai-lab-session-goal .input-card__header,
body.ai-lab-session-goal .dropzone,
body.ai-lab-session-goal .metadata-card,
body.ai-lab-session-goal .planner-card {
  display: none !important;
}

body.ai-lab-session-analysis .planner-card {
  display: flex !important;
  min-height: 330px !important;
  max-height: 330px !important;
  margin: 0 !important;
  padding: 22px !important;
  border: 0 !important;
  border-radius: 18px !important;
  flex-direction: column !important;
  justify-content: center !important;
  overflow: hidden !important;
}

body.ai-lab-session-analysis .planner-card::before,
body.ai-lab-session-analysis .planner-card .eyebrow,
body.ai-lab-session-analysis .planner-card .status-badge {
  display: none !important;
}

body.ai-lab-session-analysis .planner-card__header {
  display: block !important;
  margin: 0 0 10px !important;
  text-align: center !important;
}

body.ai-lab-session-analysis .planner-card__header h2 {
  margin: 0 !important;
  font-size: 22px !important;
  line-height: 1.15 !important;
}

body.ai-lab-session-analysis .planner-card__disclosure {
  margin: 0 auto 12px !important;
  max-width: 390px !important;
  font-size: 11px !important;
  line-height: 1.35 !important;
  text-align: center !important;
}

body.ai-lab-session-analysis .planner-card__analysis-progress,
body.ai-lab-session-analysis .planner-card__analysis-result {
  min-height: 0 !important;
  gap: 8px !important;
}

body.ai-lab-session-analysis .planner-card__analysis-result > strong:first-child {
  font-size: 16px !important;
}

body.ai-lab-session-analysis .planner-card__analysis-result small {
  display: none !important;
}

.ai-lab-continue-button {
  width: 100% !important;
  margin-top: 8px !important;
}

.ai-lab-stage-strip span {
  cursor: default;
  user-select: none;
}

.ai-lab-stage-strip span[role="button"] {
  cursor: pointer;
}

.ai-lab-stage-strip span[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.52;
}

body.ai-lab-session-upload .ai-lab-stage-strip span:first-child,
body.ai-lab-session-analysis .ai-lab-stage-strip span:nth-child(2),
body.ai-lab-session-goal .ai-lab-stage-strip span:nth-child(3) {
  color: var(--ai-white) !important;
  border-color: rgba(127, 171, 220, 0.36) !important;
  background: linear-gradient(180deg, #3C8CE3 0%, #143294 100%) !important;
  box-shadow: 0 12px 30px rgba(20, 50, 148, 0.46) !important;
  opacity: 1 !important;
}

body.ai-lab-session-analysis .ai-lab-stage-strip span:first-child,
body.ai-lab-session-goal .ai-lab-stage-strip span:first-child,
body.ai-lab-session-goal .ai-lab-stage-strip span:nth-child(2) {
  color: var(--ai-ice) !important;
  border-color: rgba(127, 171, 220, 0.42) !important;
  background: linear-gradient(180deg, rgba(31, 38, 57, 0.96), rgba(8, 13, 23, 0.96)) !important;
  box-shadow: inset 0 0 0 1px rgba(60, 140, 227, 0.08) !important;
  opacity: 1 !important;
}

.ai-lab-goal-panel {
  min-height: 330px;
  max-height: 330px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(8, 13, 23, 0.98), rgba(2, 3, 7, 0.98));
  color: var(--ai-white);
}

.ai-lab-goal-panel__eyebrow {
  margin: 0 0 6px;
  color: var(--ai-azure);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  text-align: center;
}

.ai-lab-goal-panel h2 {
  margin: 0 0 16px;
  font-size: 21px;
  line-height: 1.18;
  text-align: center;
}

.ai-lab-goal-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ai-lab-goal-option {
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid rgba(127, 171, 220, 0.24);
  border-radius: 12px;
  background: rgba(8, 13, 23, 0.9);
  color: var(--ai-white);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ai-lab-goal-option:hover,
.ai-lab-goal-option:focus-visible {
  border-color: var(--ai-azure);
  background: rgba(20, 50, 148, 0.34);
  outline: none;
}
`;

const WORKFLOW_RUNTIME = `

/* ${JS_MARKER} */
(() => {
  const RELOAD_FLAG = "ai-lab-reload-after-upload";
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const resumeAnalysis = navigationEntry?.type === "reload" && sessionStorage.getItem(RELOAD_FLAG) === "1";
  sessionStorage.removeItem(RELOAD_FLAG);

  let currentStage = resumeAnalysis ? "analysis" : "upload";
  let analysisComplete = false;
  let awaitingFreshUpload = false;
  let sawValidationState = false;
  let reloadScheduled = false;

  function stageStrip() {
    return document.querySelector(".ai-lab-stage-strip");
  }

  function ensureGoalPanel() {
    const inputCard = document.querySelector(".input-card");
    if (!inputCard || inputCard.querySelector(".ai-lab-goal-panel")) return;

    const panel = document.createElement("section");
    panel.className = "ai-lab-goal-panel";
    panel.setAttribute("aria-labelledby", "ai-lab-goal-title");
    panel.innerHTML = [
      '<p class="ai-lab-goal-panel__eyebrow">Define Goal</p>',
      '<h2 id="ai-lab-goal-title">What do you need to do with this PDF?</h2>',
      '<div class="ai-lab-goal-options">',
      '<button type="button" class="ai-lab-goal-option">Send by email</button>',
      '<button type="button" class="ai-lab-goal-option">Upload to a portal</button>',
      '<button type="button" class="ai-lab-goal-option">Print</button>',
      '<button type="button" class="ai-lab-goal-option">Archive</button>',
      '<button type="button" class="ai-lab-goal-option">Reduce file size</button>',
      '<button type="button" class="ai-lab-goal-option">Something else</button>',
      '</div>',
    ].join("");
    inputCard.append(panel);
  }

  function setStage(stage) {
    currentStage = stage;
    document.body.classList.toggle("ai-lab-session-upload", stage === "upload");
    document.body.classList.toggle("ai-lab-session-analysis", stage === "analysis");
    document.body.classList.toggle("ai-lab-session-goal", stage === "goal");

    const spans = stageStrip()?.querySelectorAll("span") ?? [];
    spans.forEach((span, index) => {
      const enabled = index === 0 || (index === 1 && currentStage !== "upload") || (index === 2 && analysisComplete);
      span.setAttribute("role", enabled ? "button" : "status");
      span.setAttribute("aria-disabled", enabled ? "false" : "true");
      span.tabIndex = enabled ? 0 : -1;
    });
  }

  function startOver() {
    analysisComplete = false;
    awaitingFreshUpload = false;
    sawValidationState = false;
    reloadScheduled = false;
    setStage("upload");
  }

  function showAnalysis() {
    if (currentStage === "upload") return;
    setStage("analysis");
  }

  function showGoal() {
    if (!analysisComplete) return;
    ensureGoalPanel();
    setStage("goal");
  }

  function bindStageNavigation() {
    const spans = stageStrip()?.querySelectorAll("span");
    if (!spans || spans.length < 3 || spans[0].dataset.aiLabBound === "1") return;

    const activate = (index) => {
      if (index === 0) startOver();
      if (index === 1) showAnalysis();
      if (index === 2) showGoal();
    };

    spans.forEach((span, index) => {
      span.dataset.aiLabBound = "1";
      span.addEventListener("click", () => activate(index));
      span.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(index);
        }
      });
    });
  }

  function markFreshUpload() {
    awaitingFreshUpload = true;
    sawValidationState = false;
    reloadScheduled = false;
  }

  function bindFreshUploadDetection() {
    const input = document.querySelector('.dropzone input[type="file"]');
    if (input && input.dataset.aiLabBound !== "1") {
      input.dataset.aiLabBound = "1";
      input.addEventListener("change", markFreshUpload, true);
    }

    const dropzone = document.querySelector(".dropzone");
    if (dropzone && dropzone.dataset.aiLabDropBound !== "1") {
      dropzone.dataset.aiLabDropBound = "1";
      dropzone.addEventListener("drop", markFreshUpload, true);
    }
  }

  function maybeReloadForFreshPdf() {
    if (!awaitingFreshUpload || reloadScheduled) return;
    const status = document.querySelector(".input-card__header .status-badge")?.textContent?.trim() ?? "";
    const ready = status === "Ready" || status === "Listo";

    if (!ready) {
      sawValidationState = true;
      return;
    }

    if (!sawValidationState) return;
    reloadScheduled = true;
    sessionStorage.setItem(RELOAD_FLAG, "1");
    window.setTimeout(() => window.location.reload(), 80);
  }

  function syncAnalysisCompletion() {
    const result = document.querySelector(".planner-card__analysis-result");
    if (!result) return;

    const completed = result.textContent?.includes("Local analysis complete") ?? false;
    if (!completed) return;

    analysisComplete = true;
    document.body.classList.add("ai-lab-analysis-complete");

    if (!result.querySelector(".ai-lab-continue-button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "primary ai-lab-continue-button";
      button.textContent = "Continue to Define Goal";
      button.addEventListener("click", showGoal);
      result.append(button);
    }
  }

  function sync() {
    bindStageNavigation();
    bindFreshUploadDetection();
    ensureGoalPanel();
    maybeReloadForFreshPdf();
    syncAnalysisCompletion();
    setStage(currentStage);
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  sync();
})();
`;

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(absolutePath);
    }
  }

  return files;
}

const cssFiles = await collectFiles(OUTPUT_DIR, ".css");
let cssApplied = 0;
for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 sampled reference palette") || source.includes(CSS_MARKER)) continue;
  await writeFile(file, `${source}${WORKFLOW_CSS}`, "utf8");
  cssApplied += 1;
}

if (cssApplied === 0) {
  throw new Error("AI Lab workflow navigation failed: popup stylesheet was not found");
}

const runtimePath = path.join(OUTPUT_DIR, "ai-lab-runtime.js");
const runtimeSource = await readFile(runtimePath, "utf8");
if (!runtimeSource.includes(JS_MARKER)) {
  await writeFile(runtimePath, `${runtimeSource}${WORKFLOW_RUNTIME}`, "utf8");
}

console.log(`AI Lab workflow navigation applied: styles=${cssApplied}, runtime=1`);
