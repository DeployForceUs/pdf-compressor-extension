import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import "fake-indexeddb/auto";
import mupdf from "mupdf";
import { createSplitZipArchive } from "../src/lib/pdf/split-archive.ts";
import { runSplitJob } from "../src/lib/offscreen/split-runtime.ts";
import { createSplitResultsStore } from "../src/lib/storage/pdf-split-results-db.ts";
import { SPLIT_OUTPUT_MODES, type PdfRecord, type SplitResultRecord } from "../src/lib/messaging.ts";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([72, 72]);
    page.drawText(String(index + 1), { font, size: 8, x: 8, y: 36 });
  }

  return pdf.save();
}

function createPdfRecord(bytes: Uint8Array, name: string): PdfRecord {
  return {
    id: `${name}-record`,
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    lastModified: 0,
    pageCount: 3,
    data: Array.from(bytes),
  };
}

function createWorkerGateway() {
  return {
    split: (
      request: Parameters<typeof createSplitZipArchive>[0],
      isCancelled: Parameters<typeof createSplitZipArchive>[1],
      onProgress: Parameters<typeof createSplitZipArchive>[2],
    ) => createSplitZipArchive(request, isCancelled, onProgress, { loadMuPdf: async () => mupdf }),
  };
}

async function runSplit(inputRecord: PdfRecord) {
  const progressEvents: Array<unknown> = [];
  let persisted: SplitResultRecord | null = null;

  const response = await runSplitJob(
    inputRecord,
    {
      type: "split:local",
      strategy: {
        type: "by-pages",
        pagesPerPart: 1,
      },
      compressAfter: false,
    },
    {
      workerApi: createWorkerGateway(),
      persistResult: async (record) => {
        persisted = record;
        return record;
      },
      isCancelled: () => false,
      onProgress: async (event) => {
        progressEvents.push(event);
      },
    },
  );

  assert.ok(persisted);
  return { response, persisted, progressEvents };
}

async function assertZipContains(zipBytes: ArrayBuffer, expectedEntries: Array<{ filename: string; pageCount: number }>) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  assert.deepEqual(Object.keys(entries), expectedEntries.map((entry) => entry.filename));

  for (const entry of expectedEntries) {
    const pdf = await PDFDocument.load(entries[entry.filename]);
    assert.equal(pdf.getPageCount(), entry.pageCount);
  }
}

