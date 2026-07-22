export type ExecutionErrorCode =
  | "invalid_transition"
  | "planning_failed"
  | "compression_failed"
  | "compressed_result_missing"
  | "compressed_result_mismatch"
  | "split_failed"
  | "split_part_oversized"
  | "split_part_invalid"
  | "zip_creation_failed"
  | "cancelled";

export interface ExecutionFailure {
  readonly code: ExecutionErrorCode;
  readonly message: string;
  readonly terminal: boolean;
}

export function executionFailure(
  code: ExecutionErrorCode,
  message: string,
  terminal = true,
): ExecutionFailure {
  if (!message.trim()) throw new Error("executionFailure_message_required");
  return Object.freeze({ code, message, terminal });
}
