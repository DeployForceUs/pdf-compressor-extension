import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const PRESENTER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-recommendation-presenter.js");
const ROUTER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");
const SCRIPT_NAME = "ai-lab-execution-router.js";

let presenterRuntime = await readFile(PRESENTER_RUNTIME_PATH, "utf8");
const disabledBoundary = `    confirm.disabled = true;
    confirm.setAttribute("aria-disabled", "true");`;
const enabledBoundary = `    confirm.disabled = false;
    confirm.removeAttribute("aria-disabled");`;
if (!presenterRuntime.includes(disabledBoundary)) {
  throw new Error("AI Lab pending ExecutionRouter button boundary not found");
}
presenterRuntime = presenterRuntime.replace(disabledBoundary, enabledBoundary);
await writeFile(PRESENTER_RUNTIME_PATH, presenterRuntime, "utf8");

const routerRuntime = `(() => {
  const ROUTER_EVENT = "ai-lab:execution-router-result";
  const ALLOWED_ROUTES = new Set(["local", "office_current"]);
  const PRESET_QUALITY = Object.freeze({ safe: 85, balanced: 75, strong: 60 });
  let active = false;
  let activeButton = null;
  let activeRoute = null;
  let activePreset = null;

  function emit(detail) {
    globalThis.__AI_LAB_LAST_EXECUTION_ROUTER_RESULT__ = detail;
    globalThis.dispatchEvent(new CustomEvent(ROUTER_EVENT, { detail }));
    console.info("[AI Lab] ExecutionRouter", detail.status, detail);
  }

  function runtimeSendMessage(message) {
    return new Promise((resolve, reject) => {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.sendMessage) {
        reject(new Error("extension_runtime_unavailable"));
        return;
      }
      runtime.sendMessage(message, (response) => {
        const runtimeError = runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "runtime_message_failed"));
          return;
        }
        resolve(response);
      });
    });
  }

  function requestFor(route, preset) {
    if (route === "local") {
      return {
        type: "background:compression-start",
        mode: "Balanced",
        quality: PRESET_QUALITY[preset] ?? PRESET_QUALITY.balanced,
      };
    }
    return { type: "background:office-processing-start" };
  }

  function statusElement(button, role = "status") {
    const target = button.parentElement;
    if (!target) return null;
    let status = target.querySelector(".ai-lab-execution-router__status");
    if (!status) {
      status = document.createElement("p");
      status.className = "ai-lab-execution-router__status";
      target.append(status);
    }
    status.setAttribute("role", role);
    return status;
  }

  function setStatus(button, message, role = "status") {
    const status = statusElement(button, role);
    if (status) status.textContent = message;
  }

  function resetActive() {
    active = false;
    activeButton = null;
    activeRoute = null;
    activePreset = null;
  }

  function renderError(button, message) {
    button.disabled = false;
    button.textContent = button.dataset.aiOriginalLabel || "Try again";
    setStatus(button, message, "alert");
  }

  function renderProgress(message, progress) {
    if (!activeButton) return;
    activeButton.disabled = true;
    activeButton.textContent = activeRoute === "office_current" ? "Processing with Office Engine…" : "Processing locally…";
    const suffix = Number.isFinite(progress) ? " " + Math.max(0, Math.min(100, Math.round(progress))) + "%" : "";
    setStatus(activeButton, (message || "Processing…") + suffix);
    emit({ status: "progress", route: activeRoute, preset: activePreset, progress: Number.isFinite(progress) ? progress : null, message: message || null });
  }

  function renderComplete(result) {
    if (!activeButton) return;
    const button = activeButton;
    const route = activeRoute;
    const preset = activePreset;
    button.disabled = true;
    button.textContent = "Processing complete";
    setStatus(button, "Your processed PDF is ready in the existing result section.");
    emit({ status: "complete", route, preset, result: result ?? null });
    resetActive();
  }

  function renderLifecycleError(message, code) {
    if (!activeButton) return;
    const button = activeButton;
    const route = activeRoute;
    const preset = activePreset;
    renderError(button, message || "Processing failed.");
    emit({ status: "error", route, preset, error: message || "processing_failed", code: code || null });
    resetActive();
  }

  async function confirmExecution(button) {
    if (active) return;
    const plannerResult = globalThis.__AI_LAB_LAST_PLANNER_RESULT__;
    const route = button.dataset.aiRecommendedRoute || "";
    const preset = button.dataset.aiRecommendedPreset || "balanced";

    if (plannerResult?.status !== "ready" || plannerResult?.response?.recommendedRoute !== route) {
      renderError(button, "The recommendation is no longer current. Go back and build the plan again.");
      emit({ status: "rejected", error: "planner_result_mismatch", route, preset });
      return;
    }
    if (!ALLOWED_ROUTES.has(route)) {
      renderError(button, "This execution route is not supported.");
      emit({ status: "rejected", error: "unsupported_route", route, preset });
      return;
    }

    active = true;
    activeButton = button;
    activeRoute = route;
    activePreset = preset;
    button.dataset.aiOriginalLabel ||= button.textContent || "Process PDF";
    button.disabled = true;
    button.textContent = route === "office_current" ? "Starting Office Engine…" : "Starting local processing…";
    setStatus(button, "Starting processing…");
    emit({ status: "starting", route, preset });

    try {
      const response = await runtimeSendMessage(requestFor(route, preset));
      if (response && response.ok === false) {
        throw new Error(response.error || response.code || "execution_start_rejected");
      }
      emit({ status: "started", route, preset, response: response ?? null });
      if (route === "local" && response?.result) {
        renderComplete(response.result);
      } else if (activeButton) {
        activeButton.textContent = route === "office_current" ? "Processing with Office Engine…" : "Processing locally…";
        setStatus(activeButton, "Processing started…");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "execution_start_failed";
      renderLifecycleError(message, "START_FAILED");
    }
  }

  const runtime = globalThis.chrome?.runtime;
  runtime?.onMessage?.addListener((message) => {
    if (!active || !message || typeof message !== "object") return;
    const type = message.type;

    if (activeRoute === "local") {
      if (type === "compression:progress") {
        renderProgress(message.message || message.stage || "Processing locally…", message.progress);
      } else if (type === "compression:result") {
        renderComplete(message.result);
      } else if (type === "compression:error") {
        renderLifecycleError(message.message, message.code);
      }
      return;
    }

    if (activeRoute === "office_current") {
      if (type === "office:progress") {
        renderProgress(message.message || "Processing with Office Engine…", message.progress);
      } else if (type === "office:result") {
        renderComplete(message.result);
      } else if (type === "office:error") {
        renderLifecycleError(message.message, message.code);
      }
    }
  });

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".ai-lab-process-button") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    void confirmExecution(button);
  }, true);

  console.info("[AI Lab] ExecutionRouter ready");
})();
`;

await writeFile(ROUTER_RUNTIME_PATH, routerRuntime, "utf8");

let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
const scriptTag = `<script src="/${SCRIPT_NAME}"></script>`;
popupHtml = popupHtml.includes(scriptTag)
  ? popupHtml
  : popupHtml.replace("</body>", `${scriptTag}</body>`);
await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");

process.stdout.write("AI Lab ExecutionRouter applied\n");
