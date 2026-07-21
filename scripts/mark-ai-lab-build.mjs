import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");

const replacements = [
  {
    from: "Phase 1 foundation",
    to: "PRIVACY-FIRST AI PROCESSING",
    label: "App eyebrow",
  },
  {
    from: "PDF Compressor",
    to: "PDF Compressor AI Lab",
    label: "App title",
  },
  {
    from: "Local by default • Office when you choose",
    to: "AI-guided processing. Deterministic execution.",
    label: "App subtitle",
  },
  {
    from: "Smart Planner",
    to: "AI LAB · WORKFLOW",
    label: "Planner eyebrow",
  },
  {
    from: "Analyze this document",
    to: "Automatic Local Analysis",
    label: "Planner title",
  },
];

const AI_LAB_SHELL_CSS = `

/* Phase 12.2 competition-only shell. Appended only to chrome-mv3-ai-lab. */
:root {
  color-scheme: dark;
}

html,
body {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

body {
  background:
    radial-gradient(circle at 15% 0%, rgba(37, 99, 235, 0.22), transparent 34rem),
    linear-gradient(180deg, #07111f 0%, #020617 100%);
}

.app,
.shell {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.shell {
  border-color: rgba(96, 165, 250, 0.26);
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.52);
}

.hero {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) !important;
  gap: 12px !important;
  align-items: start !important;
  padding: 18px 20px !important;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(10, 34, 72, 0.94));
  border-bottom-color: rgba(96, 165, 250, 0.24);
}

.hero__brand,
.hero__copy,
.hero__tools {
  min-width: 0;
  max-width: 100%;
}

.hero__brand {
  align-items: flex-start !important;
}

.hero__icon {
  flex: 0 0 auto;
}

.hero__copy .eyebrow {
  color: #60a5fa;
  font-size: 10px !important;
  line-height: 1.25 !important;
  letter-spacing: 0.14em !important;
}

.hero__copy h1 {
  color: #f8fafc;
  margin-top: 4px !important;
  font-size: clamp(22px, 5.8vw, 30px) !important;
  line-height: 1.08 !important;
  overflow-wrap: anywhere;
}

.hero__copy .subtitle {
  color: #bfdbfe;
  margin-top: 5px !important;
  font-size: 13px !important;
  line-height: 1.35 !important;
}

.hero__tools {
  width: 100%;
  display: grid !important;
  grid-template-columns: auto minmax(0, 1fr) !important;
  gap: 10px !important;
  align-items: center !important;
}

.hero__build {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-color: rgba(96, 165, 250, 0.36);
  background: rgba(37, 99, 235, 0.14);
  font-size: 10px !important;
  padding: 7px 9px !important;
}

.language-switcher {
  min-width: 0;
  width: 100%;
}

.language-switcher__label {
  display: none !important;
}

.language-switcher__options {
  width: 100%;
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 4px !important;
}

.language-switcher__option {
  min-width: 0 !important;
  padding: 8px 10px !important;
  font-size: 12px !important;
  white-space: nowrap;
}

.body {
  min-width: 0;
  padding-left: 18px !important;
  padding-right: 18px !important;
}

.license-card,
.office-card,
.split-card,
.compression-card,
.diagnostics,
.footnote {
  display: none !important;
}

.input-card,
.planner-card {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  border-color: rgba(96, 165, 250, 0.3) !important;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(8, 20, 40, 0.96)) !important;
  box-shadow: 0 18px 48px rgba(2, 6, 23, 0.34);
}

.input-card__header,
.metadata-card {
  transition: opacity 180ms ease, transform 180ms ease;
}

body:not(.ai-lab--pdf-ready) .metadata-card,
body:not(.ai-lab--pdf-ready) .planner-card {
  display: none !important;
}

body:not(.ai-lab--pdf-ready) .input-card__header {
  display: none;
}

body:not(.ai-lab--pdf-ready) .input-card {
  padding: 20px !important;
}

body:not(.ai-lab--pdf-ready) .dropzone {
  min-height: 270px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.dropzone {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding-left: 22px !important;
  padding-right: 22px !important;
  border-color: rgba(96, 165, 250, 0.42);
  background: linear-gradient(180deg, rgba(30, 64, 175, 0.13), rgba(15, 23, 42, 0.5));
}

.dropzone h2,
.dropzone p {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.dropzone__actions,
.dropzone__actions .primary {
  width: 100%;
  max-width: 100%;
}

.dropzone:hover,
.dropzone--active {
  border-color: #60a5fa;
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.23), rgba(15, 23, 42, 0.58));
}

.planner-card {
  position: relative;
  overflow: hidden;
}

.planner-card::before {
  content: "STEP 2 OF 9";
  position: absolute;
  top: 0;
  right: 0;
  padding: 6px 10px;
  border-bottom-left-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #06b6d4);
  color: white;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.ai-lab-stage-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0 0 14px;
  min-width: 0;
  max-width: 100%;
}

.ai-lab-stage-strip span {
  min-width: 0;
  border: 1px solid rgba(96, 165, 250, 0.24);
  border-radius: 999px;
  padding: 8px 6px;
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
}

.ai-lab-stage-strip span:first-child {
  border-color: rgba(96, 165, 250, 0.7);
  color: #dbeafe;
  background: rgba(37, 99, 235, 0.2);
}

body.ai-lab--pdf-ready .ai-lab-stage-strip span:first-child {
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(22, 101, 52, 0.18);
}

body.ai-lab--pdf-ready .ai-lab-stage-strip span:nth-child(2) {
  border-color: rgba(96, 165, 250, 0.7);
  color: #dbeafe;
  background: rgba(37, 99, 235, 0.2);
}

@media (max-width: 520px) {
  .hero {
    padding: 16px !important;
  }

  .hero__tools {
    grid-template-columns: 1fr !important;
  }

  .hero__build {
    max-width: 100%;
    width: fit-content;
  }

  .body {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }

  .ai-lab-stage-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
`;

