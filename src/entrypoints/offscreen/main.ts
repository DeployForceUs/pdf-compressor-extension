import browser from "webextension-polyfill";
import { captureException, initSentry } from "../../lib/monitoring/sentry";
import { logger } from "../../lib/monitoring/logger";
import {
  type AppMessage,
  type AppResponse,
  type StorageCompareMessage,
  type StorageDeleteMessage,
  type StorageReadMessage,
  type StorageWriteMessage,
  arrayBufferToBytes,
  toUint8Array,
} from "../../lib/messaging";
import { compareTestBuffer, deleteTestBuffer, readTestBuffer, writeTestBuffer } from "../../lib/storage/indexed-db";

logger.info("Offscreen document starting");
void initSentry("offscreen");

async function handleStorageWrite(message: StorageWriteMessage): Promise<AppResponse> {
  await writeTestBuffer(message.key, message.bytes);
  return { ok: true, byteLength: message.bytes.length };
}

async function handleStorageRead(message: StorageReadMessage): Promise<AppResponse> {
  const value = await readTestBuffer(message.key);
  return { ok: true, value, byteLength: value?.byteLength ?? 0 };
}

async function handleStorageDelete(message: StorageDeleteMessage): Promise<AppResponse> {
  await deleteTestBuffer(message.key);
  return { ok: true };
}

async function handleStorageCompare(message: StorageCompareMessage): Promise<AppResponse> {
  const result = await compareTestBuffer(message.key, message.bytes);
  return { ok: true, equal: result.equal, value: result.value, byteLength: result.value?.byteLength ?? 0 };
}

async function handleMessage(message: AppMessage): Promise<AppResponse | null> {
  switch (message.type) {
    case "offscreen:health":
      return { ok: true, source: "offscreen", details: "Offscreen document is responsive" };
    case "storage:test-write":
      return handleStorageWrite(message);
    case "storage:test-read":
      return handleStorageRead(message);
    case "storage:test-delete":
      return handleStorageDelete(message);
    case "storage:test-compare":
      return handleStorageCompare(message);
    default:
      return null;
  }
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const handler = async () => {
    try {
      const response = await handleMessage(message as AppMessage);
      if (response) sendResponse(response);
      return true;
    } catch (error) {
      captureException(error, "offscreen");
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown offscreen error",
      });
      return true;
    }
  };

  void handler();
  return true;
});

void arrayBufferToBytes(new Uint8Array([9, 8, 7]).buffer);
void toUint8Array([9, 8, 7]);
