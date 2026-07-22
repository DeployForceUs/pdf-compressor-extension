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

export interface PersistedSplitPart {
  readonly recordId: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface SplitPartStore {
  read(recordId: string): Promise<PersistedSplitPart | null>;
}

export interface ZipCreateRequest {
  readonly executionId: string;
  readonly compressedRecordId: string;
  readonly artifactIds: readonly string[];
  readonly outputMode: "single-zip";
}

export interface PersistedZipArtifact {
  readonly recordId: string;
  readonly artifactIds: readonly string[];
  readonly byteLength: number;
}

export interface ZipPort {
  createAndPersist(request: ZipCreateRequest): Promise<PersistedZipArtifact>;
}
