import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import mupdf from "mupdf";
import { loadSplitSourceDocument } from "../src/lib/pdf/split-source-loader";
import { createSplitZipArchive } from "../src/lib/pdf/split-archive";
import { runSplitJob } from "../src/lib/offscreen/split-runtime";
import type { PdfRecord, SplitProgressEvent } from "../src/lib/messaging";
import { SplitRuntimeError } from "../src/lib/pdf/split-errors";

const CANON_PATH =
  "/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf";
const PASSWORD_PROTECTED_FIXTURE = "/private/tmp/phase5-password-protected-fixture.pdf";
const CANON_STEM = "Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed_1";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([72, 72]);
    page.drawText(String(index + 1), { font, size: 8, x: 6, y: 36 });
  }

  return pdf.save();
}

async function ensurePasswordProtectedFixture() {
  if (existsSync(PASSWORD_PROTECTED_FIXTURE)) {
    return;
  }

  const script = `
from pathlib import Path
from pypdf import PdfWriter

out = Path(${JSON.stringify(PASSWORD_PROTECTED_FIXTURE)})
writer = PdfWriter()
writer.add_blank_page(width=72, height=72)
writer.encrypt("secret")
with out.open("wb") as handle:
    writer.write(handle)
`;

  execFileSync("python3", ["-c", script]);
}

async function readCanonBytes() {
  return new Uint8Array(await readFile(CANON_PATH));
}

async function readPasswordProtectedBytes() {
  await ensurePasswordProtectedFixture();
  return new Uint8Array(await readFile(PASSWORD_PROTECTED_FIXTURE));
}

async function assertPdfPart(bytes: Uint8Array, expectedPageCount: number) {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");

  const reopened = await PDFDocument.load(bytes);
  assert.equal(reopened.getPageCount(), expectedPageCount);

  const document = mupdf.Document.openDocument(bytes);
  assert.equal(document.needsPassword(), false);
  assert.equal(document.countPages(), expectedPageCount);
}

async function assertZipArchive(
  zipBytes: ArrayBuffer,
  expectedEntries: Array<{ filename: string; pageCount: number }>,
) {
  const entries = unzipSync(new Uint8Array(zipBytes));
  assert.deepEqual(Object.keys(entries), expectedEntries.map((entry) => entry.filename));

  let totalPages = 0;
  for (const entry of expectedEntries) {
    const bytes = entries[entry.filename];
    await assertPdfPart(bytes, entry.pageCount);
    totalPages += entry.pageCount;
  }

  return totalPages;
}

async function createSelectedPdfRecord(bytes: Uint8Array, name: string): Promise<PdfRecord> {
  return {
    id: `${name}-record`,
    name,
    size: bytes.byteLength,
    type: "application/pdf",
    lastModified: 0,
    data: Array.from(bytes),
  };
}

async function loadSourceWithSpy(bytes: Uint8Array) {
  let loadMuPdfCalls = 0;
  const result = await loadSplitSourceDocument(bytes, {
    loadMuPdf: async () => {
      loadMuPdfCalls += 1;
      return mupdf;
    },
  });

  return { result, loadMuPdfCalls };
}

const testSplitDeps = {
  loadMuPdf: async () => mupdf,
};

{
  const bytes = await createPdf(1);
  let loadMuPdfCalls = 0;
  const result = await loadSplitSourceDocument(bytes, {
    loadMuPdf: async () => {
      loadMuPdfCalls += 1;
      return mupdf;
    },
  });

  assert.equal(result.encrypted, false);
  assert.equal(result.pdfDocument.getPageCount(), 1);
  assert.equal(loadMuPdfCalls, 0);
}

{
  const bytes = await readCanonBytes();
  const { result, loadMuPdfCalls } = await loadSourceWithSpy(bytes);

  assert.equal(result.encrypted, true);
  assert.equal(result.pdfDocument.getPageCount(), 220);
  assert.equal(loadMuPdfCalls, 1);
}

{
  const bytes = await readPasswordProtectedBytes();
  await assert.rejects(
    () =>
      loadSplitSourceDocument(bytes, {
        loadMuPdf: async () => mupdf,
      }),
    (error: unknown) => (error as SplitRuntimeError).code === "ENCRYPTED_PDF",
  );
}

{
  const malformed = new TextEncoder().encode("definitely not a pdf");
  let loadMuPdfCalls = 0;

  await assert.rejects(
    () =>
      loadSplitSourceDocument(malformed, {
        loadMuPdf: async () => {
          loadMuPdfCalls += 1;
          return mupdf;
        },
      }),
    (error: unknown) => (error as SplitRuntimeError).code === "INVALID_PDF",
  );

  assert.equal(loadMuPdfCalls, 0);
}

