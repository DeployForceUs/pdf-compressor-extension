import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { initI18n } from "../../lib/i18n/config";
import { formatBytes, formatDuration, formatPercent, normalizeLocale } from "../../lib/i18n/helpers";
import type {
  BackgroundHealthResponse,
  OffscreenControlResponse,
  OffscreenHealthResponse,
  StorageCompareResponse,
  StorageReadResponse,
  StorageWriteResponse,
} from "../../lib/messaging";
import { sendMessage } from "../../lib/messaging";
import "../../styles/popup.css";

type HealthSnapshot = {
  checked: boolean;
  durationMs: number | null;
  error: string;
};

type StorageSnapshot = {
  checked: boolean;
  summary: {
    savedBytes: number;
    readBytes: number;
    compareEqual: boolean;
  } | null;
  error: string;
};

type PopupState = {
  loading: boolean;
  background: HealthSnapshot;
  offscreen: HealthSnapshot;
  storage: StorageSnapshot;
};

const initialState: PopupState = {
  loading: false,
  background: {
    checked: false,
    durationMs: null,
    error: "",
  },
  offscreen: {
    checked: false,
    durationMs: null,
    error: "",
  },
  storage: {
    checked: false,
    summary: null,
    error: "",
  },
};

function Popup() {
  const { i18n, t } = useTranslation();
  const [state, setState] = useState<PopupState>(initialState);
  const locale = normalizeLocale(i18n?.resolvedLanguage ?? i18n?.language);

  useEffect(() => {
    document.title = t("app.documentTitle");
    document.documentElement.lang = locale;
  }, [locale, t]);

  async function runBackgroundHealthCheck() {
    const started = performance.now();
    setState((current) => ({
      ...current,
      loading: true,
      background: { ...current.background, error: "" },
    }));

    try {
      const response = await sendMessage<BackgroundHealthResponse>({ type: "health:check" });
      const durationMs = performance.now() - started;
      setState((current) => ({
        ...current,
        background: {
          checked: true,
          durationMs,
          error: "",
        },
      }));
      console.info("[pdf-compressor] Popup health check completed", response);
    } catch (error) {
      setState((current) => ({
        ...current,
        background: {
          ...current.background,
          checked: true,
          error: error instanceof Error ? error.message : t("errors.popup"),
        },
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }

  async function validateOffscreenDocument() {
    const started = performance.now();
    setState((current) => ({
      ...current,
      loading: true,
      offscreen: { ...current.offscreen, error: "" },
    }));

    try {
      const openResult = await sendMessage<OffscreenControlResponse>({ type: "offscreen:open" });
      console.info("[pdf-compressor] Offscreen open result", openResult);
      const health = await sendMessage<OffscreenHealthResponse>({ type: "offscreen:health" });
      const durationMs = performance.now() - started;
      setState((current) => ({
        ...current,
        offscreen: {
          checked: true,
          durationMs,
          error: "",
        },
      }));
      console.info("[pdf-compressor] Offscreen health check completed", health);
    } catch (error) {
      setState((current) => ({
        ...current,
        offscreen: {
          ...current.offscreen,
          checked: true,
          error: error instanceof Error ? error.message : t("errors.offscreen"),
        },
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }

  async function runIndexedDbSmokeTest() {
    setState((current) => ({
      ...current,
      loading: true,
      storage: { ...current.storage, error: "" },
    }));

    const key = "phase1-test-buffer";
    const bytes = [3, 1, 4, 1, 5, 9];

    try {
      await sendMessage<OffscreenControlResponse>({ type: "offscreen:open" });
      const writeResult = await sendMessage<StorageWriteResponse>({ type: "storage:test-write", key, bytes });
      const compareResult = await sendMessage<StorageCompareResponse>({ type: "storage:test-compare", key, bytes });
      const readResult = await sendMessage<StorageReadResponse>({ type: "storage:test-read", key });

      if (readResult.value && readResult.value.byteLength === 0) {
        throw new Error("IndexedDB smoke test returned an empty record");
      }

      await sendMessage({ type: "storage:test-delete", key });
      const missingResult = await sendMessage<StorageReadResponse>({ type: "storage:test-read", key });

      if (missingResult.value !== null && missingResult.value !== undefined) {
        throw new Error("Deleted IndexedDB record still present");
      }

      const summary = t("messages.storageSummary", {
        savedBytes: formatBytes(writeResult.byteLength, locale),
        readBytes: formatBytes(readResult.byteLength, locale),
        compareStatus: compareResult.equal ? t("compare.match") : t("compare.mismatch"),
        deleteStatus: t("common.ok"),
        missingRecordStatus: t("common.verified"),
      });

      console.info("[pdf-compressor] IndexedDB smoke test completed", {
        writeResult,
        compareResult,
        readResult,
      });

      setState((current) => ({
        ...current,
        storage: {
          checked: true,
          summary: {
            savedBytes: writeResult.byteLength,
            readBytes: readResult.byteLength,
            compareEqual: compareResult.equal,
          },
          error: "",
        },
      }));

      console.info("[pdf-compressor] IndexedDB smoke test summary", summary);
    } catch (error) {
      setState((current) => ({
        ...current,
        storage: {
          ...current.storage,
          checked: true,
          error: error instanceof Error ? error.message : t("errors.storage"),
        },
      }));
    } finally {
      setState((current) => ({ ...current, loading: false }));
    }
  }

  useEffect(() => {
    void runBackgroundHealthCheck();
  }, []);

  const backgroundValue = state.background.error
    ? state.background.error
    : !state.background.checked
      ? t("status.checking")
      : state.background.durationMs !== null
        ? `${t("messages.backgroundHealthOk")} · ${formatDuration(state.background.durationMs, locale)}`
        : t("common.responsive");

  const offscreenValue = state.offscreen.error
    ? state.offscreen.error
    : !state.offscreen.checked
      ? t("status.notYetChecked")
      : state.offscreen.durationMs !== null
        ? `${t("messages.offscreenHealthOk")} · ${formatDuration(state.offscreen.durationMs, locale)}`
        : t("common.responsive");

  const storageValue = state.storage.error
    ? state.storage.error
    : !state.storage.checked || !state.storage.summary
      ? t("status.notRun")
      : t("messages.storageSummary", {
          savedBytes: formatBytes(state.storage.summary.savedBytes, locale),
          readBytes: formatBytes(state.storage.summary.readBytes, locale),
          compareStatus: state.storage.summary.compareEqual ? t("compare.match") : t("compare.mismatch"),
          deleteStatus: t("common.ok"),
          missingRecordStatus: t("common.verified"),
        });

  return (
    <main className="app">
      <section className="panel">
        <header className="hero">
          <p className="eyebrow">{t("app.eyebrow")}</p>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </header>

        <div className="body">
          <LanguageSwitcher />

          <div className="status-grid">
            <div className="status-row">
              <span className="status-label">{t("status.background")}</span>
              <span className="status-value">{backgroundValue}</span>
            </div>
            <div className="status-row">
              <span className="status-label">{t("status.offscreen")}</span>
              <span className="status-value">{offscreenValue}</span>
            </div>
            <div className="status-row">
              <span className="status-label">{t("status.storage")}</span>
              <span className="status-value">{storageValue}</span>
            </div>
          </div>

          <div className="actions">
            <button type="button" onClick={() => void runBackgroundHealthCheck()} disabled={state.loading}>
              {t("actions.rerunBackground")}
            </button>
            <button type="button" className="secondary" onClick={() => void validateOffscreenDocument()} disabled={state.loading}>
              {t("actions.validateOffscreen")}
            </button>
            <button type="button" className="secondary" onClick={() => void runIndexedDbSmokeTest()} disabled={state.loading}>
              {t("actions.runStorage")}
            </button>
          </div>

          <div className="footnote">
            {t("app.localOnly", {
              percent: formatPercent(1, locale),
            })}
          </div>
          <div className="footnote">{t("footnote.localOnly")}</div>
        </div>
      </section>
    </main>
  );
}

async function main() {
  const i18n = await initI18n();
  document.title = i18n.t("app.documentTitle");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}

void main();
