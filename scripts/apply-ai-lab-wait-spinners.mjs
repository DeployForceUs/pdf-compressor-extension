import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const popupPath = path.join(outputDir, "popup.html");
const runtimeName = "ai-lab-wait-spinners.js";
const runtimePath = path.join(outputDir, runtimeName);

const runtime = `(() => {
  const ANALYSIS_SPINNER_ID = "ai-lab-analysis-wait-spinner";
  const PLANNER_SPINNER_ID = "ai-lab-planner-wait-spinner";

  function normalizedText(node) {
    return (node?.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function createSpinner(id) {
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.className = "ai-lab-wait-spinner";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");

    const spinner = document.createElement("span");
    spinner.className = "planner-card__spinner";
    spinner.setAttribute("aria-hidden", "true");
    wrap.appendChild(spinner);
    return wrap;
  }

  function removeSpinner(id) {
    document.getElementById(id)?.remove();
  }

  function syncWaitSpinners() {
    const containers = Array.from(document.querySelectorAll("article, section, .planner-card, .ai-lab-goal-panel"));

    const analysisCard = containers.find((node) => normalizedText(node).includes("automatic local analysis"));
    if (analysisCard) {
      const text = normalizedText(analysisCard);
      const finished = text.includes("local analysis complete") || text.includes("analysis failed") || text.includes("error");
      if (!finished && !document.getElementById(ANALYSIS_SPINNER_ID)) {
        analysisCard.appendChild(createSpinner(ANALYSIS_SPINNER_ID));
      } else if (finished) {
        removeSpinner(ANALYSIS_SPINNER_ID);
      }
    } else {
      removeSpinner(ANALYSIS_SPINNER_ID);
    }

    const plannerCard = containers.find((node) => {
      const text = normalizedText(node);
      return text.includes("building your plan") || text.includes("consulting ai planner");
    });
    if (plannerCard) {
      const text = normalizedText(plannerCard);
      const finished = text.includes("recommendation unavailable") || text.includes("planner timeout") || text.includes("error");
      if (!finished && !document.getElementById(PLANNER_SPINNER_ID)) {
        const statusRow = Array.from(plannerCard.querySelectorAll("div, p")).find((node) => normalizedText(node).includes("consulting ai planner"));
        (statusRow || plannerCard).appendChild(createSpinner(PLANNER_SPINNER_ID));
      } else if (finished) {
        removeSpinner(PLANNER_SPINNER_ID);
      }
    } else {
      removeSpinner(PLANNER_SPINNER_ID);
    }
  }

  const observer = new MutationObserver(syncWaitSpinners);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  syncWaitSpinners();
})();
`;

await writeFile(runtimePath, runtime, "utf8");

let popup = await readFile(popupPath, "utf8");
const spinnerStyle = `<style data-ai-lab-wait-spinner-style>
.ai-lab-wait-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 34px;
  padding: 8px 0 2px;
}
.ai-lab-wait-spinner .planner-card__spinner {
  display: inline-block !important;
}
</style>`;

if (!popup.includes("data-ai-lab-wait-spinner-style")) {
  popup = popup.replace("</head>", `${spinnerStyle}</head>`);
}

if (!popup.includes("data-ai-lab-wait-spinners")) {
  popup = popup.replace(
    "</body>",
    `<script data-ai-lab-wait-spinners src="./${runtimeName}"></script></body>`,
  );
}

await writeFile(popupPath, popup, "utf8");
console.log("AI Lab visual wait spinners embedded");