import type { CoordinatorSnapshot } from "../execution-coordinator.js";

export type AiRuntimePrimaryAction =
  | "none"
  | "prepare_split"
  | "download_pdf"
  | "download_zip";

export interface AiRuntimeExecutionViewModel {
  readonly status: CoordinatorSnapshot["state"];
  readonly primaryAction: AiRuntimePrimaryAction;
  readonly canReset: boolean;
  readonly showProgress: boolean;
  readonly showTerminalDownload: boolean;
}

export function executionViewModel(snapshot: CoordinatorSnapshot): AiRuntimeExecutionViewModel {
  const primaryAction: AiRuntimePrimaryAction = snapshot.capabilities.canDownloadZip
    ? "download_zip"
    : snapshot.capabilities.canDownloadPdf
      ? "download_pdf"
      : snapshot.capabilities.canPrepareSplit
        ? "prepare_split"
        : "none";

  const terminal = snapshot.state === "completed_pdf" || snapshot.state === "completed_zip";

  return Object.freeze({
    status: snapshot.state,
    primaryAction,
    canReset: snapshot.state !== "idle" && snapshot.state !== "cancelling",
    showProgress: !terminal && snapshot.state !== "idle" && snapshot.state !== "failed" && snapshot.state !== "cancelled",
    showTerminalDownload: terminal && (primaryAction === "download_pdf" || primaryAction === "download_zip"),
  });
}
