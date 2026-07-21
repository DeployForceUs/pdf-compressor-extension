import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const BOOTSTRAP_PATH = path.join(OUTPUT_DIR, "ai-lab-bootstrap.js");
const STALE_WORKFLOW_PATH = path.join(OUTPUT_DIR, "ai-lab-workflow.js");
const MARKER = "Phase 12.2 AI Lab clean-session bootstrap";

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");

// Older post-build iterations injected this runtime. Remove both the tag and
// the generated file so Chrome cannot execute stale workflow logic.
popupHtml = popupHtml.replace(
  /<script\b[^>]*\bsrc=["']\/ai-lab-workflow\.js["'][^>]*><\/script>/gi,
  "",
);
await unlink(STALE_WORKFLOW_PATH).catch(() => undefined);

const moduleScriptPattern = /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/i;
const moduleMatch = popupHtml.match(moduleScriptPattern);

if (!moduleMatch) {
  throw new Error("AI Lab clean-session bootstrap failed: popup module script was not found");
}

const moduleSrc = moduleMatch[1];
const bootstrap = `/* ${MARKER} */
(() => {
  const DB_NAME = "pdf-compressor-phase1";
  const DB_VERSION = 2;
  const STORE_NAME = "binary-records";
  const SELECTED_PDF_RECORD_ID = "selected-pdf";
  const MODULE_SRC = ${JSON.stringify(moduleSrc)};

  function startPopup() {
    const script = document.createElement("script");
    script.type = "module";
    script.src = MODULE_SRC;
    document.head.append(script);
  }

  function clearSelectedPdf() {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve();
      request.onupgradeneeded = () => {
        // A new database has no selected PDF to remove.
      };
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.close();
          resolve();
          return;
        }

        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(SELECTED_PDF_RECORD_ID);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          database.close();
          resolve();
        };
        transaction.onabort = () => {
          database.close();
          resolve();
        };
      };
    });
  }

  void clearSelectedPdf().finally(startPopup);
})();
`;

await writeFile(BOOTSTRAP_PATH, bootstrap, "utf8");
popupHtml = popupHtml.replace(
  moduleScriptPattern,
  '<script src="/ai-lab-bootstrap.js"></script>',
);
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

const verifiedHtml = await readFile(POPUP_HTML_PATH, "utf8");
if (!verifiedHtml.includes("/ai-lab-bootstrap.js")) {
  throw new Error("AI Lab clean-session bootstrap failed: bootstrap was not injected");
}
if (verifiedHtml.includes("/ai-lab-workflow.js")) {
  throw new Error("AI Lab clean-session bootstrap failed: stale workflow runtime remains");
}

console.log(`AI Lab clean session applied: selected-pdf reset, stale runtime removed, module=${moduleSrc}`);
