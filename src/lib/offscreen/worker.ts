import { expose, transfer } from "comlink";
import type { CompressionProgressEvent } from "../messaging";
import {
  checkMuPdfHealth,
  compressBalancedPdf,
  type CompressionRequest,
  type CompressionOutcome,
} from "../pdf/compressor";

type CancellationChecker = () => boolean | Promise<boolean>;
type ProgressReporter = (event: CompressionProgressEvent) => void | Promise<void>;

export type CompressionWorkerApi = {
  health: (mupdfRuntimeUrl: string) => Promise<Awaited<ReturnType<typeof checkMuPdfHealth>>>;
  compress: (
    request: CompressionRequest,
    isCancelled: CancellationChecker,
    onProgress: ProgressReporter,
  ) => Promise<CompressionOutcome>;
};

const api: CompressionWorkerApi = {
  async health(mupdfRuntimeUrl: string) {
    return checkMuPdfHealth(mupdfRuntimeUrl);
  },

  async compress(request: CompressionRequest, isCancelled: CancellationChecker, onProgress: ProgressReporter) {
    const outcome = await compressBalancedPdf(request, isCancelled, onProgress);

    return transfer(outcome, [outcome.outputBytes]);
  },
};

expose(api);
