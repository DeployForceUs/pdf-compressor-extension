import { defineBackground } from "wxt/utils/define-background";
import browser from "webextension-polyfill";
import { captureException, initSentry } from "../lib/monitoring/sentry";
import { logger } from "../lib/monitoring/logger";
import { type AppMessage, type AppResponse, type HealthCheckResponse } from "../lib/messaging";
import { closeOffscreenDocument, ensureOffscreenDocument, hasOffscreenDocument } from "../lib/offscreen-manager";

export default defineBackground(() => {
  logger.info("Background service worker starting");
  void initSentry("background");

  async function handleMessage(message: AppMessage): Promise<AppResponse | null> {
    try {
      switch (message.type) {
        case "health:check": {
          const offscreen = await hasOffscreenDocument();
          const response: HealthCheckResponse = {
            ok: true,
            source: "background",
            offscreen,
            details: "Background service worker is responsive",
          };
          logger.info("Processed background health check", response);
          return response;
        }
        case "offscreen:open": {
          const result = await ensureOffscreenDocument();
          return { ok: true, details: result.created ? "Offscreen created" : "Offscreen already open" };
        }
        case "offscreen:close": {
          const result = await closeOffscreenDocument();
          return { ok: true, details: result.closed ? "Offscreen closed" : "Offscreen already closed" };
        }
        case "offscreen:health":
        case "storage:test-write":
        case "storage:test-read":
        case "storage:test-delete":
        case "storage:test-compare":
          return null;
        default:
          return { ok: false, error: "Unsupported message type" };
      }
    } catch (error) {
      captureException(error, "background");
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown background error",
      };
    }
  }

  browser.runtime.onMessage.addListener((message: AppMessage, _sender, sendResponse) => {
    void handleMessage(message).then((response) => {
      if (response) sendResponse(response);
    });
    return true;
  });

  browser.runtime.onInstalled.addListener(() => {
    logger.info("Extension installed");
  });

  browser.runtime.onStartup.addListener(() => {
    logger.info("Extension startup");
  });
});
