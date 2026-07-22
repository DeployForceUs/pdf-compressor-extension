import { executionFailure } from "./domain/execution-errors.js";
import {
  INITIAL_EXECUTION_STATE,
  transitionExecution,
  type ExecutionState,
} from "./domain/execution-state.js";
import type { TargetContract } from "./domain/target-contract.js";
import type { CompressedResultStore, CompressionPort } from "./ports.js";

export interface CompressionResultEvent {
  readonly executionId: string;
  readonly sourceRecordId: string;
  readonly compressedRecordId: string;
  readonly metadataBytes: number;
}

export interface CoordinatorSnapshot {
  readonly executionId: string | null;
  readonly owner: "ai-execution-coordinator";
  readonly state: ExecutionState["status"];
  readonly sourceRecordId: string | null;
  readonly compressedRecordId: string | null;
  readonly metadataBytes: number | null;
  readonly actualBytes: number | null;
  readonly lastTransition: string;
  readonly timestamp: number;
}

interface CoordinatorPorts {
  readonly compression: CompressionPort;
  readonly compressedResults: CompressedResultStore;
  readonly now?: () => number;
}

export class AiExecutionCoordinator {
  #state: ExecutionState = INITIAL_EXECUTION_STATE;
  readonly #compression: CompressionPort;
  readonly #compressedResults: CompressedResultStore;
  readonly #now: () => number;
  #lastTransition = "initialized";

  constructor(ports: CoordinatorPorts) {
    this.#compression = ports.compression;
    this.#compressedResults = ports.compressedResults;
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
      lastTransition: this.#lastTransition,
      timestamp: this.#now(),
    });
  }

  confirmContract(input: {
    readonly executionId: string;
    readonly sourceRecordId: string;
    readonly contract: TargetContract;
  }): void {
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

  #transition(event: Parameters<typeof transitionExecution>[1]): void {
    this.#state = transitionExecution(this.#state, event);
    this.#lastTransition = event.type;
  }

  #fail(code: "compressed_result_missing" | "compressed_result_mismatch", message: string): void {
    this.#transition({ type: "FAILED", failure: executionFailure(code, message) });
  }
}
