import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(".output/chrome-mv3-ai-lab");
const POPUP_HTML_PATH = path.join(OUTPUT_DIR, "popup.html");
const RUNTIME_PATH = path.join(OUTPUT_DIR, "ai-lab-orchestrator-debug.js");
const SCRIPT_NAME = "ai-lab-orchestrator-debug.js";

const runtime = `(() => {
  const EVENT_NAME = "ai-lab:orchestration-debug";
  const PROFILE_EVENT_NAME = "ai-lab:document-profile-ready";
  const SMART_PLANNER_PREPARE = "background:smart-planner-prepare";
  const DEFAULT_OFFICE_URL = "http://127.0.0.1:8787";
  const CAPACITY_CATALOG = [
    { id: "small", cpuCores: 2, memoryMb: 4096, label: "2 vCPU · 4 GB RAM" },
    { id: "medium", cpuCores: 4, memoryMb: 8192, label: "4 vCPU · 8 GB RAM" },
    { id: "large", cpuCores: 8, memoryMb: 16384, label: "8 vCPU · 16 GB RAM" },
  ];

  function normalizeGoal(goal, option, customText) {
    if (goal === "email") return { kind: "email", targetSizeMb: Number(option.split(":")[1]) };
    if (goal === "portal") return { kind: "portal", targetSizeMb: Number(option.split(":")[1]) };
    if (goal === "print") return { kind: "print", quality: option === "print:high" ? "high" : "standard" };
    if (goal === "archive") return { kind: "archive", preference: option === "archive:quality" ? "preserve_quality" : "smaller_file" };
    if (goal === "reduce") {
      const mode = option.split(":")[1];
      return { kind: "reduce_size", compressionIntent: mode === "maximum" ? "maximum" : mode === "light" ? "light" : "balanced" };
    }
    return { kind: "custom", requirement: customText.trim() };
  }

  function collectLocalCapabilities() {
    const nav = navigator;
    return {
      available: typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function",
      logicalCores: Number.isFinite(nav.hardwareConcurrency) && nav.hardwareConcurrency > 0 ? Math.round(nav.hardwareConcurrency) : undefined,
      memoryClassGb: Number.isFinite(nav.deviceMemory) && nav.deviceMemory > 0 ? nav.deviceMemory : undefined,
      wasmSupported: typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function",
      browserPlatform: nav.platform || undefined,
      benchmark: { status: "missing" },
    };
  }

  async function collectOfficeCapabilities() {
    const configured = localStorage.getItem("ai-lab-office-engine-url") || DEFAULT_OFFICE_URL;
    const baseUrl = configured.replace(/\\\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(baseUrl + "/api/v1/capabilities", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        return { availability: "unavailable", presets: [], unavailableReason: "http_" + response.status };
      }
      const value = await response.json();
      return {
        availability: value.availability === "ready" || value.availability === "busy" ? value.availability : "unavailable",
        cpuCores: value.cpuCores,
        memoryMb: value.memoryMb,
        engineMemoryLimitMb: value.engineMemoryLimitMb,
        queueDepth: value.queueDepth,
        maxConcurrentJobs: value.maxConcurrentJobs,
        ghostscriptVersion: value.ghostscriptVersion,
        maxFileSizeMb: value.maxFileSizeMb,
        presets: Array.isArray(value.presets) ? value.presets : [],
        benchmark: value.benchmark,
        unavailableReason: value.unavailableReason,
      };
    } catch (error) {
      return {
        availability: "unavailable",
        presets: [],
        unavailableReason: error && error.name === "AbortError" ? "timeout" : "network_error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function complexitySignals(profile) {
    const signals = [];
    if (profile.pageCount >= 200) signals.push("large_page_count");
    if (profile.fileSizeBytes >= 100 * 1024 * 1024) signals.push("large_file_size");
    if (profile.imageObjectCount >= profile.pageCount * 2) signals.push("image_dense");
    if (profile.scannedPageRatio >= 0.75) signals.push("scan_dominant");
    if (profile.textPageRatio >= 0.75) signals.push("text_dominant");
    if (profile.vectorPageRatio >= 0.5) signals.push("vector_heavy");
    if (profile.estimatedDpiBuckets?.over300 >= 0.5) signals.push("high_dpi_images");
    if (profile.codecCounts?.jpx > 0) signals.push("contains_jpx_images");
    if (profile.pageSizeDistributionBytes?.p90 >= 5 * 1024 * 1024) signals.push("large_page_streams");
    return signals.length > 0 ? signals : ["standard_complexity"];
  }

  function adaptDocumentProfile(profile) {
    if (!profile || typeof profile !== "object") return null;
    const values = [
      profile.pageCount,
      profile.fileSizeBytes,
      profile.imageObjectCount,
      profile.scannedPageRatio,
      profile.textPageRatio,
      profile.vectorPageRatio,
    ];
    if (!values.every(Number.isFinite) || profile.pageCount <= 0 || profile.fileSizeBytes < 0 || profile.imageObjectCount < 0) return null;
    return {
      pageCount: profile.pageCount,
      fileSizeBytes: profile.fileSizeBytes,
      imageObjectCount: profile.imageObjectCount,
      scannedRatio: profile.scannedPageRatio,
      textRatio: profile.textPageRatio,
      vectorRatio: profile.vectorPageRatio,
      complexitySignals: complexitySignals(profile),
    };
  }

  function capturePrepareResponse(response) {
    const preparation = response?.ok && response.preparation?.status !== "blocked" ? response.preparation : null;
    const profile = adaptDocumentProfile(preparation?.request?.documentProfile);
    if (!profile) return;
    globalThis.__AI_LAB_DOCUMENT_PROFILE__ = profile;
    globalThis.dispatchEvent(new CustomEvent(PROFILE_EVENT_NAME, { detail: profile }));
    console.info("[AI Lab] Document profile bridged from Local Analysis", profile);
  }

  function installPrepareResponseBridge() {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.sendMessage !== "function" || runtime.sendMessage.__aiLabProfileBridge === true) return;
    const original = runtime.sendMessage.bind(runtime);

    function wrappedSendMessage(...args) {
      const message = args[0];
      const callbackIndex = args.findIndex((value, index) => index > 0 && typeof value === "function");
      if (message?.type === SMART_PLANNER_PREPARE && callbackIndex >= 0) {
        const originalCallback = args[callbackIndex];
        args[callbackIndex] = (response) => {
          capturePrepareResponse(response);
          originalCallback(response);
        };
      }
      const result = original(...args);
      if (message?.type === SMART_PLANNER_PREPARE && result && typeof result.then === "function") {
        return result.then((response) => {
          capturePrepareResponse(response);
          return response;
        });
      }
      return result;
    }

    wrappedSendMessage.__aiLabProfileBridge = true;
    runtime.sendMessage = wrappedSendMessage;
  }

  function clearDocumentProfile() {
    delete globalThis.__AI_LAB_DOCUMENT_PROFILE__;
    delete globalThis.__AI_LAB_LAST_ORCHESTRATION__;
  }

  function readDocumentProfile() {
    const value = globalThis.__AI_LAB_DOCUMENT_PROFILE__;
    return value && typeof value === "object" ? value : null;
  }

  async function run(userGoal) {
    const collectedAt = new Date().toISOString();
    const [local, office] = await Promise.all([
      Promise.resolve(collectLocalCapabilities()),
      collectOfficeCapabilities(),
    ]);
    const computeSnapshot = {
      local,
      office,
      capacityCatalog: CAPACITY_CATALOG,
      collectedAt,
    };
    const documentProfile = readDocumentProfile();
    const plannerRequest = documentProfile ? {
      schemaVersion: "1",
      documentProfile,
      userGoal,
      localCapabilities: local,
      officeCapabilities: office,
      capacityCatalog: CAPACITY_CATALOG,
    } : null;
    const detail = {
      userGoal,
      computeSnapshot,
      plannerRequest,
      plannerRequestStatus: plannerRequest ? "ready" : "waiting_for_document_profile_adapter",
    };
    console.groupCollapsed("[AI Lab] Compute orchestration debug", userGoal.kind);
    console.log(detail);
    console.groupEnd();
    globalThis.__AI_LAB_LAST_ORCHESTRATION__ = detail;
    globalThis.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  }

  document.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches('.dropzone input[type="file"]')) clearDocumentProfile();
  }, true);
  document.addEventListener("drop", (event) => {
    if (event.target instanceof Element && event.target.closest(".dropzone")) clearDocumentProfile();
  }, true);

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const panel = button?.closest(".ai-lab-goal-panel");
    if (!button || !panel) return;

    const option = button.getAttribute("data-ai-option");
    if (option && option !== "custom-size") {
      const goal = panel.dataset.aiLabActiveGoal || "email";
      void run(normalizeGoal(goal, option, ""));
      return;
    }

    if (button.matches(".ai-lab-custom-size__apply")) {
      const input = panel.querySelector(".ai-lab-custom-size__input");
      const value = Number(input?.value);
      if (Number.isFinite(value) && value > 0) {
        const goal = panel.dataset.aiLabActiveGoal || "email";
        void run(normalizeGoal(goal, "size:" + Math.round(value), ""));
      }
      return;
    }

    if (button.matches(".ai-lab-other-goal__apply")) {
      const input = panel.querySelector(".ai-lab-other-goal__input");
      const value = input?.value?.trim() || "";
      if (value) void run(normalizeGoal("other", "other:text", value));
    }
  }, true);

  installPrepareResponseBridge();
  console.info("[AI Lab] Compute orchestrator debug bridge ready");
})();
`;

const popupHtml = await readFile(POPUP_HTML_PATH, "utf8");
const scriptTag = `<script src="/${SCRIPT_NAME}"></script>`;
const nextHtml = popupHtml.includes(scriptTag)
  ? popupHtml
  : popupHtml.replace("</body>", `${scriptTag}</body>`);

await writeFile(RUNTIME_PATH, runtime, "utf8");
await writeFile(POPUP_HTML_PATH, nextHtml, "utf8");

process.stdout.write("AI Lab compute orchestrator debug bridge applied\n");
