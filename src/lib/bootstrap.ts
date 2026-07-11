const telemetryState = {
  sentryInitialized: false,
};

type TelemetryConfig = {
  sentryEnabled?: boolean;
  sentryDsn?: string;
};

export function createLogger(scope: string) {
  const prefix = `[pdf-compressor] ${scope}`;

  return {
    info(message: string, details?: unknown) {
      console.info(`${prefix}: ${message}`, details);
    },
    warn(message: string, details?: unknown) {
      console.warn(`${prefix}: ${message}`, details);
    },
    error(message: string, details?: unknown) {
      console.error(`${prefix}: ${message}`, details);
    },
  };
}

function getTelemetryConfig(): TelemetryConfig {
  return {
    sentryEnabled: import.meta.env.VITE_SENTRY_ENABLED === "true",
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  };
}

export async function initTelemetry(scope: string) {
  const logger = createLogger(scope);
  logger.info("starting");

  const { sentryEnabled, sentryDsn } = getTelemetryConfig();
  if (!sentryEnabled || !sentryDsn || telemetryState.sentryInitialized) {
    return { logger, sentry: false };
  }

  telemetryState.sentryInitialized = true;
  logger.info("Sentry bootstrap configured", { sentryDsn });

  return { logger, sentry: true };
}
