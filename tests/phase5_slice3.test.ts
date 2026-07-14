import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { splitPdfByPages } from "../src/lib/pdf/splitter";

async function createPdf(pageDimensions: Array<[number, number]>) {
  const pdf = await PDFDocument.create();

  for (const [width, height] of pageDimensions) {
    pdf.addPage([width, height]);
  }

  return pdf.save();
}

async function getPageDimensions(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);

  return Array.from({ length: pdf.getPageCount() }, (_, index) => {
    const page = pdf.getPage(index);
    return [page.getWidth(), page.getHeight()] as const;
  });
}

{
  const inputBytes = await createPdf([[101, 201]]);
  const result = await splitPdfByPages({
    inputBytes,
    pagesPerPart: 3,
  });

  assert.equal(result.sourcePageCount, 1);
  assert.equal(result.parts.length, 1);
  assert.deepEqual(result.parts[0].range, { startPage: 1, endPage: 1 });
  assert.equal(result.parts[0].pageCount, 1);
  assert.equal(result.parts[0].filename, "document_part_001_pages_1-1.pdf");
  assert.deepEqual(await getPageDimensions(result.parts[0].bytes), [[101, 201]]);
}

{
  const inputBytes = await createPdf([
    [101, 201],
    [102, 202],
    [103, 203],
    [104, 204],
  ]);
  const result = await splitPdfByPages({
    inputBytes,
    pagesPerPart: 2,
    documentName: "quarterly-report.pdf",
  });

  assert.equal(result.sourcePageCount, 4);
  assert.equal(result.parts.length, 2);
  assert.deepEqual(
    result.parts.map((part) => part.range),
    [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 4 },
    ],
  );
  assert.deepEqual(
    result.parts.map((part) => part.filename),
    [
      "quarterly-report_part_001_pages_1-2.pdf",
      "quarterly-report_part_002_pages_3-4.pdf",
    ],
  );
  assert.deepEqual(await getPageDimensions(result.parts[0].bytes), [
    [101, 201],
    [102, 202],
  ]);
  assert.deepEqual(await getPageDimensions(result.parts[1].bytes), [
    [103, 203],
    [104, 204],
  ]);
}

{
  const inputDimensions = [
    [111, 211],
    [112, 212],
    [113, 213],
    [114, 214],
    [115, 215],
  ] as const;
  const inputBytes = await createPdf(inputDimensions);
  const result = await splitPdfByPages({
    inputBytes,
    pagesPerPart: 2,
  });

  assert.equal(result.sourcePageCount, 5);
  assert.equal(result.parts.length, 3);
  assert.deepEqual(
    result.parts.map((part) => part.range),
    [
      { startPage: 1, endPage: 2 },
      { startPage: 3, endPage: 4 },
      { startPage: 5, endPage: 5 },
    ],
  );
  assert.deepEqual(
    result.parts.map((part) => part.filename),
    [
      "document_part_001_pages_1-2.pdf",
      "document_part_002_pages_3-4.pdf",
      "document_part_003_pages_5-5.pdf",
    ],
  );

  const outputDimensions = await Promise.all(result.parts.map((part) => getPageDimensions(part.bytes)));
  assert.deepEqual(outputDimensions.flat(), inputDimensions);
  assert.deepEqual(result.parts.map((part) => part.pageCount), [2, 2, 1]);
}

console.log("phase5 slice 3 splitter assertions passed");
