import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import { SPLIT_PDF_RECORD_ID } from "../src/lib/pdf-records";
import { createSplitZipArchive, type SplitArchiveDependencies } from "../src/lib/pdf/split-archive";
import { runSplitJob } from "../src/lib/offscreen/split-runtime";
import { deleteCompressionResult, readCompressionResult, writeCompressionResult } from "../src/lib/storage/pdf-compression-db";
import type { CompressionOutcome, CompressionRequest } from "../src/lib/pdf/compressor";
import type { PdfRecord, SplitProgressEvent, SplitResultMetadata, SplitWarning } from "../src/lib/messaging";
import type { SplitRuntimeError } from "../src/lib/pdf/split-errors";

async function createPdf(pageComplexities: number[], name: string) {
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

async function createCandidatePdf(pageCount: number, drawCount: number, label: string) {
  return createPdf(
    Array.from({ length: pageCount }, () => drawCount),
    label,
  );
}

async function createSelectedPdfRecord(pageComplexities: number[], name: string): Promise<PdfRecord> {
  const bytes = await createPdf(pageComplexities, name);
  return {
    id: `${name}-record`,
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    lastModified: 0,
    data: Array.from(bytes),
  };
}

type CompressionRunner = NonNullable<SplitArchiveDependencies["compressPart"]>;

function buildCompressionOutcome(
  request: CompressionRequest,
  outputBytes: ArrayBuffer,
  pageCount: number,
): CompressionOutcome {
  const compressedSize = outputBytes.byteLength;
  const originalSize = request.input.byteLength;

  return {
    pageCount,
    outputBytes,
    result: {
      id: request.recordId,
      sourceRecordId: request.sourceRecordId,
      fileName: request.fileName,
      mimeType: request.mimeType,
      originalSize,
      compressedSize,
      savedBytes: Math.max(0, originalSize - compressedSize),
      savedPercent: originalSize > 0 ? Math.max(0, originalSize - compressedSize) / originalSize : 0,
      pageCount,
      data: outputBytes,
      createdAt: 0,
      updatedAt: 0,
    },
  };
}

function createWorkerGateway(compressPart?: CompressionRunner) {
  return {
    split: (
      request: Parameters<typeof createSplitZipArchive>[0],
      isCancelled: Parameters<typeof createSplitZipArchive>[1],
      onProgress: Parameters<typeof createSplitZipArchive>[2],
    ) => createSplitZipArchive(request, isCancelled, onProgress, compressPart ? { compressPart } : undefined),
  };
}

async function runSplit(
  inputRecord: PdfRecord,
  strategy: Parameters<typeof runSplitJob>[1]["strategy"],
  hooks?: {
    compressPart?: CompressionRunner;
    persistResult?: (record: unknown) => Promise<unknown>;
    isCancelled?: () => boolean | Promise<boolean>;
    onProgress?: (event: SplitProgressEvent) => void | Promise<void>;
  },
) {
  const progressEvents: SplitProgressEvent[] = [];
  let persisted: unknown = null;

  const response = await runSplitJob(
    inputRecord,
    { type: "split:local", strategy, compressAfter: hooks?.compressPart !== undefined },
    {
      workerApi: createWorkerGateway(hooks?.compressPart),
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

function getCompressionWarnings(result: SplitResultMetadata) {
  return result.warnings.filter((warning) => warning.code !== "SINGLE_PAGE_EXCEEDS_LIMIT") as Exclude<
    SplitWarning,
    { code: "SINGLE_PAGE_EXCEEDS_LIMIT" }
  >[];
}

{
  const inputRecord = await createSelectedPdfRecord([24, 24, 24, 24, 24], "no-compress.pdf");
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  });

  assert.equal(response.result.compressAfterRequested, false);
  assert.equal(response.result.compressedPartsCount, 0);
  assert.equal(response.result.fallbackPartsCount, 0);
  assert.equal(response.result.originalSplitPartsSize, response.result.finalPartsSize);
  assert.equal(response.result.finalPartsSize, response.result.totalPartsSize);
  assert.equal(response.result.warnings.length, 0);
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
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "no-compress_part_001_pages_1-2.pdf", pageCount: 2 },
    { filename: "no-compress_part_002_pages_3-4.pdf", pageCount: 2 },
    { filename: "no-compress_part_003_pages_5-5.pdf", pageCount: 1 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([60, 60, 60, 60], "compressible.pdf");
  const compressCalls: CompressionRequest[] = [];
  const compressPart: CompressionRunner = async (request) => {
    compressCalls.push(request);
    const outputBytes = await createCandidatePdf(2, 0, `smaller-${compressCalls.length}`);
    return buildCompressionOutcome(request, outputBytes.buffer, 2);
  };
  const { response, progressEvents, persisted } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  }, {
    compressPart,
  });

  assert.equal(response.result.compressAfterRequested, true);
  assert.equal(response.result.compressedPartsCount, 2);
  assert.equal(response.result.fallbackPartsCount, 0);
  assert.equal(response.result.totalBytesSaved > 0, true);
  assert.equal(getCompressionWarnings(response.result).length, 0);
  assert.ok(progressEvents.some((event) => event.stage === "compressing-part"));
  assert.deepEqual(compressCalls.map((call) => call.fileName), [
    "compressible_part_001_pages_1-2.pdf",
    "compressible_part_002_pages_3-4.pdf",
  ]);
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "compressible_part_001_pages_1-2.pdf", pageCount: 2 },
    { filename: "compressible_part_002_pages_3-4.pdf", pageCount: 2 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([40, 40, 40, 40], "larger-reject.pdf");
  const compressPart: CompressionRunner = async (request) => {
    const outputBytes = await createCandidatePdf(2, 220, `larger-${request.fileName}`);
    return buildCompressionOutcome(request, outputBytes.buffer, 2);
  };
  const { response, persisted } = await runSplit(inputRecord, {
    type: "manual-ranges",
    ranges: "1-2,3-4",
  }, {
    compressPart,
  });

  assert.equal(response.result.fallbackPartsCount, 2);
  assert.equal(response.result.compressedPartsCount, 0);
  assert.deepEqual(
    getCompressionWarnings(response.result).map((warning) => warning.code),
    ["COMPRESSED_PART_NOT_SMALLER_FALLBACK", "COMPRESSED_PART_NOT_SMALLER_FALLBACK"],
  );
  await assertZipContains((persisted as { data: ArrayBuffer }).data, [
    { filename: "larger-reject_part_001_pages_1-2.pdf", pageCount: 2 },
    { filename: "larger-reject_part_002_pages_3-4.pdf", pageCount: 2 },
  ]);
}

