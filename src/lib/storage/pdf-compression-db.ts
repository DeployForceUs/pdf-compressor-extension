import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { COMPRESSED_PDF_RECORD_ID } from "../pdf-records";
import type { CompressionResultRecord } from "../messaging";

const DB_NAME = "pdf-compressor-phase4";
const DB_VERSION = 1;
const STORE_NAME = "compression-results";
export const COMPRESSION_STORAGE_QUOTA_ERROR_CODE = "STORAGE_QUOTA_EXCEEDED" as const;

interface CompressionDbSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: CompressionResultRecord;
  };
}

type CompressionDb = Pick<IDBPDatabase<CompressionDbSchema>, "get" | "getAll" | "put" | "delete">;

const memoryStores = new Map<string, Map<string, CompressionResultRecord>>();

export class CompressionStorageError extends Error {
  readonly code: typeof COMPRESSION_STORAGE_QUOTA_ERROR_CODE;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "CompressionStorageError";
    this.code = COMPRESSION_STORAGE_QUOTA_ERROR_CODE;

    if (cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: cause,
        writable: true,
      });
    }
  }
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  );
}

export function normalizeCompressionPersistenceError(error: unknown): never {
  if (isQuotaExceededError(error)) {
    throw new CompressionStorageError(
      "Compression result could not be persisted because storage quota was exceeded",
      error,
    );
  }

  throw error;
}

function createMemoryDb(): CompressionDb {
  return {
    async get(storeName, key) {
      return memoryStores.get(storeName)?.get(String(key)) ?? undefined;
    },
    async getAll(storeName) {
      return [...(memoryStores.get(storeName)?.values() ?? [])];
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
  try {
    const existing = await db.get(STORE_NAME, record.id);
    const stored: CompressionResultRecord = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    await db.put(STORE_NAME, stored, stored.id);
    return stored;
  } catch (error) {
    normalizeCompressionPersistenceError(error);
  }
}

export async function deleteCompressionResult(recordId = COMPRESSED_PDF_RECORD_ID) {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, recordId);
  await db.delete(STORE_NAME, recordId);
  return existing !== undefined;
}

export async function cleanupExpiredCompressionResults(cutoff: number) {
  const db = await getDb();
  const records = await db.getAll(STORE_NAME);
  let deleted = 0;
  for (const record of records) {
    if (record.updatedAt <= cutoff) {
      await db.delete(STORE_NAME, record.id);
      deleted += 1;
    }
  }
  return deleted;
}
