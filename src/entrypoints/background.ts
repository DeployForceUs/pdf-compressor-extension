import { defineBackground } from "wxt/utils/define-background";
import browser from "webextension-polyfill";
import { createLogger, initTelemetry } from "../lib/bootstrap";
import type { BackgroundRequest, BackgroundResponse } from "../lib/messaging";

const OFFSCREEN_URL = browser.runtime.getURL("offscreen.html");
const OFFSCREEN_REASON = "BLOBS";

async function hasOffscreenDocument() {
  const offscreen = browser as typeof browser & {
    offscreen?: {
      hasDocument?: () => Promise<boolean>;
    };
  };

  if (!offscreen.offscreen?.hasDocument) {
    return false;
  }

  return offscreen.offscreen.hasDocument();
}

async function ensureOffscreenDocument() {
  const offscreen = browser as typeof browser & {
    offscreen?: {
      createDocument?: (options: { url: string; reasons: string[]; justification: string }) => Promise<void>;
    };
  };

  if (!offscreen.offscreen?.createDocument) {
    return { supported: false, created: false };
  }

  if (await hasOffscreenDocument()) {
    return { supported: true, created: false };
  }

  await offscreen.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [OFFSCREEN_REASON],
    justification: "Provide local IndexedDB-backed smoke tests for Phase 1",
  });

  return { supported: true, created: true };
}

async function closeOffscreenDocument() {
  const offscreen = browser as typeof browser & {
    offscreen?: {
      closeDocument?: () => Promise<void>;
    };
  };

  if (!offscreen.offscreen?.closeDocument) {
    return { supported: false, closed: false };
  }

  if (!(await hasOffscreenDocument())) {
    return { supported: true, closed: false };
  }

  await offscreen.offscreen.closeDocument();
  return { supported: true, closed: true };
}

export default defineBackground(() => {
  const logger = createLogger("background");
  void initTelemetry("background");

  async function handle(message: BackgroundRequest): Promise<BackgroundResponse | null> {
    try {
      switch (message.type) {
        case "health:check": {
          const response: BackgroundResponse = {
            ok: true,
            source: "background",
            offscreen: await hasOffscreenDocument(),
            details: "Background service worker is responsive",
          };
          logger.info("Processed background health check", response);
          return response;
        }
        case "offscreen:open": {
          const result = await ensureOffscreenDocument();
          return {
            ok: true,
            details: result.created ? "Offscreen created" : "Offscreen already open",
          };
        }
        case "offscreen:close": {
          const result = await closeOffscreenDocument();
          return {
            ok: true,
            details: result.closed ? "Offscreen closed" : "Offscreen already closed",
          };
        }
        default:
          return null;
      }
    } catch (error) {
      logger.error("Captured exception in background", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown background error",
      };
    }
  }

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void handle(message as BackgroundRequest).then((response) => {
      if (response) {
        sendResponse(response);
      }
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
