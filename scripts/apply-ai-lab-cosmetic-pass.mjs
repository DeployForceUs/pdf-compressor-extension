import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const popupPath = path.join(outputDir, "popup.html");
const runtimeName = "ai-lab-cosmetic-pass.js";
const runtimePath = path.join(outputDir, runtimeName);

const runtime = `(() => {
  const STYLE_ID = "ai-lab-cosmetic-pass-style";
  const UPLOAD_SPINNER_ID = "ai-lab-upload-immediate-spinner";
  const PLANNER_SPINNER_ID = "ai-lab-planner-wait-spinner";

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = \`
      .hero__icon {
        color: #ffffff !important;
        background: #ff1744 !important;
        border-color: #ff5b75 !important;
        box-shadow: 0 0 0 1px rgba(255, 23, 68, .35), 0 10px 26px rgba(255, 23, 68, .42), inset 0 1px 0 rgba(255,255,255,.34) !important;
        opacity: 1 !important;
      }
      .hero__icon svg,
      .hero__icon svg * {
        color: #ffffff !important;
        opacity: 1 !important;
      }
      button.ai-lab-acid-download {
        color: #041204 !important;
        background: linear-gradient(135deg, #b6ff00 0%, #39ff14 45%, #00f56a 100%) !important;
        border-color: #baff37 !important;
        box-shadow: 0 0 0 1px rgba(182,255,0,.42), 0 0 22px rgba(57,255,20,.42), 0 12px 30px rgba(0,245,106,.28), inset 0 1px 0 rgba(255,255,255,.62) !important;
        font-weight: 900 !important;
        text-shadow: 0 1px 0 rgba(255,255,255,.32) !important;
      }
      button.ai-lab-acid-download:hover:not(:disabled) {
        filter: brightness(1.08) saturate(1.15);
        transform: translateY(-1px);
      }
      button.ai-lab-acid-download:disabled {
        opacity: .64;
      }
      .ai-lab-immediate-spinner-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 4px 0;
      }
      .ai-lab-inline-spinner {
        display: inline-block !important;
        flex: 0 0 auto;
      }
      button .ai-lab-inline-spinner {
        margin-right: 8px;
        vertical-align: -2px;
      }
    \`;
    document.head.appendChild(style);
  }

  function normalizedText(node) {
    return (node?.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function makeSpinner(id) {
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.className = "ai-lab-immediate-spinner-wrap";
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    const spinner = document.createElement("span");
    spinner.className = "planner-card__spinner ai-lab-inline-spinner";
    spinner.setAttribute("aria-hidden", "true");
    wrap.appendChild(spinner);
    return wrap;
  }

  function markDownloadButtons() {
    document.querySelectorAll("button").forEach((button) => {
      const text = normalizedText(button);
      if (text === "download processed pdf" || text === "download split zip") {
        button.classList.add("ai-lab-acid-download");
      }
    });
  }

  function stopUploadSpinner() {
    document.getElementById(UPLOAD_SPINNER_ID)?.remove();
  }

  function startUploadSpinner() {
    stopUploadSpinner();
    const host = document.querySelector(".input-card") || document.querySelector(".dropzone") || document.querySelector(".planner-card");
    if (!host) return;
    host.appendChild(makeSpinner(UPLOAD_SPINNER_ID));
    window.setTimeout(stopUploadSpinner, 60000);
  }

  function stopPlannerSpinner() {
    document.getElementById(PLANNER_SPINNER_ID)?.remove();
  }

  function startPlannerSpinner(button) {
    stopPlannerSpinner();
    const spinner = makeSpinner(PLANNER_SPINNER_ID);
    const host = button?.closest("article, section, .planner-card, .ai-lab-goal-panel") || button?.parentElement || document.querySelector(".planner-card");
    if (host) host.appendChild(spinner);
    window.setTimeout(stopPlannerSpinner, 90000);
  }

  function plannerFinished() {
    const bodyText = normalizedText(document.body);
    return bodyText.includes("best route") ||
      bodyText.includes("ai recommendation ready") ||
      bodyText.includes("recommendation unavailable") ||
      bodyText.includes("planner timeout") ||
      bodyText.includes("document analysis failed");
  }

  function syncBusyStates() {
    markDownloadButtons();

    const inputStatus = normalizedText(document.querySelector(".input-card__header .status-badge"));
    if (inputStatus === "ready" || inputStatus === "listo" || inputStatus.includes("invalid")) {
      stopUploadSpinner();
    }

    if (plannerFinished()) stopPlannerSpinner();
  }

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "file" && target.files?.length) {
      startUploadSpinner();
    }
  }, true);

  document.addEventListener("drop", (event) => {
    if (event.dataTransfer?.files?.length) startUploadSpinner();
  }, true);

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    const text = normalizedText(button);
    if (/smart plan|create plan|build plan|recommendation|analyzing and planning/.test(text)) {
      startPlannerSpinner(button);
    }
  }, true);

  const observer = new MutationObserver(syncBusyStates);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  syncBusyStates();
})();
`;

await writeFile(runtimePath, runtime, "utf8");

let popup = await readFile(popupPath, "utf8");
if (!popup.includes("data-ai-lab-cosmetic-pass")) {
  popup = popup.replace(
    "</body>",
    `<script data-ai-lab-cosmetic-pass src="./${runtimeName}"></script></body>`,
  );
  await writeFile(popupPath, popup, "utf8");
}

console.log("AI Lab cosmetic pass embedded");
