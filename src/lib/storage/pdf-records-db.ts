import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PdfRecord } from "../messaging";

const DB_NAME = "pdf-compressor-phase1";
const DB_VERSION = 2;
const STORE_NAME = "binary-records";

interface PdfRecordsDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: PdfRecord;
  };
}

type PdfRecordsDb = Pick<IDBPDatabase<PdfRecordsDbSchema>, "get" | "getAll" | "put" | "delete">;

const memoryStores = new Map<string, Map<string, PdfRecord>>();

function createMemoryDb(): PdfRecordsDb {
  return {
    async get(storeName, key) {
      return memoryStores.get(storeName)?.get(String(key)) ?? undefined;
    },
    async getAll(storeName) {
      return [...(memoryStores.get(storeName)?.values() ?? [])];
    },
    async put(storeName, value, key) {
      const store = memoryStores.get(storeName) ?? new Map<string, PdfRecord>();
      const resolvedKey = key ?? value.id;
      store.set(String(resolvedKey), value);
      memoryStores.set(storeName, store);
      return typeof resolvedKey === "string" ? resolvedKey : value.id;
    },
    async delete(storeName, key) {
      memoryStores.get(storeName)?.delete(String(key));
    },
  };
}

let dbPromise: Promise<PdfRecordsDb> | null = null;

function getDb() {
  dbPromise ??=
    typeof indexedDB === "undefined"
      ? Promise.resolve(createMemoryDb())
      : openDB<PdfRecordsDbSchema>(DB_NAME, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains(STORE_NAME)) {
              database.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
          },
        });

  return dbPromise;
}

export async function writePdfRecord(record: PdfRecord): Promise<PdfRecord> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, record.id);
  const now = Date.now();
  const stored: PdfRecord = {
    ...record,
    data: record.data instanceof Uint8Array
      ? record.data.slice()
      : Uint8Array.from(record.data),
    createdAt: record.createdAt ?? existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.put(STORE_NAME, stored);
  return stored;
}

export async function cleanupExpiredPdfRecords(cutoff: number, now = Date.now()) {
  const db = await getDb();
  const records = await db.getAll(STORE_NAME);
  let deleted = 0;

  for (const record of records) {
    if (record.updatedAt === undefined) {
      await db.put(STORE_NAME, { ...record, createdAt: record.createdAt ?? now, updatedAt: now });
    } else if (record.updatedAt <= cutoff) {
      await db.delete(STORE_NAME, record.id);
      deleted += 1;
    }
  }

  return deleted;
}

export async function readPdfRecord(recordId: string): Promise<PdfRecord | null> {
  const db = await getDb();
  return ((await db.get(STORE_NAME, recordId)) as PdfRecord | undefined) ?? null;
}

export async function deletePdfRecord(recordId: string): Promise<boolean> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, recordId);
  await db.delete(STORE_NAME, recordId);
  return existing !== undefined;
}
