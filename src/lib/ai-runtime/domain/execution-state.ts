import type { ExecutionEvent } from "./execution-events.js";
import type { ExecutionFailure } from "./execution-errors.js";
import type { TargetContract } from "./target-contract.js";

export interface ExecutionContext {
  readonly executionId: string;
  readonly owner: "ai-execution-coordinator";
  readonly sourceRecordId: string;
  readonly contract: TargetContract;
}

export type ExecutionState =
  | { readonly status: "idle" }
  | ({ readonly status: "contract_ready" } & ExecutionContext)
  | ({ readonly status: "planning" } & ExecutionContext)
  | ({ readonly status: "plan_ready"; readonly route: "local" | "office_current"; readonly preset: "safe" | "balanced" | "strong" } & ExecutionContext)
  | ({ readonly status: "compressing" } & ExecutionContext)
  | ({ readonly status: "claiming_compressed_result"; readonly compressedRecordId: string; readonly metadataBytes: number } & ExecutionContext)
  | ({ readonly status: "validating_compressed_result"; readonly compressedRecordId: string; readonly metadataBytes: number; readonly actualBytes: number } & ExecutionContext)
  | ({ readonly status: "splitting"; readonly compressedRecordId: string; readonly actualBytes: number } & ExecutionContext)
  | ({ readonly status: "validating_split_parts"; readonly compressedRecordId: string; readonly actualBytes: number; readonly artifactIds: readonly string[] } & ExecutionContext)
  | ({ readonly status: "creating_zip"; readonly compressedRecordId: string; readonly actualBytes: number; readonly artifactIds: readonly string[] } & ExecutionContext)
  | ({ readonly status: "completed_pdf"; readonly compressedRecordId: string; readonly actualBytes: number } & ExecutionContext)
  | ({ readonly status: "completed_zip"; readonly compressedRecordId: string; readonly actualBytes: number; readonly artifactIds: readonly string[]; readonly zipRecordId: string } & ExecutionContext)
  | ({ readonly status: "cancelling" } & ExecutionContext)
  | ({ readonly status: "cancelled" } & ExecutionContext)
  | ({ readonly status: "failed"; readonly failure: ExecutionFailure } & ExecutionContext);

export const INITIAL_EXECUTION_STATE: ExecutionState = Object.freeze({ status: "idle" });

function invalid(state: ExecutionState, event: ExecutionEvent): never {
  throw new Error(`invalid_transition:${state.status}:${event.type}`);
}

function context(state: Exclude<ExecutionState, { status: "idle" }>): ExecutionContext {
  return {
    executionId: state.executionId,
    owner: state.owner,
    sourceRecordId: state.sourceRecordId,
    contract: state.contract,
  };
}

function fail(state: Exclude<ExecutionState, { status: "idle" }>, failure: ExecutionFailure): ExecutionState {
  return Object.freeze({ status: "failed", ...context(state), failure });
}

