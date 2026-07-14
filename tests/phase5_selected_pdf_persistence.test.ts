import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { persistSelectedPdfRecord } from "../src/entrypoints/popup/selected-pdf-persistence";

const DB_NAME = "pdf-compressor-phase1";
const STORE_NAME = "binary-records";

function makePdfRecord(overrides: Partial<{
  id: string;
  name: string;
  size: number;
  type: string | null;
  lastModified: number;
  pageCount: number | null;
  data: number[];
}> = {}) {
  return {
    id: "selected-pdf",
    name: "example.pdf",
    size: 4,
    type: "application/pdf",
    lastModified: 123,
    pageCount: 7,
    data: [37, 80, 68, 70],
    ...overrides,
  };
}

async function importRecordsDb(tag: string) {
  return import(`../src/lib/storage/pdf-records-db.ts?${tag}=${Date.now()}`);
}

async function createExistingDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

{
  const { writePdfRecord, readPdfRecord, deletePdfRecord } = await importRecordsDb("fresh");
  const record = makePdfRecord();

  await assert.doesNotReject(() => writePdfRecord(record));

  const readBack = await readPdfRecord(record.id);
  assert.ok(readBack);
  assert.equal(readBack?.name, record.name);
  assert.equal(readBack?.data.length, record.data.length);
  assert.equal(readBack?.pageCount, record.pageCount);

  const reopened = await importRecordsDb("reopened");
  const reopenedRead = await reopened.readPdfRecord(record.id);
  assert.ok(reopenedRead);
  assert.equal(reopenedRead?.name, record.name);
  assert.equal(reopenedRead?.data.length, record.data.length);
  assert.equal(reopenedRead?.pageCount, record.pageCount);

  assert.equal(await deletePdfRecord(record.id), true);
  assert.equal(await reopened.readPdfRecord(record.id), null);
}

{
  await createExistingDatabase();

  const { writePdfRecord, readPdfRecord, deletePdfRecord } = await importRecordsDb("existing");
  const record = makePdfRecord({
    name: "existing.pdf",
    pageCount: 12,
    data: [1, 2, 3, 4, 5, 6],
    size: 6,
  });

  await assert.doesNotReject(() => writePdfRecord(record));

  const readBack = await readPdfRecord(record.id);
  assert.ok(readBack);
  assert.equal(readBack?.name, "existing.pdf");
  assert.equal(readBack?.data.length, 6);
  assert.equal(readBack?.pageCount, 12);

  assert.equal(await deletePdfRecord(record.id), true);
  assert.equal(await readPdfRecord(record.id), null);
}

{
  let readCalls = 0;
  await assert.rejects(
    () =>
      persistSelectedPdfRecord(makePdfRecord(), {
        store: async () => ({ ok: false, error: "selected pdf store failed" }),
        read: async () => {
          readCalls += 1;
          return { ok: true, record: null, recordId: "selected-pdf", byteLength: 0 };
        },
      }),
    (error: unknown) => error instanceof Error && error.message === "selected pdf store failed",
  );

  assert.equal(readCalls, 0);
}

console.log("phase5 selected pdf persistence assertions passed");
