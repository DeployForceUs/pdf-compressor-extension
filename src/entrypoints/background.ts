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
  OffscreenHealthResponse,
  OffscreenSplitCancelRequest,
  OffscreenSplitRequest,
  OffscreenSplitResultDeleteRequest,
  OffscreenSplitResultReadRequest,
  SplitCancelRequest,
  SplitLocalRequest,
  SplitResultDeleteRequest,
  SplitResultReadRequest,
} from "../lib/messaging";
import { normalizeSplitOutputMode } from "../lib/messaging";
import { requireRuntimeMessageResponse } from "../lib/runtime-message-response";
import { isBackgroundRequest } from "../lib/message-routing";
import {
  isBackgroundSmartPlannerPrepareRequest,
  toOffscreenSmartPlannerPrepareRequest,
  type BackgroundSmartPlannerPrepareRequest,
  type SmartPlannerPrepareResponse,
} from "../lib/ai/smart-planner-runtime-message-contract";
import { tracePdfSplit } from "../lib/pdf-split-trace";
import { createUsageLimitService } from "../lib/monetization/limits";
import { STAGE_7_MVP_POLICY } from "../lib/monetization/policy";
import { createExtensionUsageStorage } from "../lib/monetization/storage";
import { createExtensionLicenseStorage } from "../lib/monetization/storage";
import { createLicenseService, type LicenseCheckResult } from "../lib/monetization/license";
import { PRO_LICENSE_PUBLIC_KEY_PEM } from "../lib/monetization/license-public-key";
import { createOperationAuthorizer, type OperationAuthorization } from "../lib/monetization/enforcement";
import { createOfficeEngineSettingsStorage } from "../lib/office/office-engine-settings";
import {
  cleanupExpiredPdfData,
  PDF_RETENTION_ALARM_NAME,
  PDF_RETENTION_ALARM_PERIOD_MINUTES,
} from "../lib/storage/pdf-retention";

const OFFSCREEN_URL = browser.runtime.getURL("offscreen.html");
const OFFSCREEN_REASON = "BLOBS";
// Offscreen startup can take several seconds immediately after an
// extension reload while Chrome evaluates and initializes the document bundle.
const OFFSCREEN_READY_ATTEMPTS = 100;
const OFFSCREEN_READY_DELAY_MS = 100;
let offscreenCreationPromise: Promise<{ supported: boolean; created: boolean }> | null = null;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
      let created = false;
      if (await hasOffscreenDocument()) {
        await waitForOffscreenReady();
        return { supported: true, created };
      }

      await createDocument({
        url: OFFSCREEN_URL,
        reasons: [OFFSCREEN_REASON],
        justification: "Provide local offscreen storage and compression workflows",
      });

      created = true;
      await waitForOffscreenReady();
      return { supported: true, created };
    } finally {
      offscreenCreationPromise = null;
    }
  })();

  return offscreenCreationPromise;
}

async function waitForOffscreenReady() {
  for (let attempt = 1; attempt <= OFFSCREEN_READY_ATTEMPTS; attempt += 1) {
    const response = await browser.runtime.sendMessage({ type: "offscreen:health" }).catch(() => null);
    if (
      response &&
      typeof response === "object" &&
      (response as Partial<OffscreenHealthResponse>).ok === true &&
      (response as Partial<OffscreenHealthResponse>).source === "offscreen"
    ) {
      return;
    }

    await delay(OFFSCREEN_READY_DELAY_MS);
  }

  throw new Error("Offscreen document did not become ready");
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
  const messageType = "type" in message && typeof message.type === "string" ? message.type : "offscreen message";
  return requireRuntimeMessageResponse<TResponse>(
    messageType,
    await browser.runtime.sendMessage(message),
  );
}

