import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import type { SplitResultRecord } from "../messaging";
import { SplitRuntimeError } from "../pdf/split-errors";

const DB_NAME = "pdf-compressor-phase5";
const DB_VERSION = 1;
const STORE_NAME = "split-results";

interface SplitResultsDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: SplitResultRecord;
  };
}

type SplitResultsDb = Pick<IDBPDatabase<SplitResultsDbSchema>, "get" | "put" | "delete">;

const memoryStores = new Map<string, Map<string, SplitResultRecord>>();

function createMemoryDb(): SplitResultsDb {
  return {
    async get(storeName, key) {
      return memoryStores.get(storeName)?.get(String(key)) ?? undefined;
    },
    async put(storeName, value, key) {
      const store = memoryStores.get(storeName) ?? new Map<string, SplitResultRecord>();
      store.set(String(key), value);
      memoryStores.set(storeName, store);
      return typeof key === "string" ? key : value.id;
    },
    async delete(storeName, key) {
      memoryStores.get(storeName)?.delete(String(key));
    },
  };
}

let dbPromise: Promise<SplitResultsDb> | null = null;

function getDb() {
  dbPromise ??=
    typeof indexedDB === "undefined"
      ? Promise.resolve(createMemoryDb())
      : openDB<SplitResultsDbSchema>(DB_NAME, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains(STORE_NAME)) {
              database.createObjectStore(STORE_NAME);
            }
          },
        });

  return dbPromise;
}

function normalizePersistenceError(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  ) {
    throw new SplitRuntimeError("STORAGE_QUOTA_EXCEEDED", "Split result could not be persisted because storage quota was exceeded");
  }

  throw error;
}

export async function readSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  const db = await getDb();
  return (await db.get(STORE_NAME, recordId)) ?? null;
}

export async function writeSplitResult(record: SplitResultRecord): Promise<SplitResultRecord> {
  const db = await getDb();
  try {
    await db.put(STORE_NAME, record, record.id);
    return record;
  } catch (error) {
    normalizePersistenceError(error);
  }

  return record;
}

export async function deleteSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, recordId);
  await db.delete(STORE_NAME, recordId);
  return existing !== undefined;
}
