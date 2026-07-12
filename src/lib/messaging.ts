import browser from "webextension-polyfill";
import type { SplitStrategy } from "./pdf/split-strategies";
import type { SplitErrorCode } from "./pdf/split-errors";

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
  | OffscreenCompressionResultDeleteRequest
  | OffscreenSplitRequest
  | OffscreenSplitCancelRequest
  | OffscreenSplitResultReadRequest
  | OffscreenSplitResultDeleteRequest;

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
  value: number[] | null;
  byteLength: number;
};

export type StorageDeleteResponse = {
  ok: true;
};

export type StorageCompareResponse = {
  ok: true;
  equal: boolean;
  value: number[] | null;
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

export type CompressionResultMetadata = Omit<CompressionResultRecord, "data"> & {
  status: "complete";
};

export type SplitProgressStage =
  | "validating"
  | "planning-parts"
  | "creating-part"
  | "validating-part"
  | "creating-zip"
  | "persisting"
  | "complete";

export type SplitWarning = {
  code: "SINGLE_PAGE_EXCEEDS_LIMIT";
  pageNumber: number;
  actualGeneratedByteSize: number;
  requestedMaximumByteSize: number;
  fileName: string;
  partNumber: number;
  oversized: true;
};

export type SplitResultRecord = {
  id: string;
  sourceRecordId: string;
  fileName: string;
  mimeType: string | null;
  originalSize: number;
  totalPartsSize: number;
  partsCount: number;
  strategy: SplitStrategy;
  warnings: SplitWarning[];
  data: ArrayBuffer;
  createdAt: number;
  updatedAt: number;
};

export type SplitResultMetadata = {
  zipBlobId: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  originalSize: number;
  totalPartsSize: number;
  partsCount: number;
  strategy: SplitStrategy;
  warnings: SplitWarning[];
  status: "complete";
};

export type SplitLocalRequest = {
  type: "split:local";
  strategy: SplitStrategy;
  compressAfter?: boolean;
};

export type SplitCancelRequest = {
  type: "split:cancel";
};

export type SplitResultReadRequest = {
  type: "split:result-read";
  recordId?: string;
};

export type SplitResultDeleteRequest = {
  type: "split:result-delete";
  recordId?: string;
};

export type BackgroundSplitStartRequest = {
  type: "background:split-start";
  strategy: SplitStrategy;
  compressAfter?: boolean;
};

export type BackgroundSplitCancelRequest = {
  type: "background:split-cancel";
};

export type BackgroundSplitResultReadRequest = {
  type: "background:split-result-read";
  recordId?: string;
};

export type BackgroundSplitResultDeleteRequest = {
  type: "background:split-result-delete";
  recordId?: string;
};

export type OffscreenSplitRequest = {
  type: "offscreen:split";
  strategy: SplitStrategy;
  compressAfter?: boolean;
};

export type OffscreenSplitCancelRequest = {
  type: "offscreen:split-cancel";
};

export type OffscreenSplitResultReadRequest = {
  type: "offscreen:split-result-read";
  recordId?: string;
};

export type OffscreenSplitResultDeleteRequest = {
  type: "offscreen:split-result-delete";
  recordId?: string;
};

export type SplitProgressEvent = {
  type: "split:progress";
  recordId: string;
  stage: SplitProgressStage;
  progress: number;
  partsCount: number;
  currentPart: number;
  message: string;
};

export type SplitResultEvent = {
  type: "split:result";
  result: SplitResultMetadata;
};

export type SplitErrorEvent = {
  type: "split:error";
  recordId: string | null;
  code: SplitErrorCode;
  message: string;
};

export type SplitHealthRequest = {
  type: "split:health";
};

export type SplitHealthResponse = {
  ok: true;
  source: "split";
  details: string;
};

export type SplitStartResponse = {
  ok: true;
  zipBlobId: string;
  result: SplitResultMetadata;
  details: string;
};

export type SplitCancelResponse = {
  ok: true;
  cancelled: boolean;
  details: string;
};

export type SplitResultReadResponse = {
  ok: true;
  result: SplitResultMetadata | null;
};

export type SplitResultDeleteResponse = {
  ok: true;
  deleted: boolean;
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
  recordId?: string;
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
  recordId?: string;
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
  result: CompressionResultMetadata;
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
  result: CompressionResultMetadata;
  details: string;
};

export type CompressionCancelResponse = {
  ok: true;
  cancelled: boolean;
  details: string;
};

export type CompressionResultReadResponse = {
  ok: true;
  result: CompressionResultMetadata | null;
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
  | CompressionResultDeleteResponse
  | SplitHealthResponse
  | SplitStartResponse
  | SplitCancelResponse
  | SplitResultReadResponse
  | SplitResultDeleteResponse;

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
  | BackgroundCompressionResultDeleteRequest
  | SplitLocalRequest
  | SplitCancelRequest
  | SplitResultReadRequest
  | SplitResultDeleteRequest;

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
  | SplitHealthResponse
  | SplitStartResponse
  | SplitCancelResponse
  | SplitResultReadResponse
  | SplitResultDeleteResponse
  | BackgroundErrorResponse;

export async function sendMessage<TResponse>(message: BackgroundRequest | OffscreenRequest): Promise<TResponse> {
  return (await browser.runtime.sendMessage(message)) as TResponse;
}
