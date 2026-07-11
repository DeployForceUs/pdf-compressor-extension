import { getMonitoringConfig } from "../config/env";
import { logger } from "./logger";

let sentryInitialized = false;

export async function initSentry(scope: string) {
  const { sentryEnabled, sentryDsn } = getMonitoringConfig();

  if (!sentryEnabled || !sentryDsn || sentryInitialized) {
    return { enabled: false };
  }

  const Sentry = await import("@sentry/browser");

  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0,
  });

  sentryInitialized = true;
  logger.info(`Sentry initialized for ${scope}`);
  return { enabled: true };
}

export function captureException(error: unknown, scope: string) {
  const { sentryEnabled, sentryDsn } = getMonitoringConfig();

  logger.error(`Captured exception in ${scope}`, {
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
  });

  if (!sentryEnabled || !sentryDsn) {
    return false;
  }

  void import("@sentry/browser").then((Sentry) => {
    Sentry.captureException(error);
  });

  return true;
}
