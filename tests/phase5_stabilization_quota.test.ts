import assert from "node:assert/strict";
import { deleteCompressionResult, readCompressionResult, writeCompressionResult, normalizeCompressionPersistenceError, CompressionStorageError, COMPRESSION_STORAGE_QUOTA_ERROR_CODE } from "../src/lib/storage/pdf-compression-db";
import { toSplitRuntimeError } from "../src/lib/pdf/split-errors";
import type { CompressionResultRecord } from "../src/lib/messaging";

function bytesToArray(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes));
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

  await writeCompressionResult(record);

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
  assert.equal(stored.updatedAt, record.updatedAt);
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

console.log("phase5 stabilization quota normalization assertions passed");
