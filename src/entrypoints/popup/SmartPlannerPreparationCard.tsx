import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import { createSmartPlannerApiClient } from "../../lib/ai/smart-planner-api-client";
import { requestSmartPlannerRecommendationWithClient } from "../../lib/ai/smart-planner-browser-gateway";
import {
  APPROVED_BALANCED_NUMERIC_POLICY,
  type ProcessingPlan,
} from "../../lib/ai/smart-planner-contract";
import { SMART_PLANNER_REQUEST_POLICY } from "../../lib/ai/smart-planner-recommendation";
import {
  SMART_PLANNER_BACKGROUND_PREPARE,
  type SmartPlannerPrepareResponse,
} from "../../lib/ai/smart-planner-runtime-message-contract";
import { readLocalRuntimeCapability, type LocalRuntimeCapability } from "../../lib/local/local-runtime-capability";
import { createOfficeEngineClient } from "../../lib/office/office-engine-client";
import "../../styles/smart-planner-card.css";

type PlannerUiState =
  | { status: "idle" }
  | { status: "analyzing" }
  | {
      status: "ready";
      pageCount: number;
      imageObjectCount: number;
      scannedPercent: number;
      textPercent: number;
      vectorPercent: number;
      plan: ProcessingPlan;
    }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string };

type LocalCapabilityState =
  | { status: "loading" }
  | { status: "ready"; capability: LocalRuntimeCapability }
  | { status: "unavailable" };

