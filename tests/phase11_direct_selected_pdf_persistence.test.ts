import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { persistSelectedPdfRecord } from "../src/entrypoints/popup/selected-pdf-persistence";
import { deletePdfRecord, readPdfRecord, writePdfRecord } from "../src/lib/storage/pdf-records-db";
import type { PdfRecord } from "../src/lib/messaging";

const record: PdfRecord = {
  id: `direct-selected-pdf-${Date.now()}`,
  name: "small-test.pdf",
  size: 8,
  type: "application/pdf",
  lastModified: 123,
  pageCount: 1,
  data: [37, 80, 68, 70, 45, 49, 46, 55],
};

try {
  const result = await persistSelectedPdfRecord(record, {
    store: async (selectedRecord) => {
      const stored = await writePdfRecord(selectedRecord);
      return {
        ok: true,
        recordId: stored.id,
        byteLength: stored.data.length,
      };
    },
    read: async (recordId) => {
      const stored = await readPdfRecord(recordId);
      return {
        ok: true,
        recordId,
        record: stored,
        byteLength: stored?.data.length ?? 0,
      };
    },
  });

  assert.equal(result.storeResponse.recordId, record.id);
  assert.equal(result.storeResponse.byteLength, record.data.length);
  assert.equal(result.readBack.record?.name, record.name);
  assert.deepEqual(result.readBack.record?.data, record.data);
  assert.equal(result.readBack.record?.pageCount, record.pageCount);
} finally {
  await deletePdfRecord(record.id);
}

console.log("phase11 direct selected PDF persistence assertions passed");
