import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { splitPdfByManualRanges } from "../src/lib/pdf/splitter";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([100 + index, 200 + index]);
  }

  return pdf.save();
}

async function readPageCounts(parts: Array<Uint8Array>) {
  return Promise.all(
    parts.map(async (bytes) => {
      const pdf = await PDFDocument.load(bytes);
      return pdf.getPageCount();
    }),
  );
}

async function readPageSizes(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);

  return Array.from({ length: pdf.getPageCount() }, (_, index) => {
    const page = pdf.getPage(index);
    return [page.getWidth(), page.getHeight()] as const;
  });
}

async function expectFailure(ranges: string, code: string) {
  const inputBytes = await createPdf(10);
  await assert.rejects(
    () =>
      splitPdfByManualRanges({
        inputBytes,
        ranges,
      }),
    (error: unknown) => (error as { code?: string }).code === code,
  );
}

{
  const inputBytes = await createPdf(30);
  const result = await splitPdfByManualRanges({
    inputBytes,
    ranges: "1-5,8,10-15",
    documentName: "manual-selection.pdf",
  });

  assert.equal(result.sourcePageCount, 30);
  assert.equal(result.parts.length, 3);
  assert.deepEqual(
    result.parts.map((part) => part.range),
    [
      { startPage: 1, endPage: 5 },
      { startPage: 8, endPage: 8 },
      { startPage: 10, endPage: 15 },
    ],
  );
  assert.deepEqual(
    result.parts.map((part) => part.filename),
    [
      "manual-selection_part_001_pages_1-5.pdf",
      "manual-selection_part_002_pages_8-8.pdf",
      "manual-selection_part_003_pages_10-15.pdf",
    ],
  );
  assert.deepEqual(await readPageCounts(result.parts.map((part) => part.bytes)), [5, 1, 6]);
  assert.deepEqual(await readPageSizes(result.parts[0].bytes), [
    [100, 200],
    [101, 201],
    [102, 202],
    [103, 203],
    [104, 204],
  ]);
  assert.deepEqual(await readPageSizes(result.parts[1].bytes), [[107, 207]]);
  assert.deepEqual(await readPageSizes(result.parts[2].bytes), [
    [109, 209],
    [110, 210],
    [111, 211],
    [112, 212],
    [113, 213],
    [114, 214],
  ]);
}

{
  const inputBytes = await createPdf(20);
  const result = await splitPdfByManualRanges({
    inputBytes,
    ranges: "4,6-7,9",
  });

  assert.deepEqual(
    result.parts.map((part) => part.range),
    [
      { startPage: 4, endPage: 4 },
      { startPage: 6, endPage: 7 },
      { startPage: 9, endPage: 9 },
    ],
  );
}

{
  const inputBytes = await createPdf(8);
  const result = await splitPdfByManualRanges({
    inputBytes,
    ranges: "1-2,3-4,5-8",
  });

  assert.deepEqual(
    result.parts.map((part) => part.range),
    [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 4 },
      { startPage: 5, endPage: 8 },
    ],
  );
  assert.deepEqual(await readPageCounts(result.parts.map((part) => part.bytes)), [2, 2, 4]);
}

await expectFailure("", "INVALID_PAGE_RANGE");
await expectFailure("1-5,,6-10", "INVALID_PAGE_RANGE");
await expectFailure("5-1", "INVALID_PAGE_RANGE");
await expectFailure("1-3,3-5", "OVERLAPPING_PAGE_RANGES");
await expectFailure("1,1", "DUPLICATE_PAGE");
await expectFailure("0-2", "INVALID_PAGE_RANGE");
await expectFailure("9-12", "PAGE_RANGE_OUT_OF_BOUNDS");
await expectFailure("1-2, 4-4, 3-3", "OVERLAPPING_PAGE_RANGES");

console.log("phase5 slice 4 manual selection assertions passed");
