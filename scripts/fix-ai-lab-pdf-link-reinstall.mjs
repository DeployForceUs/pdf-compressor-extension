import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtimePath = path.resolve(".output/chrome-mv3-ai-lab/ai-lab-pdf-link.js");
let source = await readFile(runtimePath, "utf8");

const oldGuard = '    if (document.body.classList.contains(MARKER)) return;\n    const dropzone = document.querySelector(".dropzone");';
const currentGuard = '    const dropzone = document.querySelector(".dropzone");\n    if (dropzone?.querySelector(".ai-lab-pdf-link")) return;';

if (source.includes(oldGuard)) {
  source = source.replace(oldGuard, currentGuard);
  source = source.replace('    document.body.classList.add(MARKER);\n', "");
  await writeFile(runtimePath, source, "utf8");
} else if (!source.includes(currentGuard)) {
  throw new Error("AI Lab PDF link reinstall fix failed: neither legacy nor current install guard was found");
}

const verified = await readFile(runtimePath, "utf8");
if (!verified.includes(currentGuard)) {
  throw new Error("AI Lab PDF link reinstall fix failed: current dropzone guard was not applied");
}

console.log("AI Lab PDF link reinstall guard verified");
