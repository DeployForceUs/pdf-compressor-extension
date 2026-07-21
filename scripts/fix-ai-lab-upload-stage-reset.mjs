import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-upload-stage-reset.js");
const MARKER = "AI Lab upload stage hard reset";

const runtime = `(() => {
  const marker = "${MARKER}";

  function bindUploadStage() {
    const stage = document.querySelector(".ai-lab-stage-strip span:first-child");
    if (!(stage instanceof HTMLElement) || stage.dataset.aiLabUploadResetBound === "1") return;

    stage.dataset.aiLabUploadResetBound = "1";
    stage.addEventListener("click", (event) => {
      if (document.body.classList.contains("ai-lab-session-upload")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.reload();
    }, true);
  }

  bindUploadStage();
  const observer = new MutationObserver(bindUploadStage);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  console.debug(marker);
})();
`;

await writeFile(RUNTIME_PATH, runtime, "utf8");

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
popupHtml = popupHtml.replace(/<script\b[^>]*\bsrc=["']\/ai-lab-upload-stage-reset\.js["'][^>]*><\/script>/gi, "");
popupHtml = popupHtml.replace("</body>", '<script src="/ai-lab-upload-stage-reset.js"></script></body>');
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

const verifiedRuntime = await readFile(RUNTIME_PATH, "utf8");
const verifiedHtml = await readFile(POPUP_HTML_PATH, "utf8");
for (const required of [MARKER, "stopImmediatePropagation", "window.location.reload()"] ) {
  if (!verifiedRuntime.includes(required)) {
    throw new Error(`AI Lab upload reset verification failed: missing ${required}`);
  }
}
if (!verifiedHtml.includes('/ai-lab-upload-stage-reset.js')) {
  throw new Error("AI Lab upload reset verification failed: runtime was not installed");
}

console.log("AI Lab upload stage reset verified");
