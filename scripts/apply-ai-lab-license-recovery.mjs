import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const ROUTER_RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-execution-router.js");

let runtime = await readFile(ROUTER_RUNTIME_PATH, "utf8");

const functionAnchor = `  async function confirmExecution(button) {`;
const licenseHelpers = `  function removeLicenseRecovery(button) {
    button.parentElement?.querySelector(".ai-lab-license-recovery")?.remove();
  }

  function renderLicenseRequired(button, response) {
    removeLicenseRecovery(button);
    button.disabled = true;
    button.dataset.aiAction = "license-required";
    button.textContent = "Activate Pro to continue";

    const panel = document.createElement("div");
    panel.className = "ai-lab-license-recovery";

    const title = document.createElement("strong");
    title.textContent = "Pro activation required";

    const explanation = document.createElement("p");
    explanation.textContent = response?.code === "FREE_DAILY_LIMIT_REACHED"
      ? "The Free daily limit has been reached. Activate your existing Pro license in this AI Lab profile, then continue with the same recommendation."
      : "This operation requires an active Pro license in this AI Lab profile.";

    const token = document.createElement("textarea");
    token.rows = 3;
    token.placeholder = "Paste your signed Pro license token";
    token.autocomplete = "off";
    token.spellcheck = false;
    token.setAttribute("aria-label", "Pro license token");

    const activate = document.createElement("button");
    activate.type = "button";
    activate.className = "ai-lab-license-recovery__activate";
    activate.textContent = "Activate Pro";

    const message = document.createElement("p");
    message.className = "ai-lab-license-recovery__message";
    message.setAttribute("role", "status");

    activate.addEventListener("click", async () => {
      const value = token.value.trim();
      if (!value) {
        message.setAttribute("role", "alert");
        message.textContent = "Paste the signed license token first.";
        token.focus();
        return;
      }

      activate.disabled = true;
      token.disabled = true;
      activate.textContent = "Activating…";
      message.setAttribute("role", "status");
      message.textContent = "Verifying the license locally…";

      try {
        const result = await runtimeSendMessage({ type: "license:activate", token: value });
        token.value = "";
        if (!result?.ok || !result?.isPro) {
          throw new Error("The license token is invalid.");
        }

        removeLicenseRecovery(button);
        button.disabled = false;
        button.dataset.aiAction = "process";
        button.textContent = button.dataset.aiOriginalLabel || "Process PDF";
        setStatus(button, "Pro is active in this AI Lab profile. Press the button again to start processing.");
        emit({ status: "license_activated", licenseId: result.licenseId || null });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "License activation failed.";
        activate.disabled = false;
        token.disabled = false;
        activate.textContent = "Try activation again";
        message.setAttribute("role", "alert");
        message.textContent = errorMessage;
        token.focus();
        emit({ status: "license_activation_error", error: errorMessage });
      }
    });

    panel.append(title, explanation, token, activate, message);
    button.insertAdjacentElement("afterend", panel);
    setStatus(button, "Activate Pro below to continue. Your license is verified locally.", "alert");
  }

`;

if (!runtime.includes(functionAnchor)) {
  throw new Error("AI Lab license recovery function anchor not found");
}
if (!runtime.includes("function renderLicenseRequired")) {
  runtime = runtime.replace(functionAnchor, `${licenseHelpers}${functionAnchor}`);
}

const rejectionBoundary = `      if (response && response.ok === false) {
        throw new Error(response.error || response.code || "execution_start_rejected");
      }`;
const recoveryBoundary = `      if (response && response.ok === false) {
        if (response.code === "FREE_DAILY_LIMIT_REACHED" || response.code === "PRO_REQUIRED") {
          const button = activeButton;
          const deniedRoute = activeRoute;
          const deniedPreset = activePreset;
          resetActive();
          if (button) renderLicenseRequired(button, response);
          emit({ status: "license_required", route: deniedRoute, preset: deniedPreset, code: response.code });
          return;
        }
        throw new Error(response.error || response.code || "execution_start_rejected");
      }`;

if (!runtime.includes(recoveryBoundary)) {
  if (!runtime.includes(rejectionBoundary)) {
    throw new Error("AI Lab license recovery response boundary not found");
  }
  runtime = runtime.replace(rejectionBoundary, recoveryBoundary);
}

await writeFile(ROUTER_RUNTIME_PATH, runtime, "utf8");

const style = `<style data-ai-lab-license-recovery>
.ai-lab-license-recovery{display:grid;gap:9px;margin-top:10px;padding:12px;border:1px solid rgba(80,176,112,.45);border-radius:12px;background:rgba(25,74,42,.24)}
.ai-lab-license-recovery strong{color:#8ee6aa;font-size:13px}
.ai-lab-license-recovery p{margin:0;line-height:1.4}
.ai-lab-license-recovery textarea{width:100%;box-sizing:border-box;resize:vertical;padding:9px 10px;border:1px solid rgba(142,230,170,.32);border-radius:9px;color:inherit;background:rgba(7,15,11,.7);font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace}
.ai-lab-license-recovery__activate{border:0;border-radius:10px;padding:10px 12px;color:#07150c;background:#50b070;font-weight:800;cursor:pointer}
.ai-lab-license-recovery__activate:disabled{cursor:wait;opacity:.7}
.ai-lab-license-recovery__message[role="alert"]{color:#ffb8c2}
</style>`;
let popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
if (!popupHtml.includes("data-ai-lab-license-recovery")) {
  popupHtml = popupHtml.replace("</head>", `${style}</head>`);
  await writeFile(POPUP_HTML_PATH, popupHtml, "utf8");
}

process.stdout.write("AI Lab Pro activation recovery applied\n");
