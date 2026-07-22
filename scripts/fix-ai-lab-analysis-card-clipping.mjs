import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const marker = "AI Lab analysis card clipping fix";
const css = `\n/* ${marker} */\nbody.ai-lab--pdf-ready .input-card,\nbody.ai-lab--pdf-ready .planner-card {\n  min-height: 0 !important;\n  max-height: none !important;\n  overflow: visible !important;\n}\nbody.ai-lab--pdf-ready .planner-card {\n  justify-content: flex-start !important;\n}\n`;

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(full);
  }
  return files;
}

let applied = 0;
for (const file of await collect(outputDir)) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(marker)) continue;
  await writeFile(file, `${source}${css}`, "utf8");
  applied += 1;
}

if (applied === 0) throw new Error("AI Lab analysis card clipping fix failed");
console.log("AI Lab analysis card clipping fixed");
