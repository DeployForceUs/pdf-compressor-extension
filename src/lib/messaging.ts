import browser from "webextension-polyfill";

export type OffscreenHealthRequest = {
  type: "offscreen:health";
};

export type StorageWriteRequest = {
  type: "storage:test-write";
  key: string;
  bytes: number[];
};

export type StorageReadRequest = {
  type: "storage:test-read";
  key: string;
};

export type StorageDeleteRequest = {
  type: "storage:test-delete";
  key: string;
};

export type StorageCompareRequest = {
  type: "storage:test-compare";
  key: string;
  bytes: number[];
};

export type PdfStoreRequest = {
  type: "pdf:store";
  record: PdfRecord;
};

export type PdfReadRequest = {
  type: "pdf:read";
  recordId: string;
};

export type PdfDeleteRequest = {
  type: "pdf:delete";
  recordId: string;
};

export type PdfRecord = {
  recordId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  bytes: number[];
};

export type OffscreenRequest =
  | OffscreenHealthRequest
  | StorageWriteRequest
  | StorageReadRequest
  | StorageDeleteRequest
  | StorageCompareRequest
  | PdfStoreRequest
  | PdfReadRequest
  | PdfDeleteRequest;

export type OffscreenHealthResponse = {
  ok: true;
  source: "offscreen";
  details: string;
};

export type StorageWriteResponse = {
  ok: true;
  byteLength: number;
};

export type StorageReadResponse = {
  ok: true;
  value: ArrayBuffer | null;
  byteLength: number;
};

export type StorageDeleteResponse = {
  ok: true;
};

export type StorageCompareResponse = {
  ok: true;
  equal: boolean;
  value: ArrayBuffer | null;
  byteLength: number;
};

export type PdfStoreResponse = {
  ok: true;
  recordId: string;
  byteLength: number;
};

export type PdfReadResponse = {
  ok: true;
  recordId: string;
  record: PdfRecord | null;
  byteLength: number;
};

export type PdfDeleteResponse = {
  ok: true;
  recordId: string;
  deleted: boolean;
};

export type OffscreenResponse =
  | OffscreenHealthResponse
  | StorageWriteResponse
  | StorageReadResponse
  | StorageDeleteResponse
  | StorageCompareResponse
  | PdfStoreResponse
  | PdfReadResponse
  | PdfDeleteResponse;

export type BackgroundHealthRequest = {
  type: "health:check";
};

export type OffscreenOpenRequest = {
  type: "offscreen:open";
};

export type OffscreenCloseRequest = {
  type: "offscreen:close";
};

export type BackgroundRequest = BackgroundHealthRequest | OffscreenOpenRequest | OffscreenCloseRequest;

export type BackgroundHealthResponse = {
  ok: true;
  source: "background";
  offscreen: boolean;
  details: string;
};

export type OffscreenControlResponse = {
  ok: true;
  details: string;
};

export type BackgroundErrorResponse = {
  ok: false;
  error: string;
};

export type BackgroundResponse = BackgroundHealthResponse | OffscreenControlResponse | BackgroundErrorResponse;

export async function sendMessage<TResponse>(message: BackgroundRequest | OffscreenRequest): Promise<TResponse> {
  return (await browser.runtime.sendMessage(message)) as TResponse;
}