export default defineBackground(() => {
  const logger = createLogger("background");
  const officeSettingsStorage = createOfficeEngineSettingsStorage(browser.storage.local);
  const usageLimits = createUsageLimitService({
    storage: createExtensionUsageStorage(browser.storage.local),
  });
  const licenseService = createLicenseService({
    storage: createExtensionLicenseStorage(browser.storage.local),
    publicKeyPem: PRO_LICENSE_PUBLIC_KEY_PEM,
  });
  const authorizeOperation = createOperationAuthorizer({
    checkLicense: () => licenseService.check(),
    reserveUsage: (operation) => usageLimits.reserve(operation),
  });
  void initTelemetry("background");

  async function runRetentionCleanup() {
    try {
      const result = await cleanupExpiredPdfData();
      logger.info("Completed PDF retention cleanup", result);
    } catch (error) {
      logger.warn("PDF retention cleanup failed", error);
    }
  }

  void browser.alarms.create(PDF_RETENTION_ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: PDF_RETENTION_ALARM_PERIOD_MINUTES,
  });
  void runRetentionCleanup();

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PDF_RETENTION_ALARM_NAME) {
      void runRetentionCleanup();
    }
  });

  function licenseResponse(result: LicenseCheckResult) {
    if (result.valid) {
      return {
        ok: true as const,
        isPro: true,
        status: "active" as const,
        licenseId: result.claims.sub,
      };
    }

    return {
      ok: true as const,
      isPro: false,
      status: result.code === "NO_LICENSE" ? "inactive" as const : "invalid" as const,
      code: result.code,
    };
  }

  function deniedOperationResponse(result: Extract<OperationAuthorization, { allowed: false }>) {
    const error = result.code === "PRO_REQUIRED"
      ? "A Pro license is required for this operation"
      : result.code === "FREE_COOLDOWN_ACTIVE"
        ? "The Free operation cooldown is active"
        : "The Free daily operation limit has been reached";
    return {
      ok: false as const,
      error,
      code: result.code,
      operation: result.operation,
      remaining: result.remaining,
      retryAfterMs: result.retryAfterMs,
    };
  }

  async function prepareSmartPlannerViaOffscreen(
    message: BackgroundSmartPlannerPrepareRequest,
  ): Promise<SmartPlannerPrepareResponse> {
    await ensureOffscreenDocument();
    return forwardToOffscreen<SmartPlannerPrepareResponse>(
      toOffscreenSmartPlannerPrepareRequest(message),
    );
  }

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
        case "monetization:state": {
          const license = await licenseService.check();
          return {
            ok: true,
            tier: license.valid ? "pro" : "free",
            policy: STAGE_7_MVP_POLICY,
            usage: await usageLimits.snapshot(),
          };
        }
        case "license:activate": {
          return licenseResponse(await licenseService.activate(message.token));
        }
        case "license:check": {
          return licenseResponse(await licenseService.check());
        }
        case "license:revoke": {
          await licenseService.revoke();
          return licenseResponse({ valid: false, code: "NO_LICENSE" });
        }
        case "background:compression-health": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:compression-health" });
        }
        case "background:compression-start": {
          const authorization = await authorizeOperation("compression");
          if (!authorization.allowed) {
            return deniedOperationResponse(authorization);
          }
          await ensureOffscreenDocument();
          return forwardToOffscreen({
            type: "offscreen:compression-start",
            mode: message.mode,
            quality: message.quality,
          });
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
        case "background:office-processing-start": {
          const authorization = await authorizeOperation("compression");
          if (!authorization.allowed) return deniedOperationResponse(authorization);

          const settings = await officeSettingsStorage.read();
          if (!settings) {
            return {
              ok: false,
              error: "Office Engine is not connected",
            };
          }

          await ensureOffscreenDocument();
          return forwardToOffscreen({
            type: "offscreen:office-processing-start",
            baseUrl: settings.baseUrl,
            accessToken: settings.accessToken,
          });
        }
        case "background:office-processing-cancel": {
          await ensureOffscreenDocument();
          return forwardToOffscreen({ type: "offscreen:office-processing-cancel" });
        }
        case "split:local": {
          const authorization = await authorizeOperation("split", { proRequired: message.compressAfter === true });
          if (!authorization.allowed) {
            return deniedOperationResponse(authorization);
          }
          const outputMode = normalizeSplitOutputMode(message.outputMode);
          tracePdfSplit({
            outputMode,
            stage: "background-received-request",
            messageDirection: "popup->background",
            success: true,
          });
          await ensureOffscreenDocument();
          tracePdfSplit({
            outputMode,
            stage: "background-forwarding-request",
            messageDirection: "background->offscreen",
            success: true,
          });
          try {
            const response = await forwardToOffscreen<BackgroundResponse>({
              type: "offscreen:split",
              strategy: message.strategy,
              outputMode: message.outputMode,
              compressAfter: message.compressAfter,
              compressionQuality: message.compressionQuality,
            } as OffscreenSplitRequest);
            tracePdfSplit({
              outputMode,
              stage: "background-received-response",
              messageDirection: "offscreen->background",
              success: true,
            });
            return response;
          } catch (error) {
            tracePdfSplit({
              outputMode,
              stage: "background-received-response",
              messageDirection: "offscreen->background",
              success: false,
              error,
            });
            throw error;
          }
        }
        case "split:cancel": {
          await ensureOffscreenDocument();
          return forwardToOffscreen<BackgroundResponse>({ type: "offscreen:split-cancel" } as OffscreenSplitCancelRequest);
        }
        case "split:result-read": {
          await ensureOffscreenDocument();
          return forwardToOffscreen<BackgroundResponse>({ type: "offscreen:split-result-read", recordId: message.recordId } as OffscreenSplitResultReadRequest);
        }
        case "split:result-delete": {
          await ensureOffscreenDocument();
          return forwardToOffscreen<BackgroundResponse>({ type: "offscreen:split-result-delete", recordId: message.recordId } as OffscreenSplitResultDeleteRequest);
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

  const backgroundMessageListener = (
    message: unknown,
  ) => {
    if (isBackgroundSmartPlannerPrepareRequest(message)) {
      return prepareSmartPlannerViaOffscreen(message);
    }
    if (!isBackgroundRequest(message)) return undefined;
    return handle(message);
  };

  // webextension-polyfill owns the callback bridge. Returning the Promise is
  // the only response mechanism; mixing `return true` with sendResponse can
  // leave Chromium waiting on a channel whose extension context has closed.
  browser.runtime.onMessage.addListener(
    backgroundMessageListener as unknown as Parameters<typeof browser.runtime.onMessage.addListener>[0],
  );

  browser.runtime.onInstalled.addListener(() => {
    logger.info("Extension installed");
  });

  browser.runtime.onStartup.addListener(() => {
    logger.info("Extension startup");
  });
});