assert.deepEqual(SPLIT_OUTPUT_MODES, ["single-zip", "individual-pdfs", "separate-zips"]);
assert.ok(typeof indexedDB !== "undefined");

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "foundation.pdf");

  const store = createSplitResultsStore();
  const { response, persisted } = await runSplit(inputRecord);
  assert.equal(response.ok, true);
  assert.equal(response.result.partsCount, 3);
  assert.equal(response.result.warnings.length, 0);
  assert.equal(response.result.totalBytesSaved, Math.max(0, response.result.originalSize - persisted.data.byteLength));

  await store.writeSplitResult(persisted);

  const bundle = await store.readSplitResultBundle(persisted.id);
  assert.ok(bundle);
  assert.equal(bundle?.outputMode, "single-zip");
  assert.equal(bundle?.artifactIds.length, 1);
  assert.equal(bundle?.status, "complete");

  const artifacts = await store.readSplitArtifactsForBundle(persisted.id);
  assert.ok(artifacts);
  assert.equal(artifacts?.length, 1);
  assert.equal(artifacts?.[0].kind, "zip");
  assert.equal(artifacts?.[0].mimeType, "application/zip");

  const artifact = await store.readSplitArtifact(persisted.id);
  assert.ok(artifact);
  assert.equal(artifact?.byteLength, persisted.data.byteLength);
  await assertZipContains(artifact!.data, [
    { filename: "foundation_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "foundation_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "foundation_part_003_pages_3-3.pdf", pageCount: 1 },
  ]);

  const compat = await store.readSplitResult(persisted.id);
  assert.ok(compat);
  assert.equal(compat?.mimeType, "application/zip");
  assert.equal(compat?.fileName, persisted.fileName);
  await assertZipContains(compat!.data, [
    { filename: "foundation_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "foundation_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "foundation_part_003_pages_3-3.pdf", pageCount: 1 },
  ]);

  await store.deleteSplitResult(persisted.id);
}

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "atomic.pdf");

  const store = createSplitResultsStore({
    beforeCommit: async (bundle) => {
      assert.equal(await store.readSplitResultBundle(bundle.id), null);
      assert.equal(await store.readSplitArtifact(bundle.artifactIds[0]), null);
    },
  });

  const { persisted } = await runSplit(inputRecord);
  await store.writeSplitResult(persisted);

  const bundle = await store.readSplitResultBundle(persisted.id);
  assert.ok(bundle);
  assert.equal(bundle?.status, "complete");
  assert.equal((await store.readSplitArtifactsForBundle(persisted.id))?.length, 1);

  await store.deleteSplitResult(persisted.id);
}

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "failure.pdf");

  const failingStore = createSplitResultsStore({
    failOnWrite: (step) => {
      if (step.store === "split-artifacts" && step.phase === "pending") {
        throw new Error("artifacts failed");
      }
    },
  });

  const { persisted } = await runSplit(inputRecord);
  await assert.rejects(
    () => failingStore.writeSplitResult(persisted),
    (error: unknown) => error instanceof Error && error.message.includes("artifacts failed"),
  );
  assert.equal(await failingStore.readSplitResultBundle(persisted.id), null);
  assert.equal(await failingStore.readSplitArtifactsForBundle(persisted.id), null);
}

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "quota.pdf");

  const quotaStore = createSplitResultsStore({
    failOnWrite: (step) => {
      if (step.store === "split-result-bundles" && step.phase === "pending") {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
    },
  });

  const { persisted } = await runSplit(inputRecord);
  await assert.rejects(
    () => quotaStore.writeSplitResult(persisted),
    (error: unknown) => error instanceof Error && (error as { code?: string }).code === "STORAGE_QUOTA_EXCEEDED",
  );
  assert.equal(await quotaStore.readSplitResultBundle(persisted.id), null);
}

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "delete-safe.pdf");

  const store = createSplitResultsStore();
  const { persisted } = await runSplit(inputRecord);
  await store.writeSplitResult(persisted);

  const artifact = await store.readSplitArtifact(persisted.id);
  assert.ok(artifact);
  await store.deleteSplitArtifact(artifact.id);

  assert.equal(await store.readSplitArtifact(artifact.id), null);
  assert.equal(await store.readSplitResultBundle(persisted.id), null);

  assert.equal(await store.deleteSplitResult(persisted.id), true);
}

{
  const bytes = new Uint8Array(await createPdf(3));
  const inputRecord = createPdfRecord(bytes, "legacy.pdf");

  const store = createSplitResultsStore();
  const { persisted } = await runSplit(inputRecord);
  await store.writeLegacySplitResult(persisted);

  const legacy = await store.readLegacySplitResult(persisted.id);
  assert.ok(legacy);
  assert.equal(legacy?.fileName, persisted.fileName);

  const bundle = await store.readSplitResultBundle(persisted.id);
  assert.ok(bundle);
  assert.equal(bundle?.outputMode, "single-zip");
  assert.equal(bundle?.artifactIds.length, 1);

  const compat = await store.readSplitResult(persisted.id);
  assert.ok(compat);
  await assertZipContains(compat!.data, [
    { filename: "legacy_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "legacy_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "legacy_part_003_pages_3-3.pdf", pageCount: 1 },
  ]);

  assert.equal(await store.deleteLegacySplitResult(persisted.id), true);
  assert.equal(await store.readLegacySplitResult(persisted.id), null);
}

console.log("phase5 slice 12 artifact factory foundation assertions passed");
