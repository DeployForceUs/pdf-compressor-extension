import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const MARKER = "Phase 12.2 visible PDF link input";
const OVERRIDE = `

/* ${MARKER} */
body.ai-lab-session-upload .dropzone .ai-lab-pdf-link__input {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 40px !important;
  opacity: 1 !important;
  visibility: visible !important;
  position: static !important;
  pointer-events: auto !important;
}

body.ai-lab-session-upload .ai-lab-pdf-link__row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 104px !important;
  align-items: center !important;
  gap: 8px !important;
  width: 100% !important;
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

const cssFiles = await collectCssFiles(OUTPUT_DIR);
let applied = 0;
for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 AI Lab PDF link input") || source.includes(MARKER)) continue;
  await writeFile(file, source + OVERRIDE, "utf8");
  applied += 1;
}

if (applied === 0) throw new Error("AI Lab PDF link visibility override was not applied");
console.log(`AI Lab PDF link input visible: styles=${applied}`);
