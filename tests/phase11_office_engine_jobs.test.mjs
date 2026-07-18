import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EngineRequestError, OfficeEngineJobManager } from "../engine/job-manager.mjs";

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(991, 65)]);
const LIMITS = {
  maxFileSizeMb: 1,
  maxFileSizeBytes: 1024 * 1024,
  processingTimeoutSeconds: 1,
  retentionMinutes: 1,
  maxConcurrentJobs: 1,
};

async function waitFor(manager, id, status = "completed") {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = manager.getJob(id);
    if (job?.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`job did not reach ${status}`);
}

async function managerWith(processPdf, limits = LIMITS) {
  const workRoot = await mkdtemp(join(tmpdir(), "office-engine-test-"));
  const manager = new OfficeEngineJobManager({
    workRoot,
    limits,
    inspect: async () => ({ pageCount: 3 }),
    processPdf,
  });
  await manager.initialize();
  return manager;
}

test("accepts only a smaller valid output", async (t) => {
  const manager = await managerWith(async ({ outputPath }) => {
    await writeFile(outputPath, Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(90)]));
  });
  t.after(() => manager.dispose());

  const created = await manager.createJob(Readable.from(PDF), {
    contentType: "application/pdf",
    contentLength: PDF.length,
  });
  const completed = await waitFor(manager, created.jobId);
  assert.equal(completed.result.kind, "compressed");
  assert.equal(completed.result.reason, "validated_smaller_output");
  const result = manager.getResult(created.jobId);
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).length, 99);
});

test("returns the original when processing produces a larger file", async (t) => {
  const manager = await managerWith(async ({ outputPath }) => {
    await writeFile(outputPath, Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(1200)]));
  });
  t.after(() => manager.dispose());

  const created = await manager.createJob(Readable.from(PDF), {
    contentType: "application/pdf",
    contentLength: PDF.length,
  });
  const completed = await waitFor(manager, created.jobId);
  assert.equal(completed.result.kind, "original");
  assert.equal(completed.result.reason, "not_smaller");
  assert.deepEqual(await readFile(manager.jobs.get(created.jobId).resultPath), PDF);
});

test("rejects bad media types, oversized streams, and invalid magic", async (t) => {
  const manager = await managerWith(async () => {});
  t.after(() => manager.dispose());

  await assert.rejects(
    manager.createJob(Readable.from(PDF), { contentType: "text/plain", contentLength: PDF.length }),
    (error) => error instanceof EngineRequestError && error.statusCode === 415,
  );
  await assert.rejects(
    manager.createJob(Readable.from(Buffer.alloc(20)), { contentType: "application/pdf", contentLength: 20 }),
    (error) => error instanceof EngineRequestError && error.code === "invalid_pdf",
  );
  await assert.rejects(
    manager.createJob(Readable.from(PDF), { contentType: "application/pdf", contentLength: LIMITS.maxFileSizeBytes + 1 }),
    (error) => error instanceof EngineRequestError && error.statusCode === 413,
  );
});

test("processing failure safely retains the original", async (t) => {
  const manager = await managerWith(async () => {
    throw new Error("synthetic processor failure");
  });
  t.after(() => manager.dispose());
  const created = await manager.createJob(Readable.from(PDF), {
    contentType: "application/pdf",
    contentLength: PDF.length,
  });
  const completed = await waitFor(manager, created.jobId);
  assert.equal(completed.result.kind, "original");
  assert.equal(completed.result.reason, "processing_failed");
});

test("processing timeout retains the original", async (t) => {
  const manager = await managerWith(
    ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
    { ...LIMITS, processingTimeoutSeconds: 0.01 },
  );
  t.after(() => manager.dispose());
  const created = await manager.createJob(Readable.from(PDF), {
    contentType: "application/pdf",
    contentLength: PDF.length,
  });
  const completed = await waitFor(manager, created.jobId);
  assert.equal(completed.result.kind, "original");
  assert.equal(completed.result.reason, "processing_timeout");
});

test("a processing job can be cancelled", async (t) => {
  const manager = await managerWith(
    ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  );
  t.after(() => manager.dispose());
  const created = await manager.createJob(Readable.from(PDF), {
    contentType: "application/pdf",
    contentLength: PDF.length,
  });
  await waitFor(manager, created.jobId, "processing");
  const cancelling = await manager.cancel(created.jobId);
  assert.equal(cancelling.status, "cancelling");
  const cancelled = await waitFor(manager, created.jobId, "cancelled");
  assert.equal(cancelled.status, "cancelled");
});
