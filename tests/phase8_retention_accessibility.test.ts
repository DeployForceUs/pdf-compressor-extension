import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import type { CompressionResultRecord, PdfRecord, SplitArtifactRecord, SplitResultBundle } from "../src/lib/messaging";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 14, 22, 0, 0);
const oldNow = now - DAY - 1;
const originalDateNow = Date.now;

const { writePdfRecord, readPdfRecord } = await import("../src/lib/storage/pdf-records-db");
const { writeCompressionResult, readCompressionResult } = await import("../src/lib/storage/pdf-compression-db");
const {
  writeSplitResultBundle,
  readSplitResultBundle,
  readSplitArtifact,
} = await import("../src/lib/storage/pdf-split-bundles-db");
const { cleanupExpiredPdfData, PDF_RETENTION_MS } = await import("../src/lib/storage/pdf-retention");

assert.equal(PDF_RETENTION_MS, DAY);

Date.now = () => oldNow;
try {
  const source: PdfRecord = {
    id: "selected-pdf",
    name: "source.pdf",
    size: 4,
    type: "application/pdf",
    lastModified: 1,
    data: [37, 80, 68, 70],
  };
  await writePdfRecord(source);

  const compression: CompressionResultRecord = {
    id: "compressed-pdf",
    sourceRecordId: source.id,
    fileName: "source-compressed.pdf",
    mimeType: "application/pdf",
    originalSize: 4,
    compressedSize: 4,
    savedBytes: 0,
    savedPercent: 0,
    pageCount: 1,
    data: new Uint8Array([37, 80, 68, 70]).buffer,
    createdAt: oldNow,
    updatedAt: oldNow,
  };
  await writeCompressionResult(compression);

  const artifact: SplitArtifactRecord = {
    id: "split-artifact-1",
    bundleId: "split-pdf",
    kind: "pdf",
    filename: "part-1.pdf",
    mimeType: "application/pdf",
    byteLength: 4,
    partNumber: 1,
    pageStart: 1,
    pageEnd: 1,
    status: "complete",
    data: new Uint8Array([37, 80, 68, 70]).buffer,
    createdAt: oldNow,
    updatedAt: oldNow,
  };
  const bundle: SplitResultBundle = {
    id: "split-pdf",
    sourceRecordId: source.id,
    sourceFileName: source.name,
    outputMode: "individual-pdfs",
    strategy: { kind: "by-pages", pagesPerPart: 1 },
    partsCount: 1,
    originalSize: 4,
    totalArtifactSize: 4,
    warnings: [],
    artifactIds: [artifact.id],
    compressAfterRequested: false,
    originalSplitPartsSize: 4,
    finalPartsSize: 4,
    compressedPartsCount: 0,
    fallbackPartsCount: 0,
    totalBytesSaved: 0,
    status: "complete",
    createdAt: oldNow,
    updatedAt: oldNow,
  };
  await writeSplitResultBundle(bundle, [artifact]);
} finally {
  Date.now = originalDateNow;
}

const deleted = await cleanupExpiredPdfData(now);
assert.deepEqual(deleted, {
  cutoff: now - DAY,
  sourceRecordsDeleted: 1,
  compressionResultsDeleted: 1,
  splitBundlesDeleted: 1,
});
assert.equal(await readPdfRecord("selected-pdf"), null);
assert.equal(await readCompressionResult(), null);
assert.equal(await readSplitResultBundle(), null);
assert.equal(await readSplitArtifact("split-artifact-1"), null);

const secondPass = await cleanupExpiredPdfData(now);
assert.equal(secondPass.sourceRecordsDeleted, 0);
assert.equal(secondPass.compressionResultsDeleted, 0);
assert.equal(secondPass.splitBundlesDeleted, 0);

const sourceDb = await openDB("pdf-compressor-phase1", 2);
await sourceDb.put("binary-records", {
  id: "selected-pdf",
  name: "legacy.pdf",
  size: 4,
  type: "application/pdf",
  lastModified: 1,
  data: [37, 80, 68, 70],
});
sourceDb.close();

const legacyPass = await cleanupExpiredPdfData(now);
assert.equal(legacyPass.sourceRecordsDeleted, 0);
const migratedLegacy = await readPdfRecord("selected-pdf");
assert.equal(migratedLegacy?.updatedAt, now);
assert.equal((await cleanupExpiredPdfData(now + DAY + 1)).sourceRecordsDeleted, 1);

const popupSource = await readFile(new URL("../src/entrypoints/popup/main.tsx", import.meta.url), "utf8");
const popupCss = await readFile(new URL("../src/styles/popup.css", import.meta.url), "utf8");
assert.doesNotMatch(popupSource, /role="tablist"/);
assert.match(popupSource, /role="group" aria-label=\{t\("split\.strategy"\)\}/);
assert.match(popupSource, /event\.key !== "Escape"/);
assert.match(popupSource, /aria-label=\{t\("compression\.progressLabel"\)\}/);
assert.match(popupSource, /aria-label=\{t\("split\.progressLabel"\)\}/);
assert.match(popupCss, /:focus-visible/);
assert.match(popupCss, /prefers-color-scheme: light/);
assert.match(popupCss, /prefers-reduced-motion: reduce/);

console.info("phase8 retention and accessibility assertions passed");
