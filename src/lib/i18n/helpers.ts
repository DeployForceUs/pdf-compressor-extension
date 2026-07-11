import { defaultLocale, normalizeLocale, supportedLocales, type SupportedLocale } from "./types";

export { defaultLocale, normalizeLocale, supportedLocales };

export function getLocale(locale?: string | null): SupportedLocale {
  return normalizeLocale(locale);
}

export function formatBytes(bytes: number, locale: string): string {
  const absolute = Math.abs(bytes);
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const unitIndex = absolute >= 1 ? Math.min(Math.floor(Math.log10(absolute) / 3), units.length - 1) : 0;
  const scaled = bytes / 1024 ** unitIndex;
  const minimumFractionDigits = Number.isInteger(scaled) ? 0 : 1;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits,
  }).format(scaled)} ${units[unitIndex]}`;
}

export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDuration(milliseconds: number, locale: string): string {
  if (milliseconds < 1000) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: milliseconds < 100 ? 0 : 1,
    }).format(milliseconds)} ms`;
  }

  const seconds = milliseconds / 1000;
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: seconds < 10 ? 2 : 1,
  }).format(seconds)} s`;
}
