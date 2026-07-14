export const MEBIBYTE = 1024 * 1024;
export const FREE_MAX_PDF_BYTES = 100 * MEBIBYTE;
export const PRO_MAX_PDF_BYTES = 250 * MEBIBYTE;
export const LOW_MEMORY_THRESHOLD_GB = 4;
export const DEVICE_MEMORY_FALLBACK_GB = 4;

export type PdfSizeTier = "free" | "pro";

export function normalizeDeviceMemoryGb(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEVICE_MEMORY_FALLBACK_GB;
}

export function getDeviceMemoryGb(navigatorValue: unknown = globalThis.navigator) {
  const candidate = navigatorValue as { deviceMemory?: unknown } | null | undefined;
  return normalizeDeviceMemoryGb(candidate?.deviceMemory);
}

export function getMaxPdfBytes(tier: PdfSizeTier, deviceMemoryGb: unknown) {
  const baseMaxBytes = tier === "pro" ? PRO_MAX_PDF_BYTES : FREE_MAX_PDF_BYTES;
  return normalizeDeviceMemoryGb(deviceMemoryGb) < LOW_MEMORY_THRESHOLD_GB
    ? Math.min(baseMaxBytes, FREE_MAX_PDF_BYTES)
    : baseMaxBytes;
}
