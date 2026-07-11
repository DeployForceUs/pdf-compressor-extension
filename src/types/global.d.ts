declare module "*.css";

interface ImportMetaEnv {
  readonly MODE: string;
  readonly VITE_SENTRY_ENABLED?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface OffscreenDocumentOptions {
  url: string;
  reasons: string[];
  justification: string;
}

interface OffscreenAPI {
  createDocument(options: OffscreenDocumentOptions): Promise<void>;
  closeDocument(): Promise<void>;
  hasDocument?(): Promise<boolean>;
}
