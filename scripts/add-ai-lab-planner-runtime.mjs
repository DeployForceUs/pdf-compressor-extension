import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-planner-runtime.js");
const SCRIPT_NAME = "ai-lab-planner-runtime.js";

const runtime = `(() => {
  const ORCHESTRATION_EVENT = "ai-lab:orchestration-debug";
  const PLANNER_RESULT_EVENT = "ai-lab:planner-result";
  const DEFAULT_PLANNER_URL = "http://127.0.0.1:8791";
  let requestSequence = 0;

  function plannerBaseUrl() {
    const configured = localStorage.getItem("ai-lab-planner-url") || DEFAULT_PLANNER_URL;
    return configured.replace(/\\\/$/, "");
  }

  function publish(orchestration, plannerResult, plannerResultStatus) {
    const detail = {
      ...orchestration,
      plannerResult,
      plannerResultStatus,
    };
    globalThis.__AI_LAB_LAST_ORCHESTRATION__ = detail;
    globalThis.__AI_LAB_LAST_PLANNER_RESULT__ = plannerResult;
    globalThis.dispatchEvent(new CustomEvent(PLANNER_RESULT_EVENT, { detail }));
    console.groupCollapsed("[AI Lab] Planner debug result", plannerResultStatus);
    console.log(detail);
    console.groupEnd();
  }

  async function requestPlan(orchestration) {
    if (!orchestration?.plannerRequest || orchestration.plannerRequestStatus !== "ready") return;

    const sequence = ++requestSequence;
    publish(orchestration, null, "requesting");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(plannerBaseUrl() + "/api/v1/ai/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(orchestration.plannerRequest),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (sequence !== requestSequence) return;

      if (!response.ok || !payload || typeof payload !== "object") {
        publish(orchestration, {
          status: "fallback",
          source: "runtime",
          error: payload?.error || "planner_http_" + response.status,
          response: null,
        }, "fallback");
        return;
      }

      const status = payload.status === "ready" ? "ready" : "fallback";
      publish(orchestration, payload, status);
    } catch (error) {
      if (sequence !== requestSequence) return;
      publish(orchestration, {
        status: "fallback",
        source: "runtime",
        error: error && error.name === "AbortError" ? "planner_timeout" : "planner_network_error",
        response: null,
      }, "fallback");
    } finally {
      clearTimeout(timer);
    }
  }

  globalThis.addEventListener(ORCHESTRATION_EVENT, (event) => {
    void requestPlan(event.detail);
  });

  console.info("[AI Lab] Planner runtime bridge ready");
})();
`;

const popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
const scriptTag = `<script src="/${SCRIPT_NAME}"></script>`;
const nextHtml = popupHtml.includes(scriptTag)
  ? popupHtml
  : popupHtml.replace("</body>", `${scriptTag}</body>`);

await writeFile(RUNTIME_PATH, runtime, "utf8");
await writeFile(POPUP_HTML_PATH, nextHtml, "utf8");

process.stdout.write("AI Lab server planner runtime bridge applied\n");
