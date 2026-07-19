import type { OfficeProcessingStartResponse } from "../messaging";

export function dispatchOfficeProcessing(
  run: () => Promise<unknown>,
  onUnexpectedError: (error: unknown) => void,
): OfficeProcessingStartResponse {
  void run().catch(onUnexpectedError);
  return {
    ok: true,
    accepted: true,
    details: "Office Engine processing started in the offscreen document",
  };
}
