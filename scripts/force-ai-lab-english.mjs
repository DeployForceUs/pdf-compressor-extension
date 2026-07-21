import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const CSS_MARKER = "Phase 12.2 AI Lab English-only competition build";
const RUNTIME_MARKER = "Phase 12.2 AI Lab English-only runtime";
const LANGUAGE_CSS = `

/* ${CSS_MARKER} */
.language-switcher {
  display: none !important;
}

.hero__tools {
  display: block !important;
}

.hero__build {
  width: fit-content !important;
  max-width: 100% !important;
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

const popupHtmlPath = path.join(OUTPUT_DIR, "popup.html");
const popupHtml = await readFile(popupHtmlPath, "utf8");
const inlineLanguageBootstrap = '<script>localStorage.setItem("i18nextLng","en");document.documentElement.lang="en";</script>';
const cleanedPopupHtml = popupHtml.replace(inlineLanguageBootstrap, "");

if (cleanedPopupHtml !== popupHtml) {
  await writeFile(popupHtmlPath, cleanedPopupHtml, "utf8");
}

const runtimePath = path.join(OUTPUT_DIR, "ai-lab-runtime.js");
const runtimeSource = await readFile(runtimePath, "utf8");

if (!runtimeSource.includes(RUNTIME_MARKER)) {
  const runtimeBootstrap = `\n/* ${RUNTIME_MARKER} */\nlocalStorage.setItem("i18nextLng", "en");\ndocument.documentElement.lang = "en";\n`;
  await writeFile(runtimePath, `${runtimeBootstrap}${runtimeSource}`, "utf8");
}

const cssFiles = await collectCssFiles(OUTPUT_DIR);
let applied = 0;

for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(CSS_MARKER)) {
    continue;
  }

  await writeFile(file, `${source}${LANGUAGE_CSS}`, "utf8");
  applied += 1;
}

if (applied === 0) {
  throw new Error("AI Lab English-only patch failed: competition popup stylesheet was not found");
}

const finalPopupHtml = await readFile(popupHtmlPath, "utf8");
if (finalPopupHtml.includes("<script>")) {
  throw new Error("AI Lab English-only patch failed: inline script remains in popup.html");
}

console.log(`AI Lab English-only mode applied without inline scripts: styles=${applied}, language=en`);
