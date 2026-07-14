export const COMPRESSION_QUALITY_STORAGE_KEY = "stage7:compression-quality";
export const DEFAULT_COMPRESSION_QUALITY = 60;
export const MIN_COMPRESSION_QUALITY = 10;
export const MAX_COMPRESSION_QUALITY = 100;

export type CompressionQualityStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

export function normalizeCompressionQuality(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_COMPRESSION_QUALITY;
  }

  return Math.min(
    MAX_COMPRESSION_QUALITY,
    Math.max(MIN_COMPRESSION_QUALITY, Math.round(value)),
  );
}

export function createCompressionQualityStorage(storage: CompressionQualityStorageArea) {
  return {
    async read() {
      const stored = await storage.get(COMPRESSION_QUALITY_STORAGE_KEY);
      return normalizeCompressionQuality(stored[COMPRESSION_QUALITY_STORAGE_KEY]);
    },
    async write(quality: number) {
      const normalized = normalizeCompressionQuality(quality);
      await storage.set({ [COMPRESSION_QUALITY_STORAGE_KEY]: normalized });
      return normalized;
    },
  };
}
