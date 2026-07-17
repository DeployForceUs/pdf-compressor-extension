import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  COMPRESSION_STORAGE_QUOTA_ERROR_CODE,
  CompressionStorageError,
  deleteCompressionResult,
  normalizeCompressionPersistenceError,
  readCompressionResult,
  writeCompressionResult,
} from "../src/lib/storage/pdf-compression-db";
import { toSplitRuntimeError } from "../src/lib/pdf/split-errors";
import { completeCompressionOutcome } from "../src/lib/offscreen/compression-runtime";
import { COMPRESSED_PDF_RECORD_ID } from "../src/lib/pdf-records";
import type { CompressionResultRecord } from "../src/lib/messaging";
import type { CompressionOutcome } from "../src/lib/pdf/compressor";

function bytesToArray(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes));
}

async function createCompressionOutcome(fileName: string): Promise<CompressionOutcome> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const outputBytes = await pdf.save();
  const outputBuffer = outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength);
  const originalSize = outputBuffer.byteLength + 32;

  return {
    pageCount: 1,
    outputBytes: outputBuffer,
    result: {
      id: COMPRESSED_PDF_RECORD_ID,
      sourceRecordId: "source-record",
      fileName,
      mimeType: "application/pdf",
      originalSize,
      compressedSize: outputBuffer.byteLength,
      savedBytes: originalSize - outputBuffer.byteLength,
      savedPercent: originalSize > 0 ? (originalSize - outputBuffer.byteLength) / originalSize : 0,
      pageCount: 1,
      data: outputBuffer,
      createdAt: 1,
      updatedAt: 1,
    },
  };
}

function createCompressionResultRecord(id: string): CompressionResultRecord {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%quota-smoke\n%%EOF\n").buffer;

  return {
    id,
    sourceRecordId: "source-record",
    fileName: "quota-smoke.pdf",
    mimeType: "application/pdf",
    originalSize: bytes.byteLength,
    compressedSize: bytes.byteLength,
    savedBytes: 0,
    savedPercent: 0,
    pageCount: 1,
    data: bytes,
    createdAt: 1,
    updatedAt: 1,
  };
}

{
  const record = createCompressionResultRecord("compression-quota-normalization-smoke");

  const persisted = await writeCompressionResult(record);
  assert.ok(persisted);

  const stored = await readCompressionResult(record.id);
  assert.ok(stored);
  assert.equal(stored.id, record.id);
  assert.equal(stored.sourceRecordId, record.sourceRecordId);
  assert.equal(stored.fileName, record.fileName);
  assert.equal(stored.mimeType, record.mimeType);
  assert.equal(stored.originalSize, record.originalSize);
  assert.equal(stored.compressedSize, record.compressedSize);
  assert.equal(stored.savedBytes, record.savedBytes);
  assert.equal(stored.savedPercent, record.savedPercent);
  assert.equal(stored.pageCount, record.pageCount);
  assert.equal(stored.createdAt, record.createdAt);
  assert.equal(stored.updatedAt, persisted.updatedAt);
  assert.ok(stored.updatedAt >= record.updatedAt);
  assert.equal(stored.data.byteLength, record.data.byteLength);
  assert.deepEqual(bytesToArray(stored.data), bytesToArray(record.data));

  await deleteCompressionResult(record.id);
  assert.equal(await readCompressionResult(record.id), null);
}

{
  const quotaError = new DOMException("Quota exceeded", "QuotaExceededError");

  try {
    normalizeCompressionPersistenceError(quotaError);
    assert.fail("Quota errors must be normalized");
  } catch (error) {
    assert.ok(error instanceof CompressionStorageError);
    assert.equal((error as CompressionStorageError).code, COMPRESSION_STORAGE_QUOTA_ERROR_CODE);
    assert.equal((error as { cause?: unknown }).cause, quotaError);
  }
}

{
  const genericError = new Error("boom");

  try {
    normalizeCompressionPersistenceError(genericError);
    assert.fail("Generic errors must not be normalized as quota");
  } catch (error) {
    assert.equal(error, genericError);
  }
}

{
  const quotaMapped = toSplitRuntimeError(new DOMException("Quota exceeded", "QuotaExceededError"));
  assert.equal(quotaMapped.code, "STORAGE_QUOTA_EXCEEDED");
}

{
  const outcome = await createCompressionOutcome("quota-completion.pdf");
  assert.equal(outcome.pageCount, 1);
  assert.equal(new TextDecoder().decode(new Uint8Array(outcome.outputBytes).slice(0, 5)), "%PDF-");
  const existing = createCompressionResultRecord(COMPRESSED_PDF_RECORD_ID);
  const persistedExisting = await writeCompressionResult(existing);
  assert.ok(persistedExisting);

  const broadcasts: Array<{ type: string; [key: string]: unknown }> = [];
  const persistCalls: CompressionResultRecord[] = [];
  const sourcePdfRecord = { id: "source-record", name: "quota-completion.pdf" };

  const completion = await completeCompressionOutcome(
    outcome,
    {
      persistResult: async (record) => {
        persistCalls.push(record);
        normalizeCompressionPersistenceError(new DOMException("Quota exceeded", "QuotaExceededError"));
      },
      broadcast: (event) => {
        broadcasts.push(event);
      },
    },
    {
      recordId: outcome.result.id,
    },
  );

  assert.equal(completion.ok, false);
  if (!completion.ok) {
    assert.equal(completion.code, "STORAGE_QUOTA_EXCEEDED");
    assert.equal(completion.error, "Compression result could not be persisted because storage quota was exceeded");
  }

  assert.equal(persistCalls.length, 1);
  assert.ok(broadcasts.some((event) => event.type === "compression:error"));
  assert.ok(broadcasts.every((event) => event.type !== "compression:result"));
  assert.ok(broadcasts.every((event) => event.type !== "compression:progress" || event.stage !== "complete"));
  assert.equal(sourcePdfRecord.id, "source-record");
  assert.equal(sourcePdfRecord.name, "quota-completion.pdf");

  const stored = await readCompressionResult(COMPRESSED_PDF_RECORD_ID);
  assert.ok(stored);
  assert.equal(stored.id, existing.id);
  assert.equal(stored.sourceRecordId, existing.sourceRecordId);
  assert.equal(stored.fileName, existing.fileName);
  assert.equal(stored.mimeType, existing.mimeType);
  assert.equal(stored.originalSize, existing.originalSize);
  assert.equal(stored.compressedSize, existing.compressedSize);
  assert.equal(stored.savedBytes, existing.savedBytes);
  assert.equal(stored.savedPercent, existing.savedPercent);
  assert.equal(stored.pageCount, existing.pageCount);
  assert.equal(stored.createdAt, persistedExisting.createdAt);
  assert.equal(stored.updatedAt, persistedExisting.updatedAt);
  assert.equal(stored.data.byteLength, existing.data.byteLength);
  assert.deepEqual(bytesToArray(stored.data), bytesToArray(existing.data));
}

console.log("phase5 stabilization quota normalization assertions passed");
