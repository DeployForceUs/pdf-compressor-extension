import type { CoordinatorSnapshot } from "../../lib/ai-runtime/execution-coordinator.js";
import { executionViewModel } from "../../lib/ai-runtime/ui/execution-view-model.js";

type Props = {
  readonly snapshot: CoordinatorSnapshot;
  readonly onPrepareSplit?: () => void;
  readonly onDownloadPdf?: () => void;
  readonly onDownloadZip?: () => void;
  readonly onReset?: () => void;
};

export function AiRuntimeExecutionPanel({
  snapshot,
  onPrepareSplit,
  onDownloadPdf,
  onDownloadZip,
  onReset,
}: Props) {
  const view = executionViewModel(snapshot);

  return (
    <section className="ai-runtime-execution" data-runtime-state={view.status} aria-live="polite">
      {view.showProgress ? <p role="status">Processing status: {view.status}</p> : null}

      {view.primaryAction === "prepare_split" ? (
        <button type="button" className="primary" onClick={onPrepareSplit}>
          Prepare split
        </button>
      ) : null}

      {view.primaryAction === "download_pdf" && view.showTerminalDownload ? (
        <button type="button" className="primary" onClick={onDownloadPdf}>
          Download PDF
        </button>
      ) : null}

      {view.primaryAction === "download_zip" && view.showTerminalDownload ? (
        <button type="button" className="primary" onClick={onDownloadZip}>
          Download ZIP
        </button>
      ) : null}

      {view.canReset ? (
        <button type="button" onClick={onReset}>
          Start over
        </button>
      ) : null}
    </section>
  );
}
