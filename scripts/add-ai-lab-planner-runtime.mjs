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

  function deliveryTargetSizeMb(orchestration, payload) {
    const explicit =
      payload?.response?.processingPlan?.split?.targetPartSizeMb ??
      payload?.response?.split?.targetPartSizeMb;
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const text = [
      orchestration?.userGoal?.deliveryTarget,
      orchestration?.userGoal?.instruction,
      orchestration?.plannerRequest?.userGoal?.deliveryTarget,
      orchestration?.plannerRequest?.userGoal?.instruction,
      payload?.response?.explanation,
    ]
      .filter((value) => typeof value === "string")
      .join(" ");

    const patterns = [
      /(?:portal\\s+target|delivery\\s+limit|target(?:ing)?|maximum|max|under|below|parts?\\s+under)\\D{0,40}(\\d+(?:\\.\\d+)?)\\s*MB\\b/i,
      /(?:compression|compress|reduce|shrink)(?:\\s+the\\s+(?:file|document|pdf))?\\s+(?:to|toward|towards|around|approximately|about)\\s*[~≈]?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i,
      /(?:to|toward|towards|around|approximately|about)\\s*[~≈]?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i,
      /(\\d+(?:\\.\\d+)?)\\s*MB\\b\\D{0,40}(?:portal\\s+target|delivery\\s+limit|target|limit|maximum|max)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function normalizePlannerSplitPlan(orchestration, payload) {
    if (!payload || typeof payload !== "object" || !payload.response || typeof payload.response !== "object") {
      return payload;
    }

    const targetPartSizeMb = deliveryTargetSizeMb(orchestration, payload);
    if (!targetPartSizeMb) return payload;

    const currentPlan = payload.response.processingPlan && typeof payload.response.processingPlan === "object"
      ? payload.response.processingPlan
      : {};
    const currentSplit = currentPlan.split && typeof currentPlan.split === "object"
      ? currentPlan.split
      : payload.response.split && typeof payload.response.split === "object"
        ? payload.response.split
        : {};

    payload.response.processingPlan = {
      ...currentPlan,
      split: {
        ...currentSplit,
        enabled: true,
        strategy: "by-max-size",
        targetPartSizeMb,
        outputMode: "single-zip",
      },
    };
    return payload;
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

      const normalizedPayload = normalizePlannerSplitPlan(orchestration, payload);
      const status = normalizedPayload.status === "ready" ? "ready" : "fallback";
      publish(orchestration, normalizedPayload, status);
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

process.stdout.write("AI Lab server planner runtime bridge applied with split normalization N2\n");
