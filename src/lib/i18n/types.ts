export const supportedLocales = ["en", "es"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en";

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return supportedLocales.includes((value ?? "") as SupportedLocale);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const lower = (value ?? "").toLowerCase();
  const base = lower.split("-")[0];
  if (isSupportedLocale(base)) {
    return base;
  }
  return defaultLocale;
}
