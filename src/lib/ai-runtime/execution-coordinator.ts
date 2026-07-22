import { executionFailure, type ExecutionErrorCode } from "./domain/execution-errors.js";
import {
  INITIAL_EXECUTION_STATE,
  transitionExecution,
  type ExecutionState,
} from "./domain/execution-state.js";
import type { TargetContract } from "./domain/target-contract.js";
import type {
  CompressedResultStore,
  CompressionPort,
  SplitPartStore,
  SplitPort,
  ZipPort,
} from "./ports.js";

export interface CompressionResultEvent {
  readonly executionId: string;
  readonly sourceRecordId: string;
  readonly compressedRecordId: string;
  readonly metadataBytes: number;
}

export interface SplitResultEvent {
  readonly executionId: string;
  readonly compressedRecordId: string;
  readonly artifactIds: readonly string[];
}

export interface CoordinatorCapabilities {
  readonly canDownloadPdf: boolean;
  readonly canDownloadZip: boolean;
  readonly canPrepareSplit: boolean;
}

export interface CoordinatorSnapshot {
  readonly executionId: string | null;
  readonly owner: "ai-execution-coordinator";
  readonly state: ExecutionState["status"];
  readonly sourceRecordId: string | null;
  readonly compressedRecordId: string | null;
  readonly metadataBytes: number | null;
  readonly actualBytes: number | null;
  readonly targetBytes: number | null;
  readonly capabilities: CoordinatorCapabilities;
  readonly lastTransition: string;
  readonly timestamp: number;
}

