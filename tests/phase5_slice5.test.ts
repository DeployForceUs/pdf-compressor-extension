import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import { splitPdfByPages } from "../src/lib/pdf/splitter";
import { zipPdfParts } from "../src/lib/archive/zip-parts";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([100 + index, 200 + index]);
  }

  return pdf.save();
}

async function assertZipContainsValidPdfs(zipBytes: Uint8Array, expectedFilenames: string[]) {
  const entries = unzipSync(zipBytes);
  assert.deepEqual(Object.keys(entries), expectedFilenames);

  for (const filename of expectedFilenames) {
    const pdf = await PDFDocument.load(entries[filename]);
    assert.ok(pdf.getPageCount() >= 1);
  }
}

async function expectFailure(parts: Array<{ filename: string; bytes: Uint8Array | ArrayBuffer }>, code: string) {
  await assert.rejects(
    () => zipPdfParts(parts),
    (error: unknown) => (error as { code?: string }).code === code,
  );
}

{
  const split = await splitPdfByPages({
    inputBytes: await createPdf(2),
    pagesPerPart: 10,
    documentName: "one-part.pdf",
  });
  const archive = await zipPdfParts(split.parts);

  assert.equal(archive.entryCount, 1);
  assert.deepEqual(archive.filenames, ["one-part_part_001_pages_1-2.pdf"]);
  assert.ok(archive.zipBytes.byteLength > 0);
  await assertZipContainsValidPdfs(archive.zipBytes, archive.filenames);
}

{
  const split = await splitPdfByPages({
    inputBytes: await createPdf(7),
    pagesPerPart: 3,
    documentName: "multi-part.pdf",
  });
  const archive = await zipPdfParts(split.parts);

  assert.equal(archive.entryCount, 3);
  assert.deepEqual(archive.filenames, [
    "multi-part_part_001_pages_1-3.pdf",
    "multi-part_part_002_pages_4-6.pdf",
    "multi-part_part_003_pages_7-7.pdf",
  ]);
  await assertZipContainsValidPdfs(archive.zipBytes, archive.filenames);
}

{
  const split = await splitPdfByPages({
    inputBytes: await createPdf(13),
    pagesPerPart: 2,
    documentName: "many-parts.pdf",
  });
  const archive = await zipPdfParts(split.parts);

  assert.equal(archive.entryCount, 7);
  assert.equal(archive.filenames.length, 7);
  await assertZipContainsValidPdfs(archive.zipBytes, archive.filenames);
}

await expectFailure([], "EMPTY_PART_LIST");
await expectFailure(
  [
    { filename: "dup.pdf", bytes: await createPdf(1) },
    { filename: "dup.pdf", bytes: await createPdf(1) },
  ],
  "DUPLICATE_FILENAME",
);
await expectFailure([{ filename: "", bytes: await createPdf(1) }], "INVALID_PART");
await expectFailure([{ filename: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) }], "INVALID_PART");

console.log("phase5 slice 5 zip packaging assertions passed");