const AI_LAB_RUNTIME_JS = `
(() => {
  const READY_LABELS = new Set(["Ready", "Listo"]);

  function ensureStageStrip() {
    const body = document.querySelector(".body");
    if (!body || body.querySelector(".ai-lab-stage-strip")) return;

    const strip = document.createElement("div");
    strip.className = "ai-lab-stage-strip";
    strip.setAttribute("aria-label", "AI Orchestrator workflow progress");
    strip.innerHTML = "<span>1 · Upload PDF</span><span>2 · Local Analysis</span><span>3 · Define Goal</span>";
    body.prepend(strip);
  }

  function syncPdfState() {
    ensureStageStrip();
    const inputCard = document.querySelector(".input-card");
    const status = inputCard?.querySelector(".input-card__header .status-badge")?.textContent?.trim() ?? "";
    document.body.classList.toggle("ai-lab--pdf-ready", READY_LABELS.has(status));
  }

  const observer = new MutationObserver(syncPdfState);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  syncPdfState();
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

const javascriptFiles = await collectFiles(OUTPUT_DIR, ".js");
const replacementCounts = new Map(replacements.map(({ label }) => [label, 0]));

for (const file of javascriptFiles) {
  const source = await readFile(file, "utf8");
  let next = source;

  for (const replacement of replacements) {
    const occurrences = next.split(replacement.from).length - 1;
    if (occurrences > 0) {
      next = next.split(replacement.from).join(replacement.to);
      replacementCounts.set(
        replacement.label,
        (replacementCounts.get(replacement.label) ?? 0) + occurrences,
      );
    }
  }

  if (next !== source) {
    await writeFile(file, next, "utf8");
  }
}

for (const replacement of replacements) {
  const count = replacementCounts.get(replacement.label) ?? 0;
  if (count === 0) {
    throw new Error(`AI Lab marker failed: ${replacement.label} was not found in the built JavaScript`);
  }
}

const cssFiles = await collectFiles(OUTPUT_DIR, ".css");
let shellStylesApplied = 0;

for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes(".license-card") || source.includes("Phase 12.2 competition-only shell")) {
    continue;
  }

  await writeFile(file, `${source}${AI_LAB_SHELL_CSS}`, "utf8");
  shellStylesApplied += 1;
}

if (shellStylesApplied === 0) {
  throw new Error("AI Lab shell failed: popup stylesheet was not found");
}

const runtimePath = path.join(OUTPUT_DIR, "ai-lab-runtime.js");
await writeFile(runtimePath, AI_LAB_RUNTIME_JS, "utf8");

const popupHtmlPath = path.join(OUTPUT_DIR, "popup.html");
const popupHtml = await readFile(popupHtmlPath, "utf8");
if (!popupHtml.includes("ai-lab-runtime.js")) {
  await writeFile(
    popupHtmlPath,
    popupHtml.replace("</body>", '<script src="/ai-lab-runtime.js"></script></body>'),
    "utf8",
  );
}

console.log(
  `AI Lab workflow shell applied: ${replacements
    .map(({ label }) => `${label}=${replacementCounts.get(label)}`)
    .join(", ")}, styles=${shellStylesApplied}, runtime=1`,
);
