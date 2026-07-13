import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import "fake-indexeddb/auto";
import mupdf from "mupdf";
import { createSplitZipArchive } from "../src/lib/pdf/split-archive.ts";
import { runSplitJob } from "../src/lib/offscreen/split-runtime.ts";
import {
  createSplitResultsStore,
  readSplitArtifactsForBundle,
  readSplitResult,
  readSplitResultBundle,
} from "../src/lib/storage/pdf-split-results-db.ts";
import type {
  PdfRecord,
  SplitArtifactRecord,
  SplitOutputMode,
  SplitResultBundle,
} from "../src/lib/messaging.ts";

async function createPdf(pageCount: number, label: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([72, 72]);
    page.drawText(`${label}-${index + 1}`, { font, size: 8, x: 6, y: 36 });
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
    pageCount: bytes.byteLength > 0 ? 3 : 0,
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

async function runSplit(inputRecord: PdfRecord, outputMode?: SplitOutputMode) {
  let persisted: { bundle: SplitResultBundle; artifacts: SplitArtifactRecord[] } | null = null;

  const response = await runSplitJob(
    inputRecord,
    {
      type: "split:local",
      strategy: {
        type: "by-pages",
        pagesPerPart: 1,
      },
      outputMode,
      compressAfter: false,
    },
    {
      workerApi: createWorkerGateway(),
      persistResult: async (bundle, artifacts) => {
        persisted = { bundle, artifacts };
        return bundle;
      },
      isCancelled: () => false,
      onProgress: async () => undefined,
    },
  );

  assert.ok(persisted);
  return { response, persisted };
}

function assertPdf(bytes: ArrayBuffer, expectedPageCount: number) {
  const header = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5));
  assert.equal(header, "%PDF-");

  return PDFDocument.load(bytes).then((pdf) => {
    assert.equal(pdf.getPageCount(), expectedPageCount);
  });
}

async function assertZipContainsPdfParts(
  zipBytes: ArrayBuffer,
  expectedEntries: Array<{ filename: string; pageCount: number }>,
) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  assert.deepEqual(Object.keys(entries), expectedEntries.map((entry) => entry.filename));

  for (const entry of expectedEntries) {
    const bytes = entries[entry.filename].buffer.slice(
      entries[entry.filename].byteOffset,
      entries[entry.filename].byteOffset + entries[entry.filename].byteLength,
    );
    await assertPdf(bytes, entry.pageCount);
  }
}

{
  const bytes = new Uint8Array(await createPdf(3, "single"));
  const inputRecord = createPdfRecord(bytes, "single.pdf");
  const store = createSplitResultsStore();

  const { response, persisted } = await runSplit(inputRecord);
  assert.equal(response.result.outputMode, "single-zip");
  assert.equal(response.result.artifactCount, 1);
  assert.equal(response.result.artifacts[0].kind, "zip");

  await store.writeSplitResultBundle(persisted.bundle, persisted.artifacts);

  const bundle = await readSplitResultBundle(persisted.bundle.id);
  assert.ok(bundle);
  assert.equal(bundle?.outputMode, "single-zip");
  assert.equal(bundle?.artifactIds.length, 1);

  const artifacts = await readSplitArtifactsForBundle(persisted.bundle.id);
  assert.ok(artifacts);
  assert.equal(artifacts?.length, 1);
  assert.equal(artifacts?.[0].kind, "zip");
  await assertZipContainsPdfParts(artifacts![0].data, [
    { filename: "single_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "single_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "single_part_003_pages_3-3.pdf", pageCount: 1 },
  ]);

  const compat = await readSplitResult(persisted.bundle.id);
  assert.ok(compat);
  await assertZipContainsPdfParts(compat!.data, [
    { filename: "single_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "single_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "single_part_003_pages_3-3.pdf", pageCount: 1 },
  ]);
}

{
  const bytes = new Uint8Array(await createPdf(3, "pdfs"));
  const inputRecord = createPdfRecord(bytes, "individual.pdf");
  const store = createSplitResultsStore();

  const { response, persisted } = await runSplit(inputRecord, "individual-pdfs");
  assert.equal(response.result.outputMode, "individual-pdfs");
  assert.equal(response.result.artifactCount, 3);
  assert.deepEqual(response.result.artifacts.map((artifact) => artifact.kind), ["pdf", "pdf", "pdf"]);

  await store.writeSplitResultBundle(persisted.bundle, persisted.artifacts);

  const bundle = await readSplitResultBundle(persisted.bundle.id);
  assert.ok(bundle);
  assert.equal(bundle?.outputMode, "individual-pdfs");
  assert.deepEqual(bundle?.artifactIds, persisted.bundle.artifactIds);

  const artifacts = await readSplitArtifactsForBundle(persisted.bundle.id);
  assert.ok(artifacts);
  assert.equal(artifacts?.length, 3);

  for (let index = 0; index < artifacts!.length; index += 1) {
    const artifact = artifacts![index];
    assert.equal(artifact.kind, "pdf");
    assert.equal(artifact.filename, `individual_part_${String(index + 1).padStart(3, "0")}_pages_${index + 1}-${index + 1}.pdf`);
    await assertPdf(artifact.data, 1);
  }

  assert.equal(await readSplitResult(persisted.bundle.id), null);
}

{
  const bytes = new Uint8Array(await createPdf(3, "zips"));
  const inputRecord = createPdfRecord(bytes, "separate.pdf");
  const store = createSplitResultsStore();

  const { response, persisted } = await runSplit(inputRecord, "separate-zips");
  assert.equal(response.result.outputMode, "separate-zips");
  assert.equal(response.result.artifactCount, 3);
  assert.deepEqual(response.result.artifacts.map((artifact) => artifact.kind), ["zip", "zip", "zip"]);

  await store.writeSplitResultBundle(persisted.bundle, persisted.artifacts);

  const bundle = await readSplitResultBundle(persisted.bundle.id);
  assert.ok(bundle);
  assert.equal(bundle?.outputMode, "separate-zips");

  const artifacts = await readSplitArtifactsForBundle(persisted.bundle.id);
  assert.ok(artifacts);
  assert.equal(artifacts?.length, 3);

  for (let index = 0; index < artifacts!.length; index += 1) {
    const artifact = artifacts![index];
    assert.equal(artifact.kind, "zip");
    assert.ok(artifact.filename.endsWith(".zip"));
    await assertZipContainsPdfParts(
      artifact.data,
      [
        {
          filename: `separate_part_${String(index + 1).padStart(3, "0")}_pages_${index + 1}-${index + 1}.pdf`,
          pageCount: 1,
        },
      ],
    );
  }

  assert.equal(await readSplitResult(persisted.bundle.id), null);
}

console.log("phase5 slice 13 artifact factory output mode assertions passed");
