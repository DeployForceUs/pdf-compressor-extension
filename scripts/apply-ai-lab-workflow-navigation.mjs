import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const CSS_MARKER = "Phase 12.2 React-owned workflow navigation";

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

body.ai-lab-session-analysis .planner-card__capability,
body.ai-lab-session-analysis .planner-card > .planner-card__note {
  display: none !important;
}

body.ai-lab-session-analysis .planner-card__analysis-progress,
body.ai-lab-session-analysis .planner-card__analysis-result {
  min-height: 0 !important;
  gap: 8px !important;
}

body.ai-lab-session-analysis .planner-card__analysis-result > strong:first-child {
  font-size: 16px !important;
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
  display: none;
  min-height: 330px;
  max-height: 330px;
  padding: 22px;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(8, 13, 23, 0.98), rgba(2, 3, 7, 0.98));
  color: var(--ai-white);
}

body.ai-lab-session-goal .ai-lab-goal-panel {
  display: flex !important;
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
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(CSS_MARKER)) continue;
  await writeFile(file, `${source}${WORKFLOW_CSS}`, "utf8");
  applied += 1;
}

if (applied === 0) {
  throw new Error("AI Lab React workflow styles were not applied");
}

console.log(`AI Lab React workflow styles applied: styles=${applied}`);
