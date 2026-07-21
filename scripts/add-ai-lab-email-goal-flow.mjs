import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-email-goal-flow.js");
const CSS_MARKER = "Phase 12.3 AI Lab email goal flow";

const runtime = `(() => {
  const marker = "AI Lab email goal flow";

  function goalPanel() {
    return document.querySelector(".ai-lab-goal-panel");
  }

  function renderGoalChoices(panel) {
    panel.dataset.aiLabGoalView = "goals";
    panel.innerHTML = [
      '<p class="ai-lab-goal-panel__eyebrow">Define Goal</p>',
      '<h2 id="ai-lab-goal-title">What do you need to do with this PDF?</h2>',
      '<div class="ai-lab-goal-options">',
      '<button type="button" class="ai-lab-goal-option" data-ai-goal="email">Send by email</button>',
      '<button type="button" class="ai-lab-goal-option">Upload to a portal</button>',
      '<button type="button" class="ai-lab-goal-option">Print</button>',
      '<button type="button" class="ai-lab-goal-option">Archive</button>',
      '<button type="button" class="ai-lab-goal-option">Reduce file size</button>',
      '<button type="button" class="ai-lab-goal-option">Something else</button>',
      '</div>',
    ].join("");
  }

  function renderSizeChoices(panel) {
    panel.dataset.aiLabGoalView = "email-size";
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to goals">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">Send by email</p>',
      '<h2 id="ai-lab-goal-title">What size should the PDF fit?</h2>',
      '<div class="ai-lab-goal-options ai-lab-size-options">',
      '<button type="button" class="ai-lab-goal-option" data-ai-size="10">10 MB</button>',
      '<button type="button" class="ai-lab-goal-option" data-ai-size="20">20 MB</button>',
      '<button type="button" class="ai-lab-goal-option" data-ai-size="25">25 MB</button>',
      '<button type="button" class="ai-lab-goal-option" data-ai-size="custom">Custom</button>',
      '</div>',
      '<div class="ai-lab-custom-size" hidden>',
      '<input class="ai-lab-custom-size__input" type="number" min="1" max="1024" step="1" inputmode="numeric" placeholder="Target size in MB">',
      '<button type="button" class="primary ai-lab-custom-size__apply" disabled>Use size</button>',
      '</div>',
    ].join("");
  }

  function renderRecommendation(panel, sizeMb) {
    const lower = Math.max(1, Math.round(sizeMb * 0.8));
    const upper = Math.max(lower, Math.round(sizeMb * 0.95));
    panel.dataset.aiLabGoalView = "recommendation";
    panel.innerHTML = [
      '<button type="button" class="ai-lab-goal-back" aria-label="Back to size choices">← Back</button>',
      '<p class="ai-lab-goal-panel__eyebrow">Recommended Plan</p>',
      '<h2 id="ai-lab-goal-title">Ready for email delivery</h2>',
      '<div class="ai-lab-recommendation">',
      '<span><strong>Target</strong> Email under ' + sizeMb + ' MB</span>',
      '<span><strong>Recommended</strong> Balanced compression</span>',
      '<span><strong>Estimated output</strong> ' + lower + '–' + upper + ' MB</span>',
      '<span><strong>Quality</strong> Good for screen viewing and standard printing</span>',
      '<span><strong>Processing</strong> Local</span>',
      '</div>',
      '<button type="button" class="primary ai-lab-process-button">Process PDF</button>',
    ].join("");
    panel.dataset.aiLabTargetSizeMb = String(sizeMb);
  }

  function bindPanel(panel) {
    if (panel.dataset.aiLabEmailFlowBound === "1") return;
    panel.dataset.aiLabEmailFlowBound = "1";

    panel.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target) return;

      if (target.matches('[data-ai-goal="email"]') || target.textContent?.trim() === "Send by email") {
        renderSizeChoices(panel);
        return;
      }

      if (target.matches(".ai-lab-goal-back")) {
        if (panel.dataset.aiLabGoalView === "recommendation") renderSizeChoices(panel);
        else renderGoalChoices(panel);
        return;
      }

      const size = target.getAttribute("data-ai-size");
      if (size === "custom") {
        const custom = panel.querySelector(".ai-lab-custom-size");
        if (custom) custom.hidden = false;
        panel.querySelector(".ai-lab-custom-size__input")?.focus();
        return;
      }

      if (size) {
        renderRecommendation(panel, Number(size));
        return;
      }

      if (target.matches(".ai-lab-custom-size__apply")) {
        const input = panel.querySelector(".ai-lab-custom-size__input");
        const value = Number(input?.value);
        if (Number.isFinite(value) && value > 0) renderRecommendation(panel, Math.round(value));
      }
    });

    panel.addEventListener("input", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches(".ai-lab-custom-size__input")) return;
      const apply = panel.querySelector(".ai-lab-custom-size__apply");
      if (apply instanceof HTMLButtonElement) apply.disabled = !(Number(input.value) > 0);
    });

    panel.addEventListener("keydown", (event) => {
      const input = event.target;
      if (event.key !== "Enter" || !(input instanceof HTMLInputElement) || !input.matches(".ai-lab-custom-size__input")) return;
      const value = Number(input.value);
      if (Number.isFinite(value) && value > 0) renderRecommendation(panel, Math.round(value));
    });
  }

  function install() {
    const panel = goalPanel();
    if (!panel) return;
    bindPanel(panel);
  }

  install();
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  console.debug(marker);
})();
`;

