export type MonitoringConfig = {
  sentryEnabled: boolean;
  sentryDsn: string;
};

export function getMonitoringConfig(): MonitoringConfig {
  const sentryEnabled = import.meta.env.MODE === "production" && import.meta.env.VITE_SENTRY_ENABLED === "true";
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN ?? "";

  return {
    sentryEnabled,
    sentryDsn,
  };
}