export function transitionExecution(state: ExecutionState, event: ExecutionEvent): ExecutionState {
  if (event.type === "RESET") return INITIAL_EXECUTION_STATE;

  if (state.status !== "idle" && event.type === "FAILED") return fail(state, event.failure);
  if (state.status !== "idle" && event.type === "CANCEL_REQUESTED") {
    if (state.status === "completed_pdf" || state.status === "completed_zip" || state.status === "cancelled" || state.status === "failed") {
      return invalid(state, event);
    }
    return Object.freeze({ status: "cancelling", ...context(state) });
  }
  if (state.status === "cancelling" && event.type === "CANCELLED") {
    return Object.freeze({ status: "cancelled", ...context(state) });
  }

  switch (state.status) {
    case "idle":
      if (event.type !== "CONTRACT_CONFIRMED") return invalid(state, event);
      return Object.freeze({
        status: "contract_ready",
        executionId: event.executionId,
        owner: "ai-execution-coordinator",
        sourceRecordId: event.sourceRecordId,
        contract: event.contract,
      });

    case "contract_ready":
      if (event.type !== "PLANNING_STARTED") return invalid(state, event);
      return Object.freeze({ status: "planning", ...context(state) });

    case "planning":
      if (event.type !== "PLAN_READY") return invalid(state, event);
      return Object.freeze({ status: "plan_ready", ...context(state), route: event.route, preset: event.preset });

    case "plan_ready":
      if (event.type !== "COMPRESSION_STARTED") return invalid(state, event);
      return Object.freeze({ status: "compressing", ...context(state) });

    case "compressing":
      if (event.type !== "COMPRESSION_RESULT_RECEIVED") return invalid(state, event);
      if (!event.compressedRecordId.trim() || !Number.isSafeInteger(event.metadataBytes) || event.metadataBytes <= 0) {
        throw new Error("compression_result_invalid");
      }
      return Object.freeze({
        status: "claiming_compressed_result",
        ...context(state),
        compressedRecordId: event.compressedRecordId,
        metadataBytes: event.metadataBytes,
      });

    case "claiming_compressed_result":
      if (event.type !== "COMPRESSED_RESULT_VERIFIED") return invalid(state, event);
      if (!Number.isSafeInteger(event.actualBytes) || event.actualBytes <= 0) throw new Error("compressed_result_bytes_invalid");
      if (event.actualBytes !== state.metadataBytes) throw new Error("compressed_result_size_mismatch");
      return Object.freeze({
        status: "validating_compressed_result",
        ...context(state),
        compressedRecordId: state.compressedRecordId,
        metadataBytes: state.metadataBytes,
        actualBytes: event.actualBytes,
      });

    case "validating_compressed_result":
      if (event.type !== "SIZE_GATE_EVALUATED") return invalid(state, event);
      if (event.decision === "complete_pdf") {
        if (state.actualBytes > state.contract.targetBytes) throw new Error("size_gate_pdf_above_target");
        return Object.freeze({
          status: "completed_pdf",
          ...context(state),
          compressedRecordId: state.compressedRecordId,
          actualBytes: state.actualBytes,
        });
      }
      if (state.actualBytes <= state.contract.targetBytes) throw new Error("size_gate_split_not_required");
      return Object.freeze({
        status: "splitting",
        ...context(state),
        compressedRecordId: state.compressedRecordId,
        actualBytes: state.actualBytes,
      });

    case "splitting":
      if (event.type !== "SPLIT_COMPLETED") return invalid(state, event);
      if (event.artifactIds.length === 0) throw new Error("split_artifacts_required");
      return Object.freeze({
        status: "validating_split_parts",
        ...context(state),
        compressedRecordId: state.compressedRecordId,
        actualBytes: state.actualBytes,
        artifactIds: Object.freeze([...event.artifactIds]),
      });

    case "validating_split_parts":
      if (event.type !== "SPLIT_PARTS_VALIDATED") return invalid(state, event);
      if (event.artifactIds.length !== state.artifactIds.length || event.artifactIds.some((id, index) => id !== state.artifactIds[index])) {
        throw new Error("validated_split_artifacts_mismatch");
      }
      return Object.freeze({
        status: "creating_zip",
        ...context(state),
        compressedRecordId: state.compressedRecordId,
        actualBytes: state.actualBytes,
        artifactIds: state.artifactIds,
      });

    case "creating_zip":
      if (event.type === "ZIP_CREATION_STARTED") return state;
      if (event.type !== "ZIP_CREATED") return invalid(state, event);
      if (!event.zipRecordId.trim()) throw new Error("zipRecordId_required");
      return Object.freeze({
        status: "completed_zip",
        ...context(state),
        compressedRecordId: state.compressedRecordId,
        actualBytes: state.actualBytes,
        artifactIds: state.artifactIds,
        zipRecordId: event.zipRecordId,
      });

    case "completed_pdf":
    case "completed_zip":
    case "cancelled":
    case "failed":
    case "cancelling":
      return invalid(state, event);
  }
}
