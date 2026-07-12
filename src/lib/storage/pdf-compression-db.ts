import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { COMPRESSED_PDF_RECORD_ID } from "../pdf-records";
import type { CompressionResultRecord } from "../messaging";

const DB_NAME = "pdf-compressor-phase4";
const DB_VERSION = 1;
const STORE_NAME = "compression-results";

interface CompressionDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: CompressionResultRecord;
  };
}

type CompressionDb = Pick<IDBPDatabase<CompressionDbSchema>, "get" | "put" | "delete">;

const memoryStores = new Map<string, Map<string, CompressionResultRecord>>();

function createMemoryDb(): CompressionDb {
  return {
    async get(storeName, key) {
      return memoryStores.get(storeName)?.get(String(key)) ?? undefined;
    },
    async put(storeName, value, key) {
      const store = memoryStores.get(storeName) ?? new Map<string, CompressionResultRecord>();
      store.set(String(key), value);
      memoryStores.set(storeName, store);
      return typeof key === "string" ? key : value.id;
    },
    async delete(storeName, key) {
      memoryStores.get(storeName)?.delete(String(key));
    },
  };
}

let dbPromise: Promise<CompressionDb> | null = null;

function getDb() {
  dbPromise ??=
    typeof indexedDB === "undefined"
      ? Promise.resolve(createMemoryDb())
      : openDB<CompressionDbSchema>(DB_NAME, DB_VERSION, {
          upgrade(database) {
            if (!database.objectStoreNames.contains(STORE_NAME)) {
              database.createObjectStore(STORE_NAME);
            }
          },
        });

  return dbPromise;
}

export async function readCompressionResult(recordId = COMPRESSED_PDF_RECORD_ID) {
  const db = await getDb();
  return (await db.get(STORE_NAME, recordId)) ?? null;
}

export async function writeCompressionResult(record: CompressionResultRecord) {
  const db = await getDb();
  await db.put(STORE_NAME, record, record.id);
  return record;
}

export async function deleteCompressionResult(recordId = COMPRESSED_PDF_RECORD_ID) {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, recordId);
  await db.delete(STORE_NAME, recordId);
  return existing !== undefined;
}