{
  const inputBytes = await readCanonBytes();
  const result = await createSplitZipArchive({
    inputBytes: inputBytes.buffer.slice(0),
    strategy: {
      type: "by-pages",
      pagesPerPart: 20,
    },
    documentName: CANON_PATH.split("/").at(-1),
  }, undefined, undefined, testSplitDeps);

  assert.equal(result.result.partsCount, 11);
  assert.equal(result.result.fileName, `${CANON_STEM}_split.zip`);
  assert.equal(
    await assertZipArchive(
      result.zipBytes,
      Array.from({ length: 11 }, (_, index) => {
        const partNumber = String(index + 1).padStart(3, "0");
        const startPage = index * 20 + 1;
        const endPage = index === 10 ? 220 : startPage + 19;
        return {
          filename: `${CANON_STEM}_part_${partNumber}_pages_${startPage}-${endPage}.pdf`,
          pageCount: endPage - startPage + 1,
        };
      }),
    ),
    220,
  );
}

{
  const inputBytes = await readCanonBytes();
  const result = await createSplitZipArchive({
    inputBytes: inputBytes.buffer.slice(0),
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes: 1 * 1024 * 1024,
    },
    documentName: CANON_PATH.split("/").at(-1),
  }, undefined, undefined, testSplitDeps);

  const entries = unzipSync(new Uint8Array(result.zipBytes));
  const filenames = Object.keys(entries);
  assert.equal(filenames.length > 1, true);

  let totalPages = 0;
  for (const filename of filenames) {
    const part = await PDFDocument.load(entries[filename]);
    totalPages += part.getPageCount();
    const document = mupdf.Document.openDocument(entries[filename]);
    assert.equal(document.needsPassword(), false);
    assert.equal(document.countPages(), part.getPageCount());
  }

  assert.equal(totalPages, 220);
}

{
  const inputBytes = await readCanonBytes();
  const result = await createSplitZipArchive({
    inputBytes: inputBytes.buffer.slice(0),
    strategy: {
      type: "manual-ranges",
      ranges: "1-5,6-12,13,14-30",
    },
    documentName: CANON_PATH.split("/").at(-1),
  }, undefined, undefined, testSplitDeps);

  assert.equal(result.result.partsCount, 4);
  assert.equal(
    await assertZipArchive(result.zipBytes, [
      {
        filename: `${CANON_STEM}_part_001_pages_1-5.pdf`,
        pageCount: 5,
      },
      {
        filename: `${CANON_STEM}_part_002_pages_6-12.pdf`,
        pageCount: 7,
      },
      {
        filename: `${CANON_STEM}_part_003_pages_13-13.pdf`,
        pageCount: 1,
      },
      {
        filename: `${CANON_STEM}_part_004_pages_14-30.pdf`,
        pageCount: 17,
      },
    ]),
    30,
  );
}

{
  const inputBytes = await readCanonBytes();
  const compressCalls: number[] = [];
  const result = await createSplitZipArchive(
    {
      inputBytes: inputBytes.buffer.slice(0),
      strategy: {
        type: "by-pages",
        pagesPerPart: 20,
      },
      documentName: CANON_PATH.split("/").at(-1),
      compressAfter: true,
    },
    undefined,
    undefined,
    {
      compressPart: async (request) => {
        compressCalls.push(request.input.byteLength);
        const source = await PDFDocument.load(new Uint8Array(request.input));
        const output = await PDFDocument.create();
        for (let index = 0; index < source.getPageCount(); index += 1) {
          output.addPage([72, 72]);
        }
        const outputBytes = await output.save();
        return {
          pageCount: source.getPageCount(),
          outputBytes: outputBytes.buffer.slice(0),
          result: {
            id: request.recordId,
            sourceRecordId: request.sourceRecordId,
            fileName: request.fileName,
            mimeType: request.mimeType,
            originalSize: request.input.byteLength,
            compressedSize: outputBytes.byteLength,
            savedBytes: request.input.byteLength - outputBytes.byteLength,
            savedPercent: request.input.byteLength > 0 ? (request.input.byteLength - outputBytes.byteLength) / request.input.byteLength : 0,
            pageCount: source.getPageCount(),
            data: outputBytes.buffer.slice(0),
            createdAt: 0,
            updatedAt: 0,
          },
        };
      },
      loadMuPdf: async () => mupdf,
    },
  );

  assert.equal(result.result.partsCount, 11);
  assert.equal(result.result.compressAfterRequested, true);
  assert.equal(result.result.compressedPartsCount, 11);
  assert.equal(result.result.fallbackPartsCount, 0);
  assert.equal(compressCalls.length, 11);
}

{
  const bytes = await readPasswordProtectedBytes();
  const inputRecord = await createSelectedPdfRecord(bytes, "locked.pdf");
  let persistCalls = 0;

  await assert.rejects(
    () =>
      runSplitJob(
        inputRecord,
        {
          strategy: {
            type: "by-pages",
            pagesPerPart: 1,
          },
          compressAfter: false,
        },
        {
          workerApi: {
            split: (request, isCancelled, onProgress) => createSplitZipArchive(request, isCancelled, onProgress, testSplitDeps),
          },
          persistResult: async (record) => {
            persistCalls += 1;
            return record;
          },
          isCancelled: async () => false,
          onProgress: async (_event: SplitProgressEvent) => undefined,
        },
      ),
    (error: unknown) => (error as SplitRuntimeError).code === "ENCRYPTED_PDF",
  );

  assert.equal(persistCalls, 0);
}

console.log("phase5 slice 9 passwordless encrypted split assertions passed");
