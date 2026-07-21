import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");

const replacements = [
  {
    from: "Smart Planner",
    to: "AI LAB · Smart Planner",
    label: "Planner eyebrow",
  },
  {
    from: "Analyze this document",
    to: "AI Orchestrator Preview",
    label: "Planner title",
  },
];

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = await collectJavaScriptFiles(OUTPUT_DIR);
const replacementCounts = new Map(replacements.map(({ label }) => [label, 0]));

for (const file of files) {
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

console.log(
  `AI Lab visual marker applied: ${replacements
    .map(({ label }) => `${label}=${replacementCounts.get(label)}`)
    .join(", ")}`,
);
