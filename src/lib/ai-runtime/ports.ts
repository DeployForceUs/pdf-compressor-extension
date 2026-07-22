export interface CompressionStartRequest {
  readonly executionId: string;
  readonly sourceRecordId: string;
  readonly route: "local" | "office_current";
  readonly preset: "safe" | "balanced" | "strong";
}

export interface CompressionPort {
  start(request: CompressionStartRequest): Promise<void>;
}

export interface PersistedCompressedResult {
  readonly recordId: string;
  readonly sourceRecordId: string;
  readonly byteLength: number;
}

export interface CompressedResultStore {
  read(recordId: string): Promise<PersistedCompressedResult | null>;
}

export interface SplitStartRequest {
  readonly executionId: string;
  readonly compressedRecordId: string;
  readonly targetBytes: number;
  readonly outputMode: "single-zip";
}

export interface SplitPort {
  start(request: SplitStartRequest): Promise<void>;
}
