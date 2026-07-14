import { defineBackground } from "wxt/utils/define-background";
import browser from "webextension-polyfill";
import { createLogger, initTelemetry } from "../lib/bootstrap";
import type {
  BackgroundCompressionCancelRequest,
  BackgroundCompressionHealthRequest,
  BackgroundCompressionResultDeleteRequest,
  BackgroundCompressionResultReadRequest,
  BackgroundCompressionStartRequest,
  BackgroundRequest,
  BackgroundResponse,
} from "../lib/messaging";

const OFFSCREEN_URL = browser.runtime.getURL("offscreen.html");
const OFFSCREEN_REASON = "BLOBS";
let offscreenCreationPromise: Promise<{ supported: boolean; created: boolean }> | null = null;

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

  const createDocument = offscreen.offscreen.createDocument;

  if (offscreenCreationPromise) {
    return offscreenCreationPromise;
  }

  offscreenCreationPromise = (async () => {
    try {
      if (await hasOffscreenDocument()) {
        return { supported: true, created: false };
      }

      await createDocument({
        url: OFFSCREEN_URL,
        reasons: [OFFSCREEN_REASON],
        justification: "Provide local offscreen storage and compression workflows",
      });

      return { supported: true, created: true };
    } finally {
      offscreenCreationPromise = null;
    }
  })();

  return offscreenCreationPromise;
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

async function forwardToOffscreen<TResponse>(message: object): Promise<TResponse> {
  return (await browser.runtime.sendMessage(message)) as TResponse;
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
        case "background:compression-health": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-health" });
        }
        case "background:compression-start": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-start", mode: message.mode });
        }
        case "background:compression-cancel": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-cancel" });
        }
        case "background:compression-result-read": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-result-read", recordId: message.recordId });
        }
        case "background:compression-result-delete": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-result-delete" });
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
