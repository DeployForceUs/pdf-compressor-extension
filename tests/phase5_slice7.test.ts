import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import { SPLIT_PDF_RECORD_ID } from "../src/lib/pdf-records";
import { createSplitZipArchive } from "../src/lib/pdf/split-archive";
import { runSplitJob } from "../src/lib/offscreen/split-runtime";
import { deleteSplitResult, readSplitResult, writeSplitResult } from "../src/lib/storage/pdf-split-results-db";
import type { PdfRecord, SplitProgressEvent, SplitResultMetadata, SplitWarning } from "../src/lib/messaging";
import type { SplitRuntimeError } from "../src/lib/pdf/split-errors";

async function createComplexPdf(pageComplexities: number[], name: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let pageIndex = 0; pageIndex < pageComplexities.length; pageIndex += 1) {
    const page = pdf.addPage([612, 792]);
    const complexity = pageComplexities[pageIndex];

    for (let drawIndex = 0; drawIndex < complexity; drawIndex += 1) {
      page.drawText(`${name}-${pageIndex + 1}-${drawIndex}`, {
        font,
        size: 9,
        x: 24 + (drawIndex % 12) * 24,
        y: 760 - Math.floor(drawIndex / 12) * 12,
      });
    }
  }

  return pdf.save();
}

async function measureRangeSize(inputBytes: Uint8Array, startPage: number, endPage: number) {
  const source = await PDFDocument.load(inputBytes);
  const output = await PDFDocument.create();
  const pageIndices = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage - 1 + index);
  const copiedPages = await output.copyPages(source, pageIndices);

  for (const page of copiedPages) {
    output.addPage(page);
  }

  return (await output.save()).byteLength;
}

async function createSelectedPdfRecord(pageComplexities: number[], name: string): Promise<PdfRecord> {
  const bytes = await createComplexPdf(pageComplexities, name);
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
    split: createSplitZipArchive,
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
  let persisted: unknown = null;

  const response = await runSplitJob(
    inputRecord,
    { type: "split:local", strategy },
    {
      workerApi: createWorkerGateway(),
      persistResult: hooks?.persistResult
        ? async (record) => {
            persisted = await hooks.persistResult?.(record);
            return record;
          }
        : async (record) => {
            persisted = record;
            return record;
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

async function assertZipContains(zipBytes: ArrayBuffer, expectedEntries: Array<{ filename: string; pageCount: number }>) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  assert.deepEqual(Object.keys(entries), expectedEntries.map((entry) => entry.filename));

  for (const entry of expectedEntries) {
    const pdf = await PDFDocument.load(entries[entry.filename]);
    assert.equal(pdf.getPageCount(), entry.pageCount);
  }
}

function assertWarningsEqual(actual: SplitWarning[], expected: SplitWarning[]) {
  assert.deepEqual(actual, expected);
}

{
  const inputRecord = await createSelectedPdfRecord([8], "single.pdf");
  const bytes = new Uint8Array(inputRecord.data);
  const singlePageSize = await measureRangeSize(bytes, 1, 1);
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: singlePageSize + 512,
  });

  assert.equal(response.ok, true);
  assert.equal(response.result.partsCount, 1);
  assert.equal(response.result.warnings.length, 0);
  assert.equal(progressEvents[0]?.stage, "validating");
  assert.equal(progressEvents.at(-1)?.stage, "complete");
  assert.equal((persisted as SplitResultMetadata).warnings.length, 0);
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "single_part_001_pages_1-1.pdf", pageCount: 1 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([32, 32, 32, 32, 32], "balanced.pdf");
  const bytes = new Uint8Array(inputRecord.data);
  const exactTwoPageSize = await measureRangeSize(bytes, 1, 2);
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: exactTwoPageSize,
  });

  assert.equal(response.result.partsCount, 3);
  assert.equal(response.result.warnings.length, 0);
  assert.equal(response.result.fileName, "balanced_split.zip");
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
  assert.equal(response.result.size, (persisted as { data: ArrayBuffer }).data.byteLength);
  await writeSplitResult(persisted as Parameters<typeof writeSplitResult>[0]);
  const roundTrip = await readSplitResult();
  assert.equal(roundTrip?.fileName, "balanced_split.zip");
  assert.equal(roundTrip?.warnings.length, 0);
  try {
    await assertZipContains(roundTrip!.data, [
      { filename: "balanced_part_001_pages_1-2.pdf", pageCount: 2 },
      { filename: "balanced_part_002_pages_3-3.pdf", pageCount: 1 },
      { filename: "balanced_part_003_pages_4-5.pdf", pageCount: 2 },
    ]);
  } catch {
    await assertZipContains(roundTrip!.data, [
      { filename: "balanced_part_001_pages_1-2.pdf", pageCount: 2 },
      { filename: "balanced_part_002_pages_3-4.pdf", pageCount: 2 },
      { filename: "balanced_part_003_pages_5-5.pdf", pageCount: 1 },
    ]);
  }
  await deleteSplitResult();
  try {
    await assertZipContains((persisted as { data: ArrayBuffer }).data, [
      { filename: "balanced_part_001_pages_1-2.pdf", pageCount: 2 },
      { filename: "balanced_part_002_pages_3-3.pdf", pageCount: 1 },
      { filename: "balanced_part_003_pages_4-5.pdf", pageCount: 2 },
    ]);
  } catch {
    await assertZipContains((persisted as { data: ArrayBuffer }).data, [
      { filename: "balanced_part_001_pages_1-2.pdf", pageCount: 2 },
      { filename: "balanced_part_002_pages_3-4.pdf", pageCount: 2 },
      { filename: "balanced_part_003_pages_5-5.pdf", pageCount: 1 },
    ]);
  }
}

