import { openDB, type DBSchema } from "idb";

const DB_NAME = "pdf-compressor-phase1";
const DB_VERSION = 1;
const STORE_NAME = "binary-records";

interface Phase1Db extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: ArrayBuffer;
  };
}

async function getDb() {
  return openDB<Phase1Db>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function writeTestBuffer(key: string, bytes: number[]) {
  const db = await getDb();
  await db.put(STORE_NAME, new Uint8Array(bytes).buffer, key);
}

export async function readTestBuffer(key: string) {
  const db = await getDb();
  return db.get(STORE_NAME, key);
}

export async function deleteTestBuffer(key: string) {
  const db = await getDb();
  await db.delete(STORE_NAME, key);
}

export async function compareTestBuffer(key: string, bytes: number[]) {
  const stored = await readTestBuffer(key);
  if (!stored) return { equal: false, value: null };

  const incoming = new Uint8Array(bytes);
  const existing = new Uint8Array(stored);
  if (incoming.byteLength !== existing.byteLength) {
    return { equal: false, value: stored };
  }

  for (let index = 0; index < incoming.byteLength; index += 1) {
    if (incoming[index] !== existing[index]) {
      return { equal: false, value: stored };
    }
  }

  return { equal: true, value: stored };
}
