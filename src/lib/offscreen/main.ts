import browser from "webextension-polyfill";
import { createLogger, initTelemetry } from "../bootstrap";
import type { OffscreenRequest, OffscreenResponse, PdfRecord } from "../messaging";

const RECORD_STORE = "binary-records";
const DB_NAME = "pdf-compressor-phase1";
const DB_VERSION = 1;

const logger = createLogger("offscreen");
void initTelemetry("offscreen");

type DatabaseHandle = {
  db: IDBDatabase;
};

function openDatabase(): Promise<DatabaseHandle> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE);
      }
    };

    request.onsuccess = () => {
      resolve({ db: request.result });
    };

    request.onerror = () => {
      reject(request.error ?? new DOMException("OpenError", "OpenError"));
    };
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const { db } = await openDatabase();

  try {
    const transaction = db.transaction(RECORD_STORE, mode);
    const store = transaction.objectStore(RECORD_STORE);
    const result = await run(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new DOMException("TransactionError", "TransactionError"));
      transaction.onabort = () => reject(transaction.error ?? new DOMException("AbortError", "AbortError"));
    });

    return result;
  } finally {
    db.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new DOMException("RequestError", "RequestError"));
  });
}

async function putBytes(key: string, bytes: number[]) {
  const buffer = new Uint8Array(bytes).buffer;
  await withStore("readwrite", (store) => requestToPromise(store.put(buffer, key)));
  return { ok: true as const, byteLength: bytes.length };
}

async function putPdf(record: PdfRecord) {
  const stored: PdfRecord = {
    ...record,
    bytes: [...record.bytes],
  };
  await withStore("readwrite", (store) => requestToPromise(store.put(stored, record.recordId)));
  return { ok: true as const, recordId: record.recordId, byteLength: record.bytes.length };
}

async function readBytes(key: string) {
  const value = (await withStore("readonly", (store) => requestToPromise(store.get(key)))) as ArrayBuffer | undefined;
  return { ok: true as const, value: value ?? null, byteLength: value?.byteLength ?? 0 };
}

async function readPdf(recordId: string) {
  const value = (await withStore("readonly", (store) => requestToPromise(store.get(recordId)))) as PdfRecord | undefined;
  return { ok: true as const, recordId, record: value ?? null, byteLength: value?.bytes.length ?? 0 };
}

async function deleteBytes(key: string) {
  await withStore("readwrite", (store) => requestToPromise(store.delete(key)));
  return { ok: true as const };
}

async function deletePdf(recordId: string) {
  const existing = await withStore("readonly", (store) => requestToPromise(store.get(recordId)));
  await withStore("readwrite", (store) => requestToPromise(store.delete(recordId)));
  return { ok: true as const, recordId, deleted: existing !== undefined };
}

async function compareBytes(key: string, bytes: number[]) {
  const current = (await withStore("readonly", (store) => requestToPromise(store.get(key)))) as ArrayBuffer | undefined;
  if (!current) {
    return { ok: true as const, equal: false, value: null, byteLength: 0 };
  }

  const left = new Uint8Array(current);
  const right = new Uint8Array(bytes);
  const equal = left.length === right.length && left.every((value, index) => value === right[index]);
  return { ok: true as const, equal, value: current, byteLength: current.byteLength };
}

async function handle(message: OffscreenRequest): Promise<OffscreenResponse | null> {
  switch (message.type) {
    case "offscreen:health":
      return {
        ok: true,
        source: "offscreen",
        details: "Offscreen document is responsive",
      };
    case "storage:test-write":
      return putBytes(message.key, message.bytes);
    case "storage:test-read":
      return readBytes(message.key);
    case "storage:test-delete":
      return deleteBytes(message.key);
    case "storage:test-compare":
      return compareBytes(message.key, message.bytes);
    case "pdf:store":
      return putPdf(message.record);
    case "pdf:read":
      return readPdf(message.recordId);
    case "pdf:delete":
      return deletePdf(message.recordId);
    default:
      return null;
  }
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void handle(message as OffscreenRequest)
    .then((response) => {
      if (response) {
        sendResponse(response);
      }
    })
    .catch((error) => {
      logger.error("Captured exception in offscreen", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown offscreen error",
      });
    });
  return true;
});
