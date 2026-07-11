import browser from "webextension-polyfill";

export type HealthCheckMessage = {
  type: "health:check";
};

export type OffscreenOpenMessage = {
  type: "offscreen:open";
};

export type OffscreenCloseMessage = {
  type: "offscreen:close";
};

export type OffscreenHealthMessage = {
  type: "offscreen:health";
};

export type StorageWriteMessage = {
  type: "storage:test-write";
  key: string;
  bytes: number[];
};

export type StorageReadMessage = {
  type: "storage:test-read";
  key: string;
};

export type StorageDeleteMessage = {
  type: "storage:test-delete";
  key: string;
};

export type StorageCompareMessage = {
  type: "storage:test-compare";
  key: string;
  bytes: number[];
};

export type AppMessage =
  | HealthCheckMessage
  | OffscreenOpenMessage
  | OffscreenCloseMessage
  | OffscreenHealthMessage
  | StorageWriteMessage
  | StorageReadMessage
  | StorageDeleteMessage
  | StorageCompareMessage;

export type HealthCheckResponse = {
  ok: boolean;
  source: "background" | "offscreen";
  offscreen?: boolean;
  details?: string;
};

export type InfoResponse =
  | { ok: true; details?: string; source?: "background" | "offscreen"; offscreen?: boolean }
  | { ok: false; error: string };

export type StorageResponse =
  | { ok: true; value?: ArrayBuffer | null; equal?: boolean; byteLength?: number }
  | { ok: false; error: string };

export type AppResponse =
  | HealthCheckResponse
  | InfoResponse
  | StorageResponse
  | { ok: false; error: string };

export function toUint8Array(bytes: number[]) {
  return new Uint8Array(bytes);
}

export function arrayBufferToBytes(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer));
}

export async function sendTypedMessage<TResponse>(message: AppMessage): Promise<TResponse> {
  return browser.runtime.sendMessage(message) as Promise<TResponse>;
}
