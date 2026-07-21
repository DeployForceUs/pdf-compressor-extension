import { useState } from "react";
import browser from "webextension-polyfill";
import {
  SMART_PLANNER_BACKGROUND_PREPARE,
  type SmartPlannerPrepareResponse,
} from "../../lib/ai/smart-planner-runtime-message-contract";
import "../../styles/smart-planner-card.css";

type PlannerUiState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "ready"; pageCount: number; scannedPercent: number; textPercent: number; vectorPercent: number }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string };

type Props = {
  pdfReady: boolean;
  officeAvailable: boolean;
};

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function SmartPlannerPreparationCard({ pdfReady, officeAvailable }: Props) {
  const [state, setState] = useState<PlannerUiState>({ status: "idle" });

  async function analyze() {
    if (!pdfReady || state.status === "analyzing") return;
    setState({ status: "analyzing" });

    try {
      const response = await browser.runtime.sendMessage({
        type: SMART_PLANNER_BACKGROUND_PREPARE,
        requestId: crypto.randomUUID(),
        userGoal: {
          deliveryTarget: "email_20mb",
          qualityIntent: "screen",
          speedPreference: "balanced",
          splitAllowed: true,
        },
        engineCapabilities: {
          localAvailable: true,
          officeAvailable,
          officeCpuCount: 0,
          officeMemoryGb: 0,
          allowedPresets: ["balanced"],
          maxFileSizeMb: 1024,
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

      const profile = response.preparation.request.documentProfile;
      setState({
        status: "ready",
        pageCount: profile.pageCount,
        scannedPercent: profile.scannedPageRatio,
        textPercent: profile.textPageRatio,
        vectorPercent: profile.vectorPageRatio,
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
          {state.status === "ready" ? "Recommendation ready" : busy ? "Analyzing…" : "Not analyzed"}
        </span>
      </div>

      <p className="planner-card__disclosure">
        Analysis stays on this device. No filename, text, image, preview, or PDF content is sent to the Planner.
      </p>

      <button
        type="button"
        className="primary"
        onClick={() => void analyze()}
        disabled={!pdfReady || busy}
      >
        {busy ? "Analyzing document…" : state.status === "ready" ? "Analyze again" : "Analyze document"}
      </button>

      {!pdfReady ? <p className="planner-card__note">Choose a PDF first.</p> : null}

      {state.status === "ready" ? (
        <div className="planner-card__result" role="status" aria-live="polite">
          <strong>Recommendation ready</strong>
          <span>{state.pageCount} pages analyzed</span>
          <div className="planner-card__metrics">
            <span>Scanned {percent(state.scannedPercent)}</span>
            <span>Text {percent(state.textPercent)}</span>
            <span>Vector {percent(state.vectorPercent)}</span>
          </div>
          <small>Preparation only. Nothing will run until you confirm a future recommendation.</small>
        </div>
      ) : null}

      {state.status === "blocked" || state.status === "error" ? (
        <p className="planner-card__error" role="alert">{state.message}</p>
      ) : null}
    </article>
  );
}