{
  const inputRecord = await createSelectedPdfRecord([40, 40, 40, 40], "invalid-fallback.pdf");
  const compressPart: CompressionRunner = async (request) => {
    void request;
    return {
      pageCount: 2,
      outputBytes: new Uint8Array([1, 2, 3, 4, 5]).buffer,
      result: buildCompressionOutcome(
        request,
        new Uint8Array([1, 2, 3, 4, 5]).buffer,
        2,
      ).result,
    };
  };
  const { response } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  }, {
    compressPart,
  });

  assert.equal(response.result.fallbackPartsCount, 2);
  assert.deepEqual(
    getCompressionWarnings(response.result).map((warning) => warning.code),
    ["COMPRESSED_PART_INVALID_FALLBACK", "COMPRESSED_PART_INVALID_FALLBACK"],
  );
}

{
  const inputRecord = await createSelectedPdfRecord([40, 40, 40, 40], "mismatch-fallback.pdf");
  const compressPart: CompressionRunner = async (request) => {
    const outputBytes = await createCandidatePdf(3, 0, `mismatch-${request.fileName}`);
    return buildCompressionOutcome(request, outputBytes.buffer, 3);
  };
  const { response } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  }, {
    compressPart,
  });

  assert.equal(response.result.fallbackPartsCount, 2);
  assert.deepEqual(
    getCompressionWarnings(response.result).map((warning) => warning.code),
    ["COMPRESSED_PART_INVALID_FALLBACK", "COMPRESSED_PART_INVALID_FALLBACK"],
  );
}

