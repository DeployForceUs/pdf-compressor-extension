import type { BackgroundRequest, OffscreenRequest } from "./messaging";

const BACKGROUND_REQUEST_TYPES = new Set<BackgroundRequest["type"]>([
  "health:check",
  "offscreen:open",
  "offscreen:close",
  "background:compression-health",
  "background:compression-start",
  "background:compression-cancel",
  "background:compression-result-read",
  "background:compression-result-delete",
  "background:office-processing-start",
  "background:office-processing-cancel",
  "monetization:state",
  "license:activate",
  "license:check",
  "license:revoke",
  "split:local",
  "split:cancel",
  "split:result-read",
  "split:result-delete",
]);

const OFFSCREEN_REQUEST_TYPES = new Set<OffscreenRequest["type"]>([
  "offscreen:health",
  "storage:test-write",
  "storage:test-read",
  "storage:test-delete",
  "storage:test-compare",
  "pdf:store",
  "pdf:read",
  "pdf:delete",
  "offscreen:compression-health",
  "offscreen:compression-start",
  "offscreen:compression-cancel",
  "offscreen:compression-result-read",
  "offscreen:compression-result-delete",
  "offscreen:split",
  "offscreen:split-cancel",
  "offscreen:split-result-read",
  "offscreen:split-result-delete",
  "offscreen:office-processing-start",
  "offscreen:office-processing-cancel",
]);

function requestType(message: unknown): string | null {
  if (!message || typeof message !== "object" || !("type" in message)) return null;
  return typeof message.type === "string" ? message.type : null;
}

export function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  const type = requestType(message);
  const accepted = type !== null && BACKGROUND_REQUEST_TYPES.has(type as BackgroundRequest["type"]);

  if (type === "background:office-processing-start") {
    console.info("[offscreen-lifecycle 1/3] Background routing received Office Engine start", {
      accepted,
      type,
    });
  }

  return accepted;
}

export function isOffscreenRequest(message: unknown): message is OffscreenRequest {
  const type = requestType(message);
  const accepted = type !== null && OFFSCREEN_REQUEST_TYPES.has(type as OffscreenRequest["type"]);

  if (type === "offscreen:health") {
    console.info("[offscreen-lifecycle 2/3] Offscreen routing received health probe", {
      accepted,
      type,
    });
  } else if (type === "offscreen:office-processing-start") {
    console.info("[offscreen-lifecycle 3/3] Offscreen routing received Office Engine start", {
      accepted,
      type,
    });
  }

  return accepted;
}