interface CoordinatorPorts {
  readonly compression: CompressionPort;
  readonly compressedResults: CompressedResultStore;
  readonly split?: SplitPort;
  readonly splitParts?: SplitPartStore;
  readonly zip?: ZipPort;
  readonly now?: () => number;
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((value, index) => bytes[index] === value);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class AiExecutionCoordinator {
  #state: ExecutionState = INITIAL_EXECUTION_STATE;
  readonly #compression: CompressionPort;
  readonly #compressedResults: CompressedResultStore;
  readonly #split: SplitPort | null;
  readonly #splitParts: SplitPartStore | null;
  readonly #zip: ZipPort | null;
  readonly #now: () => number;
  #lastTransition = "initialized";
  #splitDispatchedExecutionId: string | null = null;
  #zipDispatchedExecutionId: string | null = null;

  constructor(ports: CoordinatorPorts) {
    this.#compression = ports.compression;
    this.#compressedResults = ports.compressedResults;
    this.#split = ports.split ?? null;
    this.#splitParts = ports.splitParts ?? null;
    this.#zip = ports.zip ?? null;
    this.#now = ports.now ?? Date.now;
  }

  get state(): ExecutionState {
    return this.#state;
  }

  snapshot(): CoordinatorSnapshot {
    const state = this.#state;
    return Object.freeze({
      executionId: state.status === "idle" ? null : state.executionId,
      owner: "ai-execution-coordinator",
      state: state.status,
      sourceRecordId: state.status === "idle" ? null : state.sourceRecordId,
      compressedRecordId:
        "compressedRecordId" in state ? state.compressedRecordId : null,
      metadataBytes: "metadataBytes" in state ? state.metadataBytes : null,
      actualBytes: "actualBytes" in state ? state.actualBytes : null,
      targetBytes: state.status === "idle" ? null : state.contract.targetBytes,
      capabilities: Object.freeze({
        canDownloadPdf: state.status === "completed_pdf",
        canDownloadZip: state.status === "completed_zip",
        canPrepareSplit:
          state.status === "splitting" &&
          this.#splitDispatchedExecutionId !== state.executionId,
      }),
      lastTransition: this.#lastTransition,
      timestamp: this.#now(),
    });
  }

  confirmContract(input: {
    readonly executionId: string;
    readonly sourceRecordId: string;
    readonly contract: TargetContract;
  }): void {
    this.#splitDispatchedExecutionId = null;
    this.#zipDispatchedExecutionId = null;
    this.#transition({
      type: "CONTRACT_CONFIRMED",
      executionId: input.executionId,
      sourceRecordId: input.sourceRecordId,
      contract: input.contract,
    });
  }

  beginPlanning(): void {
    this.#transition({ type: "PLANNING_STARTED" });
  }

  acceptPlan(input: {
    readonly route: "local" | "office_current";
    readonly preset: "safe" | "balanced" | "strong";
  }): void {
    this.#transition({ type: "PLAN_READY", route: input.route, preset: input.preset });
  }

  async startCompression(): Promise<void> {
    if (this.#state.status !== "plan_ready") {
      throw new Error(`compression_start_invalid_state:${this.#state.status}`);
    }

    const state = this.#state;
    await this.#compression.start({
      executionId: state.executionId,
      sourceRecordId: state.sourceRecordId,
      route: state.route,
      preset: state.preset,
    });
    this.#transition({ type: "COMPRESSION_STARTED" });
  }

  async handleCompressionResult(event: CompressionResultEvent): Promise<boolean> {
    if (this.#state.status !== "compressing") return false;
    if (event.executionId !== this.#state.executionId) return false;
    if (event.sourceRecordId !== this.#state.sourceRecordId) return false;

    if (event.compressedRecordId === this.#state.sourceRecordId) {
      this.#fail("compressed_result_mismatch", "Original selected PDF cannot be claimed as compressed output");
      return false;
    }

    this.#transition({
      type: "COMPRESSION_RESULT_RECEIVED",
      compressedRecordId: event.compressedRecordId,
      metadataBytes: event.metadataBytes,
    });

    const persisted = await this.#compressedResults.read(event.compressedRecordId);
    if (!persisted) {
      this.#fail("compressed_result_missing", "Persisted compressed result was not found");
      return false;
    }

    if (
      persisted.recordId !== event.compressedRecordId ||
      persisted.sourceRecordId !== event.sourceRecordId ||
      persisted.recordId === persisted.sourceRecordId ||
      persisted.byteLength !== event.metadataBytes
    ) {
      this.#fail("compressed_result_mismatch", "Persisted compressed result identity does not match the active execution");
      return false;
    }

    this.#transition({ type: "COMPRESSED_RESULT_VERIFIED", actualBytes: persisted.byteLength });
    return true;
  }

  evaluateCompressedResultSize(): "complete_pdf" | "prepare_split" {
    if (this.#state.status !== "validating_compressed_result") {
      throw new Error(`size_gate_invalid_state:${this.#state.status}`);
    }

    const decision = this.#state.actualBytes <= this.#state.contract.targetBytes
      ? "complete_pdf"
      : "prepare_split";
    this.#transition({ type: "SIZE_GATE_EVALUATED", decision });
    return decision;
  }

  async startSplit(): Promise<void> {
    if (this.#state.status !== "splitting") {
      throw new Error(`split_start_invalid_state:${this.#state.status}`);
    }
    if (!this.#split) throw new Error("split_port_missing");
    if (this.#splitDispatchedExecutionId === this.#state.executionId) {
      throw new Error(`split_already_dispatched:${this.#state.executionId}`);
    }
    if (this.#state.compressedRecordId === this.#state.sourceRecordId) {
      this.#fail("compressed_result_mismatch", "Original selected PDF cannot be used as split input");
      throw new Error("split_input_original_source_forbidden");
    }

    const state = this.#state;
    this.#splitDispatchedExecutionId = state.executionId;
    try {
      await this.#split.start({
        executionId: state.executionId,
        compressedRecordId: state.compressedRecordId,
        targetBytes: state.contract.targetBytes,
        outputMode: state.contract.outputMode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Split dispatch failed";
      this.#transition({ type: "FAILED", failure: executionFailure("split_failed", message) });
      throw error;
    }
  }

  handleSplitResult(event: SplitResultEvent): boolean {
    if (this.#state.status !== "splitting") return false;
    if (this.#splitDispatchedExecutionId !== this.#state.executionId) return false;
    if (event.executionId !== this.#state.executionId) return false;
    if (event.compressedRecordId !== this.#state.compressedRecordId) return false;

    this.#transition({ type: "SPLIT_COMPLETED", artifactIds: event.artifactIds });
    return true;
  }

  async validateSplitParts(): Promise<boolean> {
    if (this.#state.status !== "validating_split_parts") {
      throw new Error(`split_validation_invalid_state:${this.#state.status}`);
    }
    if (!this.#splitParts) throw new Error("split_part_store_missing");

    const state = this.#state;
    for (const artifactId of state.artifactIds) {
      const part = await this.#splitParts.read(artifactId);
      if (this.#state.status !== "validating_split_parts" || this.#state.executionId !== state.executionId) {
        return false;
      }
      if (
        !part ||
        part.recordId !== artifactId ||
        !Number.isSafeInteger(part.byteLength) ||
        part.byteLength <= 0 ||
        part.byteLength !== part.bytes.byteLength ||
        !hasPdfSignature(part.bytes)
      ) {
        this.#fail("split_part_invalid", `Split part failed validation: ${artifactId}`);
        return false;
      }
      if (part.byteLength > state.contract.targetBytes) {
        this.#fail("split_part_oversized", `Split part exceeds target and requires further division: ${artifactId}`);
        return false;
      }
    }

    this.#transition({ type: "SPLIT_PARTS_VALIDATED", artifactIds: state.artifactIds });
    return true;
  }

  async createZip(): Promise<boolean> {
    if (this.#state.status !== "creating_zip") {
      throw new Error(`zip_creation_invalid_state:${this.#state.status}`);
    }
    if (!this.#zip) throw new Error("zip_port_missing");
    if (this.#zipDispatchedExecutionId === this.#state.executionId) {
      throw new Error(`zip_already_dispatched:${this.#state.executionId}`);
    }

    const state = this.#state;
    this.#zipDispatchedExecutionId = state.executionId;
    this.#transition({ type: "ZIP_CREATION_STARTED" });

    try {
      const persisted = await this.#zip.createAndPersist({
        executionId: state.executionId,
        compressedRecordId: state.compressedRecordId,
        artifactIds: state.artifactIds,
        outputMode: state.contract.outputMode,
      });

      if (this.#state.status !== "creating_zip" || this.#state.executionId !== state.executionId) {
        return false;
      }
      if (
        !persisted.recordId.trim() ||
        !Number.isSafeInteger(persisted.byteLength) ||
        persisted.byteLength <= 0 ||
        !sameIds(persisted.artifactIds, state.artifactIds)
      ) {
        this.#fail("zip_creation_failed", "Persisted ZIP does not match the fully validated split artifacts");
        return false;
      }

      this.#transition({ type: "ZIP_CREATED", zipRecordId: persisted.recordId });
      return true;
    } catch (error) {
      if (this.#state.status === "creating_zip" && this.#state.executionId === state.executionId) {
        const message = error instanceof Error ? error.message : "ZIP creation failed";
        this.#fail("zip_creation_failed", message);
      }
      return false;
    }
  }

  cancel(): void {
    if (this.#state.status === "idle") throw new Error("cancel_invalid_state:idle");
    this.#transition({ type: "CANCEL_REQUESTED" });
    this.#transition({ type: "CANCELLED" });
  }

  #transition(event: Parameters<typeof transitionExecution>[1]): void {
    this.#state = transitionExecution(this.#state, event);
    this.#lastTransition = event.type;
  }

  #fail(code: ExecutionErrorCode, message: string): void {
    this.#transition({ type: "FAILED", failure: executionFailure(code, message) });
  }
}
