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
  id: string;
  name: string;
  size: number;
  type: string | null;
  lastModified: number;
  data: number[];
};

export type OffscreenRequest =
  | OffscreenHealthRequest
  | StorageWriteRequest
  | StorageReadRequest
  | StorageDeleteRequest
  | StorageCompareRequest
  | PdfStoreRequest
  | PdfReadRequest
  | PdfDeleteRequest
  | OffscreenCompressionHealthRequest
  | OffscreenCompressionStartRequest
  | OffscreenCompressionCancelRequest
  | OffscreenCompressionResultReadRequest
  | OffscreenCompressionResultDeleteRequest;

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

export type CompressionMode = "Balanced";

export type CompressionEngineStatus = "loading" | "ready" | "unsupported" | "failed";

export type CompressionStage = "loading-engine" | "opening" | "scrubbing" | "rewriting" | "verifying" | "persisting" | "complete";

export type CompressionStatus = "idle" | "loading-engine" | "compressing" | "cancelling" | "complete" | "error" | "cancelled";

export type CompressionErrorCode = "WASM_NOT_SUPPORTED" | "WASM_LOAD_FAILED" | "INVALID_PDF" | "ENCRYPTED_PDF" | "TIMEOUT" | "CANCELLED" | "UNKNOWN";

export type CompressionResultRecord = {
  id: string;
  sourceRecordId: string;
  fileName: string;
  mimeType: string | null;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercent: number;
  pageCount: number;
  data: ArrayBuffer;
  createdAt: number;
  updatedAt: number;
};

export type CompressionHealthRequest = {
  type: "compression:health";
};

export type CompressionStartRequest = {
  type: "compression:start";
  mode: CompressionMode;
};

export type CompressionCancelRequest = {
  type: "compression:cancel";
};

export type CompressionResultReadRequest = {
  type: "compression:result-read";
};

export type CompressionResultDeleteRequest = {
  type: "compression:result-delete";
};

export type BackgroundCompressionHealthRequest = {
  type: "background:compression-health";
};

export type BackgroundCompressionStartRequest = {
  type: "background:compression-start";
  mode: CompressionMode;
};

export type BackgroundCompressionCancelRequest = {
  type: "background:compression-cancel";
};

export type BackgroundCompressionResultReadRequest = {
  type: "background:compression-result-read";
};

export type BackgroundCompressionResultDeleteRequest = {
  type: "background:compression-result-delete";
};

export type OffscreenCompressionHealthRequest = {
  type: "offscreen:compression-health";
};

export type OffscreenCompressionStartRequest = {
  type: "offscreen:compression-start";
  mode: CompressionMode;
};

export type OffscreenCompressionCancelRequest = {
  type: "offscreen:compression-cancel";
};

export type OffscreenCompressionResultReadRequest = {
  type: "offscreen:compression-result-read";
};

export type OffscreenCompressionResultDeleteRequest = {
  type: "offscreen:compression-result-delete";
};

export type CompressionProgressEvent = {
  type: "compression:progress";
  recordId: string;
  stage: CompressionStage;
  progress: number;
  pageCount: number;
  currentPage: number;
  message: string;
};

export type CompressionResultEvent = {
  type: "compression:result";
  result: CompressionResultRecord;
};

export type CompressionErrorEvent = {
  type: "compression:error";
  recordId: string | null;
  code: CompressionErrorCode;
  message: string;
};

export type CompressionHealthResponse = {
  ok: true;
  engine: "mupdf";
  status: CompressionEngineStatus;
  details: string;
  pageCount: number;
};

export type CompressionStartResponse = {
  ok: true;
  recordId: string;
  result: CompressionResultRecord;
  details: string;
};

export type CompressionCancelResponse = {
  ok: true;
  cancelled: boolean;
  details: string;
};

export type CompressionResultReadResponse = {
  ok: true;
  result: CompressionResultRecord | null;
};

export type CompressionResultDeleteResponse = {
  ok: true;
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
  | PdfDeleteResponse
  | CompressionHealthResponse
  | CompressionStartResponse
  | CompressionCancelResponse
  | CompressionResultReadResponse
  | CompressionResultDeleteResponse;

export type BackgroundHealthRequest = {
  type: "health:check";
};

export type OffscreenOpenRequest = {
  type: "offscreen:open";
};

export type OffscreenCloseRequest = {
  type: "offscreen:close";
};

export type BackgroundRequest =
  | BackgroundHealthRequest
  | OffscreenOpenRequest
  | OffscreenCloseRequest
  | BackgroundCompressionHealthRequest
  | BackgroundCompressionStartRequest
  | BackgroundCompressionCancelRequest
  | BackgroundCompressionResultReadRequest
  | BackgroundCompressionResultDeleteRequest;

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

export type BackgroundResponse =
  | BackgroundHealthResponse
  | OffscreenControlResponse
  | CompressionHealthResponse
  | CompressionStartResponse
  | CompressionCancelResponse
  | CompressionResultReadResponse
  | CompressionResultDeleteResponse
  | BackgroundErrorResponse;

export async function sendMessage<TResponse>(message: BackgroundRequest | OffscreenRequest): Promise<TResponse> {
  return (await browser.runtime.sendMessage(message)) as TResponse;
}
