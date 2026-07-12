import { expose, transfer } from "comlink";
import type { CompressionProgressEvent, SplitProgressEvent } from "../messaging";
import {
  checkMuPdfHealth,
  compressBalancedPdf,
  type CompressionRequest,
  type CompressionOutcome,
} from "../pdf/compressor";
import { createSplitZipArchive, type SplitArchiveRequest, type SplitArchiveOutcome } from "../pdf/split-archive";

type CancellationChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: CompressionProgressEvent) => void | Promise<void>;
type SplitProgressReporter = (event: SplitProgressEvent) => void | Promise<void>;

export type CompressionWorkerApi = {
  health: (mupdfRuntimeUrl: string) => Promise<Awaited<ReturnType<typeof checkMuPdfHealth>>>;
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

  async compress(request: CompressionRequest, isCancelled: CancellationChecker, onProgress: ProgressReporter) {
    const outcome = await compressBalancedPdf(request, isCancelled, onProgress);

    return transfer(outcome, [outcome.outputBytes]);
  },

  async split(request: SplitArchiveRequest, isCancelled: CancellationChecker, onProgress: SplitProgressReporter) {
    const outcome = await createSplitZipArchive(request, isCancelled, onProgress);

    return transfer(outcome, [outcome.zipBytes]);
  },
};

expose(api);
