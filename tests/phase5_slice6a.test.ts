import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import mupdf from "mupdf";
import { SPLIT_PDF_RECORD_ID } from "../src/lib/pdf-records";
import { createSplitZipArchive } from "../src/lib/pdf/split-archive";
import { runSplitJob } from "../src/lib/offscreen/split-runtime";
import type { PdfRecord, SplitArtifactRecord, SplitProgressEvent, SplitResultBundle } from "../src/lib/messaging";
import type { SplitRuntimeError } from "../src/lib/pdf/split-errors";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([100 + index, 200 + index]);
  }

  return pdf.save();
}

async function createSelectedPdfRecord(pageCount: number, name: string): Promise<PdfRecord> {
  const bytes = await createPdf(pageCount);
  return {
    id: `${name}-record`,
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    lastModified: 0,
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

async function runSplit(
  inputRecord: PdfRecord,
  strategy: Parameters<typeof runSplitJob>[1]["strategy"],
  hooks?: {
    persistResult?: (record: unknown) => Promise<unknown>;
    isCancelled?: () => boolean | Promise<boolean>;
    onProgress?: (event: SplitProgressEvent) => void | Promise<void>;
  },
) {
  const progressEvents: SplitProgressEvent[] = [];
  let persisted: { bundle: SplitResultBundle; artifacts: SplitArtifactRecord[] } | null = null;

  const response = await runSplitJob(
    inputRecord,
    { type: "split:local", strategy },
    {
      workerApi: createWorkerGateway(),
      persistResult: hooks?.persistResult
        ? async (bundle, artifacts) => {
            persisted = await hooks.persistResult?.({ bundle, artifacts });
            return bundle;
          }
        : async (bundle, artifacts) => {
            persisted = { bundle, artifacts };
            return bundle;
          },
      isCancelled: hooks?.isCancelled ?? (() => false),
      onProgress: async (event) => {
        progressEvents.push(event);
        await hooks?.onProgress?.(event);
      },
    },
  );

  return { response, progressEvents, persisted };
}

async function assertZipContains(zipBytes: ArrayBuffer, expectedFilenames: string[]) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  assert.deepEqual(Object.keys(entries), expectedFilenames);

  for (const filename of expectedFilenames) {
    const pdf = await PDFDocument.load(entries[filename]);
    assert.ok(pdf.getPageCount() >= 1);
  }
}

{
  const inputRecord = await createSelectedPdfRecord(5, "pages.pdf");
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  });

  assert.equal(response.ok, true);
  assert.equal(response.zipBlobId, SPLIT_PDF_RECORD_ID);
  assert.equal(response.result.partsCount, 3);
  assert.equal(response.result.outputMode, "single-zip");
  assert.equal(response.result.fileName, "pages_split.zip");
  assert.equal(response.result.mimeType, "application/zip");
  assert.equal(response.result.originalSize, inputRecord.data.length);
  assert.equal(response.result.totalPartsSize > 0, true);
  assert.equal(persisted?.bundle.id, SPLIT_PDF_RECORD_ID);
  assert.deepEqual(
    progressEvents.map((event) => event.stage),
    [
      "validating",
      "planning-parts",
      "creating-part",
      "validating-part",
      "creating-part",
      "validating-part",
      "creating-part",
      "validating-part",
      "creating-zip",
      "persisting",
      "complete",
    ],
  );

  const stored = persisted;
  assert.ok(stored);
  assert.equal(stored.artifacts[0].filename, "pages_split.zip");
  assert.equal(stored.bundle.outputMode, "single-zip");
  assert.equal(stored.bundle.partsCount, 3);
  assert.equal(stored.bundle.strategy.type, "by-pages");
  await assertZipContains(stored.artifacts[0].data, [
    "pages_part_001_pages_1-2.pdf",
    "pages_part_002_pages_3-4.pdf",
    "pages_part_003_pages_5-5.pdf",
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord(6, "manual.pdf");
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "manual-ranges",
    ranges: "1-2,4,5-6",
  });

  assert.equal(response.result.partsCount, 3);
  assert.deepEqual(progressEvents[0]?.stage, "validating");
  assert.ok(persisted);
  assert.equal(persisted.bundle.strategy.type, "manual-ranges");
  await assertZipContains(persisted.artifacts[0].data, [
    "manual_part_001_pages_1-2.pdf",
    "manual_part_002_pages_4-4.pdf",
    "manual_part_003_pages_5-6.pdf",
  ]);
}

await assert.rejects(
  async () => {
    const inputRecord = await createSelectedPdfRecord(5, "invalid.pdf");
    return runSplit(inputRecord, {
      type: "manual-ranges",
      ranges: "1-3,3-4",
    });
  },
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "OVERLAPPING_PAGE_RANGES");
    return true;
  },
);

await assert.rejects(
  async () => {
    const inputRecord = await createSelectedPdfRecord(5, "cancel.pdf");
    return runSplit(
      inputRecord,
      {
        type: "by-pages",
        pagesPerPart: 2,
      },
      {
        isCancelled: () => true,
      },
    );
  },
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "CANCELLED");
    return true;
  },
);

{
  let cancel = false;
await assert.rejects(
  async () => {
    const inputRecord = await createSelectedPdfRecord(8, "cancel-before-zip.pdf");
    return runSplit(
      inputRecord,
      {
        type: "by-pages",
        pagesPerPart: 2,
      },
      {
        isCancelled: () => cancel,
        onProgress: (event) => {
          if (event.stage === "validating-part" && event.currentPart === event.partsCount) {
            cancel = true;
          }
        },
      },
    );
  },
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "CANCELLED");
    return true;
  },
);
}

await assert.rejects(
  async () => {
    const inputRecord = await createSelectedPdfRecord(5, "quota.pdf");
    return runSplit(
      inputRecord,
      {
        type: "by-pages",
        pagesPerPart: 2,
      },
      {
        persistResult: async () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        },
      },
    );
  },
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "STORAGE_QUOTA_EXCEEDED");
    return true;
  },
);

console.log("phase5 slice 6a runtime assertions passed");
