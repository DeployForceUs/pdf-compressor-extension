import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const ROUTER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");

let runtime = await readFile(ROUTER_RUNTIME_PATH, "utf8");

const functionAnchor = `  async function confirmExecution(button) {`;
const helpers = `  function removeOfficeConnectionFallback(button) {
    button.parentElement?.querySelector(".ai-lab-office-fallback")?.remove();
  }

  function openOfficeEngineSetup(button) {
    const candidates = [...document.querySelectorAll("button, a, [role=button]")];
    const target = candidates.find((candidate) => {
      if (candidate.closest(".ai-lab-office-fallback")) return false;
      const label = (candidate.textContent || "").trim().toLowerCase();
      return label.includes("office engine") || label.includes("connect engine");
    });
    if (target instanceof HTMLElement) {
      target.click();
      emit({ status: "office_setup_opened" });
      return;
    }
    setStatus(button, "Open the Office Engine section, connect the server, then press Retry Office Engine.", "alert");
    emit({ status: "office_setup_not_found" });
  }

  async function startLocalFallback(button, preset) {
    if (active) return;
    removeOfficeConnectionFallback(button);
    completedResult = null;
    active = true;
    activeButton = button;
    activeRoute = "local";
    activePreset = preset;
    button.dataset.aiOriginalLabel ||= button.textContent || "Process PDF";
    button.dataset.aiAction = "process";
    button.disabled = true;
    button.textContent = "Starting local processing…";
    setStatus(button, "Starting local processing instead…");
    emit({ status: "fallback_starting", route: "local", preset, reason: "office_not_connected" });

    try {
      const response = await runtimeSendMessage(requestFor("local", preset));
      if (response && response.ok === false) {
        throw new Error(response.error || response.code || "local_fallback_rejected");
      }
      emit({ status: "fallback_started", route: "local", preset, response: response ?? null });
      if (response?.result) {
        renderComplete(response.result);
      } else if (activeButton) {
        activeButton.textContent = "Processing locally…";
        setStatus(activeButton, "Processing started locally…");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "local_fallback_failed";
      renderLifecycleError(message, "LOCAL_FALLBACK_FAILED");
    }
  }

  function renderOfficeConnectionRequired(button, preset) {
    removeOfficeConnectionFallback(button);
    button.disabled = false;
    button.dataset.aiAction = "process";
    button.textContent = "Retry Office Engine";

    const panel = document.createElement("div");
    panel.className = "ai-lab-office-fallback";

    const message = document.createElement("p");
    message.textContent = "Office Engine is recommended for this PDF, but no Engine is connected.";

    const actions = document.createElement("div");
    actions.className = "ai-lab-office-fallback__actions";

    const connect = document.createElement("button");
    connect.type = "button";
    connect.className = "ai-lab-office-fallback__connect";
    connect.textContent = "Open Office Engine setup";
    connect.addEventListener("click", () => openOfficeEngineSetup(button));

    const local = document.createElement("button");
    local.type = "button";
    local.className = "ai-lab-office-fallback__local";
    local.textContent = "Process locally instead";
    local.addEventListener("click", () => void startLocalFallback(button, preset));

    actions.append(connect, local);
    panel.append(message, actions);
    button.insertAdjacentElement("afterend", panel);
    setStatus(button, "Connect Office Engine and retry, or explicitly continue on this device.", "alert");
    emit({ status: "office_connection_required", route: "office_current", preset });
  }

`;

if (!runtime.includes(functionAnchor)) {
  throw new Error("AI Lab Office fallback function anchor not found");
}
if (!runtime.includes("function renderOfficeConnectionRequired")) {
  runtime = runtime.replace(functionAnchor, `${helpers}${functionAnchor}`);
}

const primaryResponseAnchor = `      const response = await runtimeSendMessage(requestFor(route, preset));
      if (response && response.ok === false) {`;
const primaryResponseReplacement = `      const response = await runtimeSendMessage(requestFor(route, preset));
      if (response && response.ok === false) {
        // AI_LAB_OFFICE_CONNECTION_PRIMARY_BOUNDARY
        if (route === "office_current" && /office engine is not connected/i.test(response.error || "")) {
          const button = activeButton;
          const deniedPreset = activePreset;
          resetActive();
          if (button) renderOfficeConnectionRequired(button, deniedPreset || preset);
          return;
        }`;

if (!runtime.includes("AI_LAB_OFFICE_CONNECTION_PRIMARY_BOUNDARY")) {
  if (!runtime.includes(primaryResponseAnchor)) {
    throw new Error("AI Lab primary Office fallback response anchor not found");
  }
  runtime = runtime.replace(primaryResponseAnchor, primaryResponseReplacement);
}

await writeFile(ROUTER_RUNTIME_PATH, runtime, "utf8");

const style = `<style data-ai-lab-office-fallback>
.ai-lab-office-fallback{display:grid;gap:10px;margin-top:10px;padding:12px;border:1px solid rgba(117,169,255,.38);border-radius:12px;background:rgba(29,57,99,.25)}
.ai-lab-office-fallback p{margin:0;line-height:1.45}
.ai-lab-office-fallback__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ai-lab-office-fallback button{border-radius:10px;padding:10px 12px;font-weight:750;cursor:pointer}
.ai-lab-office-fallback__connect{border:0;color:#07111f;background:#75a9ff}
.ai-lab-office-fallback__local{border:1px solid rgba(255,255,255,.22);color:inherit;background:transparent}
</style>`;
let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
if (!popupHtml.includes("data-ai-lab-office-fallback")) {
  popupHtml = popupHtml.replace("</head>", `${style}</head>`);
  await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");
}

process.stdout.write("AI Lab Office connection fallback applied\n");
