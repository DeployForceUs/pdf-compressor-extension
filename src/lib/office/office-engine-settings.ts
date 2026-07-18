export const DEFAULT_OFFICE_ENGINE_URL = "https://pdf.aianswerline.live";
const STORAGE_KEY = "office-engine-connection-v1";

export type OfficeEngineSettings = {
  baseUrl: string;
  accessToken: string;
};

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

function isSettings(value: unknown): value is OfficeEngineSettings {
  return typeof value === "object" && value !== null &&
    typeof (value as OfficeEngineSettings).baseUrl === "string" &&
    typeof (value as OfficeEngineSettings).accessToken === "string";
}

export function createOfficeEngineSettingsStorage(storage: StorageArea) {
  return {
    async read(): Promise<OfficeEngineSettings | null> {
      const result = await storage.get(STORAGE_KEY);
      return isSettings(result[STORAGE_KEY]) ? result[STORAGE_KEY] : null;
    },
    async write(settings: OfficeEngineSettings) {
      await storage.set({ [STORAGE_KEY]: { ...settings } });
    },
    async clear() {
      await storage.remove(STORAGE_KEY);
    },
  };
}