type Props = {
  pdfReady: boolean;
  officeAvailable: boolean;
  plannerBaseUrl: string;
  plannerAccessToken: string;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function gigabytes(value: number) {
  return value.toFixed(1);
}

export function SmartPlannerPreparationCard({
  pdfReady,
  officeAvailable,
  plannerBaseUrl,
  plannerAccessToken,
}: Props) {
  const [state, setState] = useState<PlannerUiState>({ status: "idle" });
  const [localCapability, setLocalCapability] = useState<LocalCapabilityState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    void readLocalRuntimeCapability()
      .then((capability) => {
        if (active) setLocalCapability({ status: "ready", capability });
      })
      .catch(() => {
        if (active) setLocalCapability({ status: "unavailable" });
      });

    return () => {
      active = false;
    };
  }, []);

  async function analyze() {
    if (!pdfReady || state.status === "analyzing") return;
    setState({ status: "analyzing" });

    try {
      const baseUrl = plannerBaseUrl.trim();
      const accessToken = plannerAccessToken.trim();
      if (!baseUrl || !accessToken) {
        setState({
          status: "blocked",
          message: "Connect Office Engine before requesting an AI recommendation.",
        });
        return;
      }

      let liveOfficeAvailable = false;
      let officeCpuCount = 0;
      let officeMemoryGb = 0;
      let maxFileSizeMb = 1024;

      if (officeAvailable) {
        const health = await createOfficeEngineClient({ baseUrl, accessToken }).health();
        liveOfficeAvailable = health.readiness === "ready" && health.capabilities.jobCreation;
        officeCpuCount = liveOfficeAvailable ? health.runtime?.effectiveCpuCount ?? 0 : 0;
        officeMemoryGb = liveOfficeAvailable ? (health.runtime?.effectiveMemoryMb ?? 0) / 1024 : 0;
        maxFileSizeMb = health.limits.maxFileSizeMb;
      }

      const response = await browser.runtime.sendMessage({
        type: SMART_PLANNER_BACKGROUND_PREPARE,
        requestId: crypto.randomUUID(),
        userGoal: {
          deliveryTarget: "email_20mb",
          qualityIntent: "print",
          speedPreference: "balanced",
          splitAllowed: true,
        },
        engineCapabilities: {
          localAvailable: true,
          officeAvailable: liveOfficeAvailable,
          officeCpuCount,
          officeMemoryGb,
          allowedPresets: ["balanced"],
          maxFileSizeMb,
        },
      }) as SmartPlannerPrepareResponse;

      if (!response.ok) {
        setState({ status: "error", message: response.message });
        return;
      }

      if (response.preparation.status === "blocked") {
        setState({
          status: "blocked",
          message: "Document analysis is incomplete. Processing remains disabled.",
        });
        return;
      }

      const request = response.preparation.request;
      const client = createSmartPlannerApiClient({
        baseUrl,
        accessToken,
        requestPolicy: SMART_PLANNER_REQUEST_POLICY,
        planPolicy: {
          allowedPresets: request.engineCapabilities.allowedPresets,
          localAvailable: request.engineCapabilities.localAvailable,
          officeAvailable: request.engineCapabilities.officeAvailable,
          splitAllowed: request.userGoal.splitAllowed,
          officeEntitled: request.engineCapabilities.officeAvailable,
          numericPolicy: APPROVED_BALANCED_NUMERIC_POLICY,
        },
      });
      const recommendation = await requestSmartPlannerRecommendationWithClient(request, client);
      if (recommendation.status === "blocked") {
        setState({
          status: "blocked",
          message: `Recommendation unavailable: ${recommendation.errors.join("; ")}`,
        });
        return;
      }

      const profile = request.documentProfile;
      setState({
        status: "ready",
        pageCount: profile.pageCount,
        imageObjectCount: profile.imageObjectCount,
        scannedPercent: profile.scannedPageRatio,
        textPercent: profile.textPageRatio,
        vectorPercent: profile.vectorPageRatio,
        plan: recommendation.plan,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Document analysis failed",
      });
    }
  }

  const busy = state.status === "analyzing";

  return (
    <article className="planner-card" aria-labelledby="planner-card-title">
      <div className="planner-card__header">
        <div>
          <p className="eyebrow">Smart Planner</p>
          <h2 id="planner-card-title">Analyze this document</h2>
        </div>
        <span className="status-badge">
          {state.status === "ready" ? "AI recommendation ready" : busy ? "Analyzing…" : "Not analyzed"}
        </span>
      </div>

      <p className="planner-card__disclosure">
        Analysis stays on this device. Only content-blind structural metrics are sent to the Planner. No filename, text, image, preview, or PDF content is sent.
      </p>

      {localCapability.status === "ready" ? (
        <div className="planner-card__result" aria-label="Local runtime capability">
          <strong>Local runtime detected</strong>
          <span>{localCapability.capability.cpuModel}</span>
          <span>
            {localCapability.capability.logicalCpuCount} logical CPUs · {gigabytes(localCapability.capability.availableMemoryGb)} GB available of {gigabytes(localCapability.capability.totalMemoryGb)} GB RAM
          </span>
          <small>Hardware is detected locally. Benchmark calibration has not run yet.</small>
        </div>
      ) : localCapability.status === "unavailable" ? (
        <p className="planner-card__note">Local hardware details are unavailable in this browser.</p>
      ) : (
        <p className="planner-card__note">Reading local hardware capability…</p>
      )}

      <button
        type="button"
        className="primary"
        onClick={() => void analyze()}
        disabled={!pdfReady || busy}
      >
        {busy ? "Analyzing and planning…" : state.status === "ready" ? "Analyze again" : "Analyze document"}
      </button>

      {!pdfReady ? <p className="planner-card__note">Choose a PDF first.</p> : null}

      {state.status === "ready" ? (
        <div className="planner-card__result" role="status" aria-live="polite">
          <span>{state.pageCount} pages analyzed</span>
          <span>{state.imageObjectCount} image objects detected</span>
          <div className="planner-card__metrics">
            <span>Scanned {percent(state.scannedPercent)}</span>
            <span>Text {percent(state.textPercent)}</span>
            <span>Vector {percent(state.vectorPercent)}</span>
          </div>
          <strong>{state.plan.engine === "office" ? "Office Engine" : "Local Engine"} · {state.plan.preset}</strong>
          <span>Quality {state.plan.quality} · {state.plan.dpi} DPI</span>
          <span>
            Split {state.plan.split.enabled ? `into approximately ${state.plan.split.targetPartSizeMb} MB parts` : "not recommended"}
          </span>
          <p>{state.plan.explanation}</p>
          <small>Page type reflects the main content of each page. Images may also appear on text pages.</small>
          <small>AI recommendation preview only. Nothing will run until you explicitly confirm it.</small>
        </div>
      ) : null}

      {state.status === "blocked" || state.status === "error" ? (
        <p className="planner-card__error" role="alert">{state.message}</p>
      ) : null}
    </article>
  );
}
