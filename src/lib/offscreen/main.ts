import { proxy, transfer, wrap } from "comlink";
import browser from "webextension-polyfill";
import { createLogger, initTelemetry } from "../bootstrap";
import { COMPRESSED_PDF_RECORD_ID, SELECTED_PDF_RECORD_ID } from "../pdf-records";
import { deleteCompressionResult, readCompressionResult, writeCompressionResult } from "../storage/pdf-compression-db";
import type {
  CompressionCancelResponse,
  CompressionErrorEvent,
  CompressionHealthResponse,
  CompressionProgressEvent,
  CompressionResultDeleteResponse,
  CompressionResultReadResponse,
  CompressionStartResponse,
  OffscreenCompressionCancelRequest,
  OffscreenCompressionHealthRequest,
  OffscreenCompressionResultDeleteRequest,
  OffscreenCompressionResultReadRequest,
  OffscreenCompressionStartRequest,
  OffscreenRequest,
  OffscreenResponse,
  PdfRecord,
} from "../messaging";
import type { CompressionWorkerApi } from "./worker";

const RECORD_STORE = "binary-records";
const DB_NAME = "pdf-compressor-phase1";
const DB_VERSION = 2;
const COMPRESSION_TIMEOUT_MS = 30_000;

const logger = createLogger("offscreen");
void initTelemetry("offscreen");

type DatabaseHandle = {
  db: IDBDatabase;
};

type CompressionRunState = {
  abortController: AbortController;
  timeoutId: ReturnType<typeof setTimeout> | null;
  reason: "cancelled" | "timeout" | null;
  recordId: string;
};

let workerInstance: Worker | null = null;
let workerApi: CompressionWorkerApi | null = null;
let activeCompression: CompressionRunState | null = null;

function openDatabase(): Promise<DatabaseHandle> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(RECORD_STORE)) {
        db.deleteObjectStore(RECORD_STORE);
      }
      db.createObjectStore(RECORD_STORE, { keyPath: "id" });
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

function normalizeSmokeBytes(record: unknown, key: string) {
  if (!record || typeof record !== "object") {
    throw new Error(`IndexedDB smoke test record shape is invalid for key ${key}`);
  }

  const candidate = record as { id?: unknown; data?: unknown; byteLength?: unknown };
  if (candidate.id !== key) {
    throw new Error(`IndexedDB smoke test record id mismatch for key ${key}`);
  }

  if (!Array.isArray(candidate.data) || !candidate.data.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new Error(`IndexedDB smoke test record data is invalid for key ${key}`);
  }

  return {
    id: key,
    data: candidate.data as number[],
    byteLength:
      typeof candidate.byteLength === "number" && Number.isFinite(candidate.byteLength)
        ? candidate.byteLength
        : (candidate.data as number[]).length,
  };
}

async function putBytes(key: string, bytes: number[]) {
  const record = {
    id: key,
    data: [...bytes],
    byteLength: bytes.length,
  };
  await withStore("readwrite", (store) => requestToPromise(store.put(record)));
  return { ok: true as const, byteLength: record.byteLength };
}

async function putPdf(record: PdfRecord) {
  const stored: PdfRecord = {
    ...record,
    data: [...record.data],
  };
  await withStore("readwrite", (store) => requestToPromise(store.put(stored)));
  return { ok: true as const, recordId: record.id, byteLength: record.data.length };
}

async function readBytes(key: string) {
  const value = await withStore("readonly", (store) => requestToPromise(store.get(key)));
  if (value === undefined) {
    return { ok: true as const, value: null, byteLength: 0 };
  }

  const record = normalizeSmokeBytes(value, key);
  return { ok: true as const, value: record.data, byteLength: record.byteLength };
}

async function readPdf(recordId: string) {
  const value = (await withStore("readonly", (store) => requestToPromise(store.get(recordId)))) as PdfRecord | undefined;
  return { ok: true as const, recordId, record: value ?? null, byteLength: value?.data.length ?? 0 };
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
  const current = await withStore("readonly", (store) => requestToPromise(store.get(key)));
  if (current === undefined) {
    return { ok: true as const, equal: false, value: null, byteLength: 0 };
  }

  const record = normalizeSmokeBytes(current, key);
  const equal =
    record.data.length === bytes.length && record.data.every((value, index) => value === bytes[index]);
  return { ok: true as const, equal, value: record.data, byteLength: record.byteLength };
}

function broadcast<T extends { type: string }>(message: T) {
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

function getCompressionWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    workerApi = wrap<CompressionWorkerApi>(workerInstance);
  }

  if (!workerApi) {
    throw new Error("Compression worker is not available");
  }

  return workerApi;
}

function resetCompressionState() {
  if (activeCompression?.timeoutId) {
    clearTimeout(activeCompression.timeoutId);
  }

  activeCompression = null;
}

function compressionErrorPayload(
  code: string,
  message: string,
  recordId: string | null = COMPRESSED_PDF_RECORD_ID,
): CompressionErrorEvent {
  return {
    type: "compression:error",
    recordId,
    code: code as CompressionErrorEvent["code"],
    message,
  };
}

function compressionResultEvent(result: Awaited<ReturnType<typeof writeCompressionResult>>) {
  return {
    type: "compression:result" as const,
    result,
  };
}

function compressionProgressFromMessage(
  event: CompressionProgressEvent,
): CompressionProgressEvent {
  return event;
}

async function ensureCompressionHealth(): Promise<CompressionHealthResponse> {
  const api = getCompressionWorker();
  return api.health();
}

async function readCompressionState() {
  const result = await readCompressionResult();
  return { ok: true as const, result };
}

