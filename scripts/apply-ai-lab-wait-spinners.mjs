import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const popupPath = path.join(outputDir, "popup.html");
const runtimeName = "ai-lab-wait-spinners.js";
const runtimePath = path.join(outputDir, runtimeName);

const runtime = `(() => {
  const PROGRESS_ID = "ai-lab-planner-progress";

  function normalizedText(node) {
    return (node?.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function removeProgress() {
    document.getElementById(PROGRESS_ID)?.remove();
  }

  function createProgress() {
    const track = document.createElement("div");
    track.id = PROGRESS_ID;
    track.className = "ai-lab-planner-progress";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "AI Planner is working");

    const bar = document.createElement("span");
    bar.className = "ai-lab-planner-progress__bar";
    track.appendChild(bar);
    return track;
  }

  function syncPlannerProgress() {
    const containers = Array.from(document.querySelectorAll("article, section, .planner-card, .ai-lab-goal-panel"));
    const plannerCard = containers.find((node) => {
      const text = normalizedText(node);
      return text.includes("building your plan") && text.includes("consulting ai planner");
    });

    if (!plannerCard) {
      removeProgress();
      return;
    }

    const text = normalizedText(plannerCard);
    const finished = text.includes("recommendation unavailable") ||
      text.includes("planner timeout") ||
      text.includes("document analysis failed") ||
      text.includes("best route");

    if (finished) {
      removeProgress();
      return;
    }

    if (document.getElementById(PROGRESS_ID)) return;

    const statusRow = Array.from(plannerCard.querySelectorAll("div, p"))
      .find((node) => normalizedText(node).includes("consulting ai planner"));
    (statusRow?.parentElement || plannerCard).appendChild(createProgress());
  }

  const observer = new MutationObserver(syncPlannerProgress);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  syncPlannerProgress();
})();
`;

await writeFile(runtimePath, runtime, "utf8");

let popup = await readFile(popupPath, "utf8");
const styleMarker = "data-ai-lab-wait-spinner-style";
const styleStartTag = `<style ${styleMarker}>`;
const styleEndTag = "</style>";
const progressStyle = `${styleStartTag}
.ai-lab-planner-progress {
  position: relative;
  width: 100%;
  height: 6px;
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid rgba(118, 185, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
}
.ai-lab-planner-progress__bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 38%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f7cff, #46d7ff, #7b61ff);
  box-shadow: 0 0 16px rgba(70, 215, 255, 0.58);
  animation: ai-lab-planner-progress-slide 1.15s ease-in-out infinite;
}
@keyframes ai-lab-planner-progress-slide {
  0% { left: -42%; }
  100% { left: 104%; }
}
${styleEndTag}`;

function replaceTaggedBlock(source, startTag, endTag, replacement) {
  const start = source.indexOf(startTag);
  if (start < 0) return source.replace("</head>", `${replacement}</head>`);

  const end = source.indexOf(endTag, start);
  if (end < 0) throw new Error(`Unclosed tagged block: ${startTag}`);

  return source.slice(0, start) + replacement + source.slice(end + endTag.length);
}

popup = replaceTaggedBlock(popup, styleStartTag, styleEndTag, progressStyle);

if (!popup.includes("data-ai-lab-wait-spinners")) {
  popup = popup.replace(
    "</body>",
    `<script data-ai-lab-wait-spinners src="./${runtimeName}"></script></body>`,
  );
}

await writeFile(popupPath, popup, "utf8");
console.log("AI Lab planner progress indicator embedded");
