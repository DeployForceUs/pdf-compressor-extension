import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const STYLE_MARKER = "ai-lab-download-action-style";

const style = `<style id="${STYLE_MARKER}">
  .ai-lab-process-button[data-ai-action="download"] {
    background: #50b070 !important;
    border-color: #50b070 !important;
    color: #ffffff !important;
    box-shadow: 0 10px 24px rgba(80, 176, 112, 0.24) !important;
  }

  .ai-lab-process-button[data-ai-action="download"]:hover:not(:disabled) {
    background: #45a064 !important;
    border-color: #45a064 !important;
  }

  .ai-lab-process-button[data-ai-action="download"]:focus-visible {
    outline: 3px solid rgba(80, 176, 112, 0.34) !important;
    outline-offset: 2px;
  }
</style>`;

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
if (!popupHtml.includes(`id="${STYLE_MARKER}"`)) {
  popupHtml = popupHtml.replace("</head>", `${style}</head>`);
}
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

process.stdout.write("AI Lab download action styled\n");
