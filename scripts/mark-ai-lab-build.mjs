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

body {
  background:
    radial-gradient(circle at 15% 0%, rgba(37, 99, 235, 0.22), transparent 34rem),
    linear-gradient(180deg, #07111f 0%, #020617 100%);
}

.shell {
  border-color: rgba(96, 165, 250, 0.26);
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.52);
}

.hero {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(10, 34, 72, 0.94));
  border-bottom-color: rgba(96, 165, 250, 0.24);
}

.hero__copy .eyebrow {
  color: #60a5fa;
}

.hero__copy h1 {
  color: #f8fafc;
}

.hero__copy .subtitle {
  color: #bfdbfe;
}

.hero__build {
  border-color: rgba(96, 165, 250, 0.36);
  background: rgba(37, 99, 235, 0.14);
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
  padding: 28px;
}

body:not(.ai-lab--pdf-ready) .dropzone {
  min-height: 290px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.dropzone {
  border-color: rgba(96, 165, 250, 0.42);
  background: linear-gradient(180deg, rgba(30, 64, 175, 0.13), rgba(15, 23, 42, 0.5));
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
  gap: 8px;
  margin: 0 0 16px;
}

.ai-lab-stage-strip span {
  border: 1px solid rgba(96, 165, 250, 0.24);
  border-radius: 999px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.72);
  color: #94a3b8;
  font-size: 11px;
  text-align: center;
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

@media (max-width: 720px) {
  .hero {
    align-items: flex-start;
  }

  .ai-lab-stage-strip {
    grid-template-columns: 1fr;
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
