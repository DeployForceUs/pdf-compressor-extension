import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const MARKER = "Phase 12.2 sampled reference palette";

const PALETTE_CSS = `

/* ${MARKER}
   Dominant colors sampled from the approved visual reference:
   ink #020307, midnight #080D17, panel #1F2639,
   royal #143294, azure #3C8CE3, ice #7FABDC,
   silver #B9BBBC, white #F8F9F9.
*/
:root {
  --ai-ink: #020307;
  --ai-midnight: #080D17;
  --ai-panel: #1F2639;
  --ai-royal: #143294;
  --ai-azure: #3C8CE3;
  --ai-ice: #7FABDC;
  --ai-silver: #B9BBBC;
  --ai-white: #F8F9F9;
}

body {
  background:
    radial-gradient(circle at 78% 14%, rgba(60, 140, 227, 0.16), transparent 24rem),
    linear-gradient(180deg, var(--ai-ink) 0%, var(--ai-midnight) 55%, var(--ai-ink) 100%) !important;
  color: var(--ai-white) !important;
}

.shell {
  border-color: rgba(60, 140, 227, 0.34) !important;
  background: var(--ai-ink) !important;
  box-shadow: 0 24px 80px rgba(2, 3, 7, 0.76) !important;
}

.hero {
  background:
    radial-gradient(circle at 86% 20%, rgba(60, 140, 227, 0.22), transparent 20rem),
    linear-gradient(145deg, #020307 0%, #080D17 62%, #143294 145%) !important;
  border-bottom-color: rgba(60, 140, 227, 0.28) !important;
}

.hero__copy .eyebrow,
.dropzone__eyebrow {
  color: var(--ai-azure) !important;
}

.hero__copy h1,
.dropzone h2,
.input-card,
.planner-card {
  color: var(--ai-white) !important;
}

.hero__copy .subtitle,
.dropzone__note,
.metadata-row__label,
.planner-card__disclosure,
.planner-card__note {
  color: var(--ai-silver) !important;
}

.hero__build {
  color: var(--ai-ice) !important;
  border-color: rgba(127, 171, 220, 0.42) !important;
  background: rgba(31, 38, 57, 0.78) !important;
}

.language-switcher__options {
  border-color: rgba(60, 140, 227, 0.32) !important;
  background: rgba(8, 13, 23, 0.9) !important;
}

.language-switcher__option {
  color: var(--ai-silver) !important;
}

.language-switcher__option--active {
  color: var(--ai-white) !important;
  background: linear-gradient(180deg, #3C8CE3 0%, #143294 100%) !important;
  box-shadow: 0 8px 24px rgba(20, 50, 148, 0.42) !important;
}

.input-card,
.planner-card,
.metadata-card {
  border-color: rgba(60, 140, 227, 0.28) !important;
  background: linear-gradient(180deg, rgba(8, 13, 23, 0.98), rgba(2, 3, 7, 0.98)) !important;
  box-shadow: 0 18px 48px rgba(2, 3, 7, 0.5) !important;
}

.dropzone {
  border-color: rgba(60, 140, 227, 0.46) !important;
  background:
    radial-gradient(circle at 50% 10%, rgba(60, 140, 227, 0.14), transparent 18rem),
    linear-gradient(180deg, rgba(20, 50, 148, 0.2), rgba(8, 13, 23, 0.86)) !important;
}

.dropzone:hover,
.dropzone--active {
  border-color: var(--ai-azure) !important;
  background:
    radial-gradient(circle at 50% 8%, rgba(60, 140, 227, 0.24), transparent 18rem),
    linear-gradient(180deg, rgba(20, 50, 148, 0.32), rgba(8, 13, 23, 0.9)) !important;
}

.primary,
.dropzone__actions .primary {
  color: var(--ai-white) !important;
  border-color: rgba(127, 171, 220, 0.36) !important;
  background: linear-gradient(180deg, #3C8CE3 0%, #143294 100%) !important;
  box-shadow: 0 12px 30px rgba(20, 50, 148, 0.46) !important;
}

.primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.ai-lab-stage-strip span {
  color: var(--ai-silver) !important;
  border-color: rgba(127, 171, 220, 0.24) !important;
  background: rgba(8, 13, 23, 0.9) !important;
}

.ai-lab-stage-strip span:first-child,
body.ai-lab--pdf-ready .ai-lab-stage-strip span:nth-child(2) {
  color: var(--ai-white) !important;
  border-color: rgba(60, 140, 227, 0.7) !important;
  background: linear-gradient(180deg, rgba(60, 140, 227, 0.28), rgba(20, 50, 148, 0.5)) !important;
  box-shadow: 0 8px 22px rgba(20, 50, 148, 0.26) !important;
}

body.ai-lab--pdf-ready .ai-lab-stage-strip span:first-child {
  color: var(--ai-ice) !important;
  border-color: rgba(127, 171, 220, 0.46) !important;
  background: rgba(31, 38, 57, 0.78) !important;
  box-shadow: none !important;
}

.planner-card::before {
  background: linear-gradient(180deg, #3C8CE3 0%, #143294 100%) !important;
  color: var(--ai-white) !important;
}
`;

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectCssFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const cssFiles = await collectCssFiles(OUTPUT_DIR);
let applied = 0;

for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(MARKER)) {
    continue;
  }

  await writeFile(file, `${source}${PALETTE_CSS}`, "utf8");
  applied += 1;
}

if (applied === 0) {
  throw new Error("AI Lab palette failed: competition popup stylesheet was not found");
}

console.log("AI Lab sampled reference palette applied: styles=" + applied);
