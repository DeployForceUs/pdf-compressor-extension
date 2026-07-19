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

export function dispatchOfficeStartRequest<T>(
  send: () => Promise<T>,
  onResponse: (response: T) => void,
): void {
  // The popup is ephemeral. A closed runtime response channel is not evidence
  // that the persistent offscreen operation failed, so lifecycle events—not
  // this transport promise—are authoritative after dispatch.
  void send().then(onResponse).catch(() => undefined);
}
