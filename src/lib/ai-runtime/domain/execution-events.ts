import type { ExecutionFailure } from "./execution-errors.js";
import type { TargetContract } from "./target-contract.js";

export type ExecutionEvent =
  | { readonly type: "CONTRACT_CONFIRMED"; readonly executionId: string; readonly sourceRecordId: string; readonly contract: TargetContract }
  | { readonly type: "PLANNING_STARTED" }
  | { readonly type: "PLAN_READY"; readonly route: "local" | "office_current"; readonly preset: "safe" | "balanced" | "strong" }
  | { readonly type: "COMPRESSION_STARTED" }
  | { readonly type: "COMPRESSION_RESULT_RECEIVED"; readonly compressedRecordId: string; readonly metadataBytes: number }
  | { readonly type: "COMPRESSED_RESULT_VERIFIED"; readonly actualBytes: number }
  | { readonly type: "SPLIT_STARTED" }
  | { readonly type: "SPLIT_COMPLETED"; readonly artifactIds: readonly string[] }
  | { readonly type: "SPLIT_PARTS_VALIDATED"; readonly artifactIds: readonly string[] }
  | { readonly type: "ZIP_CREATION_STARTED" }
  | { readonly type: "ZIP_CREATED"; readonly zipRecordId: string }
  | { readonly type: "CANCEL_REQUESTED" }
  | { readonly type: "CANCELLED" }
  | { readonly type: "FAILED"; readonly failure: ExecutionFailure }
  | { readonly type: "RESET" };
