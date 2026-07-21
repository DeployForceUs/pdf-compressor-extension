import { expose, transfer } from "comlink";
import type { CompressionProgressEvent, SplitProgressEvent } from "../messaging";
import {
  checkMuPdfHealth,
  compressBalancedPdf,
  type CompressionRequest,
  type CompressionOutcome,
} from "../pdf/compressor";
import { createSplitZipArchive, type SplitArchiveRequest, type SplitArchiveOutcome } from "../pdf/split-archive";
import { transferSplitWorkerReturn } from "./split-worker-transfer";
import { normalizeSplitOutputMode } from "../split-output-mode";
import { tracePdfSplit } from "../pdf-split-trace";
import {
  profileContentBlindPdf,
  type ContentBlindProfilerRequest,
  type ContentBlindProfilerResult,
} from "../ai/content-blind-pdf-profiler";

type CancellationChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: CompressionProgressEvent) => void | Promise<void>;
type SplitProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;

export type CompressionWorkerApi = {
  health: (mupdfRuntimeUrl: string) => Promise<Awaited<ReturnType<typeof checkMuPdfHealth>>>;
  profileContentBlind: (
    request: ContentBlindProfilerRequest,
    isCancelled: CancellationChecker,
  ) => Promise<ContentBlindProfilerResult>;
  compress: (
    request: CompressionRequest,
    isCancelled: CancellationChecker,
    onProgress: ProgressReporter,
  ) => Promise<CompressionOutcome>;
  split: (
    request: SplitArchiveRequest,
    isCancelled: CancellationChecker,
    onProgress: SplitProgressReporter,
  ) => Promise<SplitArchiveOutcome>;
};

const api: CompressionWorkerApi = {
  async health(mupdfRuntimeUrl: string) {
    return checkMuPdfHealth(mupdfRuntimeUrl);
  },

  async profileContentBlind(request: ContentBlindProfilerRequest, isCancelled: CancellationChecker) {
    return profileContentBlindPdf(request, isCancelled);
  },

  async compress(request: CompressionRequest, isCancelled: CancellationChecker, onProgress: ProgressReporter) {
    const outcome = await compressBalancedPdf(request, isCancelled, onProgress);

    return transfer(outcome, [outcome.outputBytes]);
  },

  async split(request: SplitArchiveRequest, isCancelled: CancellationChecker, onProgress: SplitProgressReporter) {
    const outputMode = normalizeSplitOutputMode(request.outputMode);
    tracePdfSplit({
      outputMode,
      stage: "worker-entry",
      workerLifecycle: "rpc-entered",
      messageDirection: "offscreen->worker",
      success: true,
    });
    tracePdfSplit({
      outputMode,
      stage: "before-create-split-zip-archive",
      workerLifecycle: "running",
      messageDirection: "worker->split-engine",
      success: true,
    });
    const outcome = await createSplitZipArchive(request, isCancelled, onProgress);
    tracePdfSplit({
      outputMode,
      stage: "after-create-split-zip-archive",
      workerLifecycle: "running",
      messageDirection: "split-engine->worker",
      success: true,
      details: { artifactCount: outcome.artifacts.length },
    });
    tracePdfSplit({
      outputMode,
      stage: "before-worker-return",
      workerLifecycle: "rpc-returning",
      messageDirection: "worker->offscreen",
      success: true,
      details: { artifactCount: outcome.artifacts.length },
    });
    return transferSplitWorkerReturn(outcome);
  },
};

expose(api);