{
  const inputRecord = await createSelectedPdfRecord([40, 40, 40, 40], "throws-fallback.pdf");
  const compressPart: CompressionRunner = async () => {
    throw new Error("synthetic compression failure");
  };
  const { response } = await runSplit(inputRecord, {
    type: "by-pages",
    pagesPerPart: 2,
  }, {
    compressPart,
  });

  assert.equal(response.result.fallbackPartsCount, 2);
  assert.deepEqual(
    getCompressionWarnings(response.result).map((warning) => warning.code),
    ["COMPRESSION_FAILED_FALLBACK", "COMPRESSION_FAILED_FALLBACK"],
  );
}

{
  const inputRecord = await createSelectedPdfRecord([120, 10, 10], "oversize-compress-after.pdf");
  const compressPart: CompressionRunner = async (request) => {
    const outputBytes = await createCandidatePdf(1, 0, `oversize-${request.fileName}`);
    return buildCompressionOutcome(request, outputBytes.buffer, 1);
  };
  const bytes = new Uint8Array(inputRecord.data);
  const trailingPdf = await PDFDocument.load(bytes);
  const trailingOnly = await PDFDocument.create();
  const copied = await trailingOnly.copyPages(trailingPdf, [1, 2]);
  for (const page of copied) {
    trailingOnly.addPage(page);
  }
  const limitBytes = (await trailingOnly.save()).byteLength;
  const { response } = await runSplit(inputRecord, {
    type: "by-max-size",
    maxPartSizeBytes: limitBytes,
  }, {
    compressPart,
  });

  assert.ok(response.result.warnings.some((warning) => warning.code === "SINGLE_PAGE_EXCEEDS_LIMIT"));
  assert.equal(response.result.compressAfterRequested, true);
  assert.equal(response.result.compressedPartsCount >= 1, true);
}

{
  let cancel = false;
  const inputRecord = await createSelectedPdfRecord([50, 50, 50, 50], "cancel-compress-after.pdf");
  const compressPart: CompressionRunner = async (request) => {
    const outputBytes = await createCandidatePdf(2, 0, `cancel-${request.fileName}`);
    return buildCompressionOutcome(request, outputBytes.buffer, 2);
  };

  await assert.rejects(
    async () =>
      runSplit(
        inputRecord,
        {
          type: "by-pages",
          pagesPerPart: 2,
        },
        {
          compressPart,
          isCancelled: () => cancel,
          onProgress: (event) => {
            if (event.stage === "compressing-part" && event.currentPart === 1) {
              cancel = true;
            }
          },
        },
      ),
    (error: unknown) => {
      assert.equal((error as SplitRuntimeError).code, "CANCELLED");
      return true;
    },
  );
}

{
  const record = {
    id: "compression-db-smoke",
    sourceRecordId: "source",
    fileName: "compression-db-smoke.pdf",
    mimeType: "application/pdf",
    originalSize: 10,
    compressedSize: 8,
    savedBytes: 2,
    savedPercent: 0.2,
    pageCount: 1,
    data: new ArrayBuffer(8),
    createdAt: 0,
    updatedAt: 0,
  };

  await writeCompressionResult(record);
  const stored = await readCompressionResult("compression-db-smoke");
  assert.equal(stored?.fileName, record.fileName);
  assert.equal(stored?.pageCount, 1);
  await deleteCompressionResult("compression-db-smoke");
  assert.equal(await readCompressionResult("compression-db-smoke"), null);
}

console.log("phase5 slice 8a compress-after assertions passed");