{
  const inputRecord = await createSelectedPdfRecord([90, 4, 4], "oversize-begin.pdf");
  const bytes = new Uint8Array(inputRecord.data);
  const oversizedPageSize = await measureRangeSize(bytes, 1, 1);
  const trailingSize = await measureRangeSize(bytes, 2, 3);
  const { response, persisted } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: trailingSize,
  });

  assert.equal(response.result.partsCount, 2);
  assert.equal(response.result.warnings.length, 1);
  assertWarningsEqual(response.result.warnings, [
    {
      code: "SINGLE_PAGE_EXCEEDS_LIMIT",
      pageNumber: 1,
      actualGeneratedByteSize: oversizedPageSize,
      requestedMaximumByteSize: trailingSize,
      fileName: "oversize-begin_part_001_pages_1-1.pdf",
      partNumber: 1,
      oversized: true,
    },
  ]);
  assertWarningsEqual((persisted as SplitResultMetadata).warnings, response.result.warnings);
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "oversize-begin_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "oversize-begin_part_002_pages_2-3.pdf", pageCount: 2 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([4, 90, 4, 4], "oversize-middle.pdf");
  const bytes = new Uint8Array(inputRecord.data);
  const oversizedPageSize = await measureRangeSize(bytes, 2, 2);
  const trailingSize = await measureRangeSize(bytes, 3, 4);
  const { response, persisted } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: trailingSize,
  });

  assert.equal(response.result.partsCount, 3);
  assert.equal(response.result.warnings.length, 1);
  assertWarningsEqual(response.result.warnings, [
    {
      code: "SINGLE_PAGE_EXCEEDS_LIMIT",
      pageNumber: 2,
      actualGeneratedByteSize: oversizedPageSize,
      requestedMaximumByteSize: trailingSize,
      fileName: "oversize-middle_part_002_pages_2-2.pdf",
      partNumber: 2,
      oversized: true,
    },
  ]);
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "oversize-middle_part_001_pages_1-1.pdf", pageCount: 1 },
    { filename: "oversize-middle_part_002_pages_2-2.pdf", pageCount: 1 },
    { filename: "oversize-middle_part_003_pages_3-4.pdf", pageCount: 2 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([4, 4, 90], "oversize-end.pdf");
  const bytes = new Uint8Array(inputRecord.data);
  const oversizedPageSize = await measureRangeSize(bytes, 3, 3);
  const leadingSize = await measureRangeSize(bytes, 1, 2);
  const { response, persisted } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: leadingSize,
  });

  assert.equal(response.result.partsCount, 2);
  assert.equal(response.result.warnings.length, 1);
  assertWarningsEqual(response.result.warnings, [
    {
      code: "SINGLE_PAGE_EXCEEDS_LIMIT",
      pageNumber: 3,
      actualGeneratedByteSize: oversizedPageSize,
      requestedMaximumByteSize: leadingSize,
      fileName: "oversize-end_part_002_pages_3-3.pdf",
      partNumber: 2,
      oversized: true,
    },
  ]);
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "oversize-end_part_001_pages_1-2.pdf", pageCount: 2 },
    { filename: "oversize-end_part_002_pages_3-3.pdf", pageCount: 1 },
  ]);
}

await assert.rejects(
  async () =>
    createSplitZipArchive({
      inputBytes: new Uint8Array(await createComplexPdf([1], "invalid-zero")).buffer,
      strategy: {
        type: "by-max-size",
        maxPartSizeBytes: 0,
      },
    }),
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "INVALID_MAX_PART_SIZE");
    return true;
  },
);

await assert.rejects(
  async () =>
    createSplitZipArchive({
      inputBytes: new Uint8Array(await createComplexPdf([1], "invalid-nan")).buffer,
      strategy: {
        type: "by-max-size",
        maxPartSizeBytes: Number.NaN,
      },
    } as Parameters<typeof createSplitZipArchive>[0]),
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "INVALID_MAX_PART_SIZE");
    return true;
  },
);

await assert.rejects(
  async () =>
    createSplitZipArchive({
      inputBytes: new Uint8Array(await createComplexPdf([1], "invalid-malformed")).buffer,
      strategy: {
        type: "by-max-size",
      } as never,
    } as Parameters<typeof createSplitZipArchive>[0]),
  (error: unknown) => {
    assert.equal((error as SplitRuntimeError).code, "INVALID_MAX_PART_SIZE");
    return true;
  },
);

{
  let cancelAfterChecks = 4;
  let checkCount = 0;
  const inputRecord = await createSelectedPdfRecord([22, 22, 22, 22, 22, 22], "cancel-plan.pdf");
  await assert.rejects(
    async () =>
      createSplitZipArchive(
        {
          inputBytes: new Uint8Array(inputRecord.data).buffer,
          strategy: {
            type: "by-max-size",
            maxPartSizeBytes: await measureRangeSize(new Uint8Array(inputRecord.data), 1, 2),
          },
        },
        () => {
          checkCount += 1;
          return checkCount >= cancelAfterChecks;
        },
      ),
    (error: unknown) => {
      assert.equal((error as SplitRuntimeError).code, "CANCELLED");
      return true;
    },
  );
}

console.log("phase5 slice 7 max-size split assertions passed");
