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

let dbPromise: Promise<IDBPDatabase<CompressionDbSchema>> | null = null;

function getDb() {
  dbPromise ??= openDB<CompressionDbSchema>(DB_NAME, DB_VERSION, {
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
