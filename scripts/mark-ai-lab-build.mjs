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

/* Legacy commercial/setup panels stay mounted for now, but are invisible in AI Lab. */
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
  content: "COMPETITION AI LAB";
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

@media (max-width: 720px) {
  .hero {
    align-items: flex-start;
  }
}
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

console.log(
  `AI Lab competition shell applied: ${replacements
    .map(({ label }) => `${label}=${replacementCounts.get(label)}`)
    .join(", ")}, styles=${shellStylesApplied}`,
);
