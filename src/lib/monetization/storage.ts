import type { DailyUsageState, UsageStorage } from "./limits";
import type { LicenseStorage, StoredProLicense } from "./license";

export type ExtensionStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove?: (key: string) => Promise<void>;
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

function isStoredProLicense(value: unknown): value is StoredProLicense {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredProLicense>;
  return candidate.version === 1
    && typeof candidate.token === "string"
    && typeof candidate.activatedAt === "number"
    && !!candidate.claims
    && typeof candidate.claims === "object";
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

export function createExtensionLicenseStorage(storageArea: ExtensionStorageArea): LicenseStorage {
  if (!storageArea.remove) {
    throw new Error("License storage requires remove support");
  }
  const remove = storageArea.remove.bind(storageArea);

  return {
    async get(key) {
      const values = await storageArea.get(key);
      const value = values[key];
      return isStoredProLicense(value) ? value : null;
    },
    async set(key, value) {
      await storageArea.set({ [key]: value });
    },
    async remove(key) {
      await remove(key);
    },
  };
}