async function deleteCompressionState() {
  const deleted = await deleteCompressionResult();
  return { ok: true as const, deleted };
}

async function cancelCompression() {
  if (!activeCompression) {
    return { ok: true as const, cancelled: false, details: "No compression job is active" };
  }

  activeCompression.reason = "cancelled";
  activeCompression.abortController.abort();
  return { ok: true as const, cancelled: true, details: "Cancellation requested" };
}

async function startCompression(
  message: OffscreenCompressionStartRequest,
): Promise<CompressionStartResponse | { ok: false; error: string }> {
  if (activeCompression) {
    return {
      ok: false,
      error: "Compression is already in progress",
    };
  }

  const selected = (await readPdf(SELECTED_PDF_RECORD_ID)).record;
  if (!selected) {
    return {
      ok: false,
      error: "No selected PDF record is available",
    };
  }

  const inputBytes = Uint8Array.from(selected.data);
  const inputBuffer = inputBytes.buffer;
  const api = getCompressionWorker();
  const abortController = new AbortController();
  const started = performance.now();

  activeCompression = {
    abortController,
    timeoutId: null,
    reason: null,
    recordId: COMPRESSED_PDF_RECORD_ID,
  };

  activeCompression.timeoutId = setTimeout(() => {
    if (activeCompression) {
      activeCompression.reason = "timeout";
      activeCompression.abortController.abort();
    }
  }, COMPRESSION_TIMEOUT_MS);

  const onProgress = (event: CompressionProgressEvent) => {
    const progressEvent = compressionProgressFromMessage(event);
    logger.info("Compression progress", {
      recordId: progressEvent.recordId,
      stage: progressEvent.stage,
      progress: progressEvent.progress,
      pageCount: progressEvent.pageCount,
    });
    broadcast(progressEvent);
  };

  const isCancelled = () => abortController.signal.aborted;

  try {
    broadcast({
      type: "compression:progress",
      recordId: COMPRESSED_PDF_RECORD_ID,
      stage: "loading-engine",
      progress: 0,
      pageCount: 0,
      currentPage: 0,
      message: "Loading engine",
    });

    const outcome = await api.compress(
      transfer(
        {
          input: inputBuffer,
          recordId: COMPRESSED_PDF_RECORD_ID,
          sourceRecordId: selected.id,
          fileName: selected.name,
          mimeType: selected.type,
          mode: message.mode,
          timeoutMs: COMPRESSION_TIMEOUT_MS,
        },
        [inputBuffer],
      ),
      proxy(isCancelled),
      proxy(onProgress),
    );

    await writeCompressionResult(outcome.result);
    broadcast({
      type: "compression:progress",
      recordId: outcome.result.id,
      stage: "complete",
      progress: 100,
      pageCount: outcome.pageCount,
      currentPage: outcome.pageCount,
      message: "Compression complete",
    });
    broadcast(compressionResultEvent(outcome.result));
    logger.info("Compression completed", {
      recordId: outcome.result.id,
      pageCount: outcome.pageCount,
      originalSize: outcome.result.originalSize,
      compressedSize: outcome.result.compressedSize,
      savedBytes: outcome.result.savedBytes,
      elapsedMs: performance.now() - started,
    });

    return {
      ok: true,
      recordId: outcome.result.id,
      result: outcome.result,
      details: outcome.result.savedBytes > 0 ? "Compression complete" : "Compression complete with no size reduction",
    };
  } catch (error) {
    const timedOut = activeCompression?.reason === "timeout";
    const cancelled = activeCompression?.reason === "cancelled" || abortController.signal.aborted;

    let code = "UNKNOWN";
    let message = error instanceof Error ? error.message : "Unknown compression error";

    if (error && typeof error === "object" && "code" in error && "message" in error) {
      code = String((error as { code?: string }).code ?? "UNKNOWN");
      message = String((error as { message?: string }).message ?? message);
    } else if (timedOut) {
      code = "TIMEOUT";
      message = "Compression timed out";
    } else if (cancelled) {
      code = "CANCELLED";
      message = "Compression was cancelled";
    } else if (error instanceof WebAssembly.RuntimeError) {
      code = "WASM_LOAD_FAILED";
    }

    const payload = compressionErrorPayload(code, message, COMPRESSED_PDF_RECORD_ID);
    broadcast(payload);
    logger.error("Compression failed", {
      recordId: COMPRESSED_PDF_RECORD_ID,
      code,
      message,
      elapsedMs: performance.now() - started,
    });

    return {
      ok: false,
      error: message,
    };
  } finally {
    resetCompressionState();
  }
}

async function handle(message: OffscreenRequest): Promise<OffscreenResponse | { ok: false; error: string } | null> {
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
      logger.info("Persisting PDF record", {
        recordId: message.record.id,
        size: message.record.size,
        type: message.record.type,
        found: true,
      });
      return putPdf(message.record);
    case "pdf:read":
      logger.info("Reading PDF record", {
        recordId: message.recordId,
      });
      return readPdf(message.recordId).then((response) => {
        logger.info("Read PDF record result", {
          recordId: response.recordId,
          found: response.record !== null,
        });
        return response;
      });
    case "pdf:delete":
      return deletePdf(message.recordId);
    case "offscreen:compression-health": {
      const health = await ensureCompressionHealth();
      return health;
    }
    case "offscreen:compression-start":
      return startCompression(message);
    case "offscreen:compression-cancel":
      return cancelCompression();
    case "offscreen:compression-result-read":
      return readCompressionState();
    case "offscreen:compression-result-delete":
      return deleteCompressionState();
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
