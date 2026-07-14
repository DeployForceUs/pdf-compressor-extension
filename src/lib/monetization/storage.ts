import type { DailyUsageState, UsageStorage } from "./limits";

export type ExtensionStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

function isDailyUsageState(value: unknown): value is DailyUsageState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DailyUsageState>;
  return candidate.version === 1
    && typeof candidate.date === "string"
    && typeof candidate.compressionCount === "number"
    && typeof candidate.splitCount === "number"
    && typeof candidate.fingerprint === "string"
    && (candidate.lastOperationAt === null || typeof candidate.lastOperationAt === "number");
}

export function createExtensionUsageStorage(storageArea: ExtensionStorageArea): UsageStorage {
  return {
    async get(key) {
      const values = await storageArea.get(key);
      const value = values[key];
      return isDailyUsageState(value) ? value : null;
    },
    async set(key, value) {
      await storageArea.set({ [key]: value });
    },
  };
}