const css = `

/* ${CSS_MARKER} */
.ai-lab-goal-back {
  align-self: flex-start;
  margin: -4px 0 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ai-ice, #DDEBFA);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.ai-lab-custom-size {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 8px;
  margin-top: 10px;
}

.ai-lab-custom-size[hidden] {
  display: none !important;
}

.ai-lab-custom-size__input {
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(127, 171, 220, 0.28);
  border-radius: 11px;
  background: rgba(8, 13, 23, 0.9);
  color: var(--ai-white, #F8F9F9);
  font: inherit;
  font-size: 12px;
  outline: none;
}

.ai-lab-custom-size__input:focus {
  border-color: var(--ai-azure, #3C8CE3);
  box-shadow: 0 0 0 2px rgba(60, 140, 227, 0.15);
}

.ai-lab-custom-size__apply {
  height: 40px;
}

.ai-lab-recommendation {
  display: grid;
  gap: 7px;
  width: 100%;
  margin: 0 0 12px;
  padding: 12px 14px;
  border: 1px solid rgba(127, 171, 220, 0.2);
  border-radius: 13px;
  background: rgba(8, 13, 23, 0.78);
  box-sizing: border-box;
}

.ai-lab-recommendation span {
  display: grid;
  grid-template-columns: 94px minmax(0, 1fr);
  gap: 8px;
  color: var(--ai-ice, #DDEBFA);
  font-size: 11px;
  line-height: 1.3;
}

.ai-lab-recommendation strong {
  color: var(--ai-white, #F8F9F9);
}

.ai-lab-process-button {
  width: 100%;
}
`;

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectCssFiles(absolutePath));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(absolutePath);
  }
  return files;
}

await writeFile(RUNTIME_PATH, runtime, "utf8");

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
popupHtml = popupHtml.replace(/<script\b[^>]*\bsrc=["']\/ai-lab-email-goal-flow\.js["'][^>]*><\/script>/gi, "");
popupHtml = popupHtml.replace("</body>", '<script src="/ai-lab-email-goal-flow.js"></script></body>');
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

const cssFiles = await collectCssFiles(OUTPUT_DIR);
let applied = 0;
for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(CSS_MARKER)) continue;
  await writeFile(file, source + css, "utf8");
  applied += 1;
}

if (applied === 0) throw new Error("AI Lab email goal flow styles were not applied");
console.log(`AI Lab email goal flow applied: styles=${applied}`);
