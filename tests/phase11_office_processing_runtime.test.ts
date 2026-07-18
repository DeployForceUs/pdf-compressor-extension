import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { runOfficeProcessingJob } from "../src/lib/office/office-processing-runtime";
import type { OfficeEngineHealth, OfficeJob } from "../src/lib/office/office-engine-client";

async function pdfBytes() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  return new Uint8Array(await pdf.save());
}

const health: OfficeEngineHealth = {
  status: "healthy",
  readiness: "ready",
  apiVersion: "1.0",
  serviceVersion: "0.2.0",
  engine: { kind: "office", processor: "ghostscript", processorVersion: "10", processingAvailable: true },
  capabilities: { allowedPresets: ["balanced"], jobCreation: true, jobStatus: true, resultDownload: true, cancellation: true },
  limits: { maxFileSizeMb: 1024, processingTimeoutSeconds: 300, retentionMinutes: 15, maxConcurrentJobs: 1 },
};

function job(status: OfficeJob["status"], progress: number): OfficeJob {
  return { jobId: "job-id", status, progress, preset: "balanced", createdAt: "now" };
}

test("runs the authenticated Office lifecycle and persists a locally validated result", async () => {
  const input = await pdfBytes();
  const output = await pdfBytes();
  const stages: string[] = [];
  let persisted;
  const result = await runOfficeProcessingJob({
    id: "selected-pdf",
    name: "private-name.pdf",
    size: input.byteLength,
    type: "application/pdf",
    lastModified: 0,
    pageCount: 1,
    data: [...input],
  }, {
    client: {
      health: async () => health,
      createJob: async () => job("queued", 0),
      getJob: async () => job("completed", 100),
      downloadResult: async () => ({ bytes: output.buffer as ArrayBuffer, kind: "compressed" }),
      cancelJob: async () => job("cancelled", 0),
    },
    signal: new AbortController().signal,
    sleep: async () => undefined,
    onProgress: (event) => stages.push(event.stage),
    persistResult: async (record) => {
      persisted = record;
      return record;
    },
  });

  assert.equal(result.resultKind, "compressed");
  assert.equal(persisted.pageCount, 1);
  assert.equal(persisted.sourceRecordId, "selected-pdf");
  assert.deepEqual(stages, ["connecting", "uploading", "queued", "processing", "downloading", "validating", "persisting", "complete"]);
});

test("rejects a result whose page count differs from the selected PDF", async () => {
  const input = await pdfBytes();
  const output = await pdfBytes();
  await assert.rejects(runOfficeProcessingJob({
    id: "selected-pdf",
    name: "file.pdf",
    size: input.byteLength,
    type: "application/pdf",
    lastModified: 0,
    pageCount: 2,
    data: [...input],
  }, {
    client: {
      health: async () => health,
      createJob: async () => job("completed", 100),
      getJob: async () => job("completed", 100),
      downloadResult: async () => ({ bytes: output.buffer as ArrayBuffer, kind: "compressed" }),
      cancelJob: async () => job("cancelled", 0),
    },
    signal: new AbortController().signal,
    onProgress: () => undefined,
    persistResult: async (record) => record,
  }), /office_result_page_mismatch/);
});
