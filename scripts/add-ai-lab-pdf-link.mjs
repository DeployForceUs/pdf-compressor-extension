import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-pdf-link.js");
const CSS_MARKER = "Phase 12.2 AI Lab PDF link input";

const LINK_CSS = `

/* ${CSS_MARKER} */
.ai-lab-pdf-link {
  width: 100%;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(127, 171, 220, 0.2);
  box-sizing: border-box;
}

.ai-lab-pdf-link__label {
  display: block;
  margin-bottom: 7px;
  color: var(--ai-silver, #B9BBBC);
  font-size: 11px;
  font-weight: 700;
}

.ai-lab-pdf-link__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  gap: 8px;
}

.ai-lab-pdf-link__input {
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(127, 171, 220, 0.28);
  border-radius: 11px;
  background: rgba(8, 13, 23, 0.86);
  color: var(--ai-white, #F8F9F9);
  font: inherit;
  font-size: 11px;
  outline: none;
}

.ai-lab-pdf-link__input:focus {
  border-color: var(--ai-azure, #3C8CE3);
  box-shadow: 0 0 0 2px rgba(60, 140, 227, 0.15);
}

.ai-lab-pdf-link__button {
  height: 40px;
  padding: 0 10px !important;
  border-radius: 11px !important;
  font-size: 11px !important;
}

.ai-lab-pdf-link__button:disabled {
  opacity: 0.42 !important;
  cursor: not-allowed !important;
  box-shadow: none !important;
}

.ai-lab-pdf-link__note,
.ai-lab-pdf-link__error {
  margin: 7px 0 0;
  font-size: 10px;
  line-height: 1.3;
  text-align: left;
}

.ai-lab-pdf-link__note {
  color: var(--ai-silver, #B9BBBC);
}

.ai-lab-pdf-link__error {
  color: #fda4af;
}

body.ai-lab-session-upload .dropzone {
  min-height: 290px !important;
  height: 290px !important;
  padding-top: 18px !important;
  padding-bottom: 18px !important;
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

const runtime = `(() => {
  function isValidHttpUrl(value) {
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function normalizeGoogleDriveUrl(value) {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drive.google.com" && hostname !== "www.drive.google.com") return url.href;

    const fileMatch = url.pathname.match(/^\\/file\\/d\\/([^/]+)/i);
    const fileId = fileMatch?.[1] || url.searchParams.get("id");
    if (!fileId) return url.href;

    const downloadUrl = new URL("https://drive.google.com/uc");
    downloadUrl.searchParams.set("export", "download");
    downloadUrl.searchParams.set("id", fileId);
    return downloadUrl.href;
  }

  function fileNameFromUrl(value) {
    try {
      const url = new URL(value);
      const candidate = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "linked-document.pdf");
      return candidate.toLowerCase().endsWith(".pdf") ? candidate : candidate + ".pdf";
    } catch {
      return "linked-document.pdf";
    }
  }

  async function requestOriginPermission(url) {
    const permissions = globalThis.chrome?.permissions;
    if (!permissions?.request) return true;
    const origin = new URL(url).origin + "/*";
    return await permissions.request({ origins: [origin] });
  }

  async function loadPdfFromLink(urlValue, input, button, error) {
    const originalUrl = urlValue.trim();
    const url = normalizeGoogleDriveUrl(originalUrl);
    error.textContent = "";
    button.disabled = true;
    button.textContent = "Loading…";

    try {
      const granted = await requestOriginPermission(url);
      if (!granted) throw new Error("Permission to access this link was not granted.");

      const response = await fetch(url, { redirect: "follow", credentials: "omit" });
      if (!response.ok) throw new Error("This link could not be loaded.");

      const bytes = new Uint8Array(await response.arrayBuffer());
      const signature = new TextDecoder().decode(bytes.slice(0, 5));
      if (signature !== "%PDF-") {
        const isGoogleDrive = new URL(originalUrl).hostname.toLowerCase().includes("drive.google.com");
        throw new Error(isGoogleDrive
          ? "Google Drive did not return the PDF. Make sure the file is shared with anyone who has the link."
          : "This link did not return a valid PDF.");
      }

      const file = new File([bytes], fileNameFromUrl(response.url || originalUrl), { type: "application/pdf" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : "This link could not be loaded.";
      button.textContent = "Load PDF";
      button.disabled = !isValidHttpUrl(urlValue);
    }
  }

  function install() {
    const dropzone = document.querySelector(".dropzone");
    if (dropzone?.querySelector(".ai-lab-pdf-link")) return;
    const fileInput = dropzone?.querySelector('input[type="file"]');
    const actions = dropzone?.querySelector(".dropzone__actions");
    if (!dropzone || !fileInput || !actions) return;

    const section = document.createElement("div");
    section.className = "ai-lab-pdf-link";
    section.innerHTML = [
      '<label class="ai-lab-pdf-link__label" for="ai-lab-pdf-link-input">PDF link</label>',
      '<div class="ai-lab-pdf-link__row">',
      '<input id="ai-lab-pdf-link-input" class="ai-lab-pdf-link__input" type="url" inputmode="url" placeholder="https://example.com/file.pdf" autocomplete="off" spellcheck="false">',
      '<button type="button" class="primary ai-lab-pdf-link__button" disabled>Load PDF</button>',
      '</div>',
      '<p class="ai-lab-pdf-link__note">Downloaded locally. Nothing is uploaded.</p>',
      '<p class="ai-lab-pdf-link__error" role="alert" aria-live="polite"></p>',
    ].join("");
    actions.insertAdjacentElement("afterend", section);

    const linkInput = section.querySelector(".ai-lab-pdf-link__input");
    const loadButton = section.querySelector(".ai-lab-pdf-link__button");
    const error = section.querySelector(".ai-lab-pdf-link__error");

    const sync = () => {
      error.textContent = "";
      loadButton.disabled = !isValidHttpUrl(linkInput.value);
    };

    linkInput.addEventListener("input", sync);
    linkInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || loadButton.disabled) return;
      event.preventDefault();
      void loadPdfFromLink(linkInput.value, fileInput, loadButton, error);
    });
    loadButton.addEventListener("click", () => void loadPdfFromLink(linkInput.value, fileInput, loadButton, error));
  }

  install();
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

await writeFile(RUNTIME_PATH, runtime, "utf8");

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
popupHtml = popupHtml.replace(/<script\b[^>]*\bsrc=["']\/ai-lab-pdf-link\.js["'][^>]*><\/script>/gi, "");
popupHtml = popupHtml.replace("</body>", '<script src="/ai-lab-pdf-link.js"></script></body>');
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

const cssFiles = await collectCssFiles(OUTPUT_DIR);
let applied = 0;
for (const file of cssFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("Phase 12.2 competition-only shell") || source.includes(CSS_MARKER)) continue;
  await writeFile(file, source + LINK_CSS, "utf8");
  applied += 1;
}

if (applied === 0) throw new Error("AI Lab PDF link styles were not applied");
console.log(`AI Lab PDF link applied: styles=${applied}`);
