import type { CompressionResultRecord, OfficeProcessingProgressEvent, PdfRecord } from "../messaging";
import { COMPRESSED_PDF_RECORD_ID } from "../pdf-records";
import { readPdfPageCount } from "../pdf-validation";
import type { OfficeEngineHealth, OfficeJob } from "./office-engine-client";

type OfficeClient = {
  health(): Promise<OfficeEngineHealth>;
  createJob(pdf: Blob, signal?: AbortSignal): Promise<OfficeJob>;
  getJob(jobId: string, signal?: AbortSignal): Promise<OfficeJob>;
  downloadResult(jobId: string, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; kind: "compressed" | "original" }>;
  cancelJob(jobId: string): Promise<OfficeJob>;
};

export type OfficeProcessingRuntimeDependencies = {
  client: OfficeClient;
  persistResult(record: CompressionResultRecord): Promise<CompressionResultRecord>;
  onProgress(event: OfficeProcessingProgressEvent): void;
  onJobCreated?(jobId: string): void;
  signal: AbortSignal;
  sleep?: (milliseconds: number) => Promise<void>;
};

function progress(stage: OfficeProcessingProgressEvent["stage"], value: number, message: string) {
  return { type: "office:progress" as const, stage, progress: value, message };
}

export async function runOfficeProcessingJob(
  selected: PdfRecord,
  dependencies: OfficeProcessingRuntimeDependencies,
) {
  const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  dependencies.onProgress(progress("connecting", 2, "Checking Office Engine"));
  const health = await dependencies.client.health();
  if (health.readiness !== "ready" || !health.capabilities.jobCreation) throw new Error("office_engine_not_ready");
  if (selected.size > health.limits.maxFileSizeMb * 1024 * 1024) throw new Error("file_too_large");

  dependencies.onProgress(progress("uploading", 8, "Uploading PDF to your Office Engine"));
  let job = await dependencies.client.createJob(
    new Blob([Uint8Array.from(selected.data)], { type: "application/pdf" }),
    dependencies.signal,
  );
  dependencies.onJobCreated?.(job.jobId);
  dependencies.onProgress(progress("queued", Math.max(10, job.progress), "Queued on Office Engine"));

  while (job.status !== "completed") {
    if (dependencies.signal.aborted) throw new DOMException("Office processing cancelled", "AbortError");
    if (job.status === "cancelled") throw new DOMException("Office processing cancelled", "AbortError");
    await sleep(1_000);
    job = await dependencies.client.getJob(job.jobId, dependencies.signal);
    dependencies.onProgress(progress("processing", Math.min(90, Math.max(12, job.progress)), "Processing on Office Engine"));
  }

  dependencies.onProgress(progress("downloading", 92, "Downloading validated result"));
  const downloaded = await dependencies.client.downloadResult(job.jobId, dependencies.signal);
  dependencies.onProgress(progress("validating", 95, "Validating result locally"));
  const header = new TextDecoder().decode(new Uint8Array(downloaded.bytes).slice(0, 5));
  if (header !== "%PDF-") throw new Error("invalid_office_result");
  const pageCount = await readPdfPageCount(downloaded.bytes);
  if (!pageCount || (selected.pageCount && pageCount !== selected.pageCount)) throw new Error("office_result_page_mismatch");

  const outputSize = downloaded.bytes.byteLength;
  const savedBytes = Math.max(0, selected.size - outputSize);
  dependencies.onProgress(progress("persisting", 98, "Saving result locally"));
  const record = await dependencies.persistResult({
    id: COMPRESSED_PDF_RECORD_ID,
    sourceRecordId: selected.id,
    fileName: selected.name,
    mimeType: "application/pdf",
    originalSize: selected.size,
    compressedSize: outputSize,
    savedBytes,
    savedPercent: selected.size === 0 ? 0 : (savedBytes / selected.size) * 100,
    pageCount,
    data: downloaded.bytes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  dependencies.onProgress(progress("complete", 100, "Office processing complete"));
  return { record, resultKind: downloaded.kind };
}
