import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { initI18n } from "../../lib/i18n/config";
import { formatBytes, formatDuration, normalizeLocale } from "../../lib/i18n/helpers";
import { MAX_PDF_BYTES, validatePdfFile } from "../../lib/pdf-validation";
import type {
  BackgroundHealthResponse,
  OffscreenControlResponse,
  OffscreenHealthResponse,
  PdfDeleteResponse,
  PdfReadResponse,
  PdfStoreResponse,
  StorageCompareResponse,
  StorageReadResponse,
  StorageWriteResponse,
} from "../../lib/messaging";
import { sendMessage } from "../../lib/messaging";
import { SELECTED_PDF_RECORD_ID, usePopupStore } from "./store";
import "../../styles/popup.css";

function bytesEqual(left: ArrayBuffer, right: ArrayBuffer) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

function fileNameFallback(name: string | null) {
  return name ?? "—";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function formatPdfStatus(t: (key: string, options?: Record<string, unknown>) => string, status: string, error: string) {
  if (status === "idle") {
    return t("pdfInput.idle");
  }

  if (status === "validating") {
    return t("pdfInput.validating");
  }

  if (status === "ready") {
    return t("pdfInput.ready");
  }

  return error || t("pdfInput.invalidPdf");
}

function Popup() {
  const { i18n, t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locale = normalizeLocale(i18n?.resolvedLanguage ?? i18n?.language);
  const pdf = usePopupStore((state) => state.pdf);
  const background = usePopupStore((state) => state.background);
  const offscreen = usePopupStore((state) => state.offscreen);
  const storage = usePopupStore((state) => state.storage);
  const diagnosticsOpen = usePopupStore((state) => state.diagnosticsOpen);
  const dragActive = usePopupStore((state) => state.dragActive);
  const setPdf = usePopupStore((state) => state.setPdf);
  const resetPdf = usePopupStore((state) => state.resetPdf);
  const setBackground = usePopupStore((state) => state.setBackground);
  const setOffscreen = usePopupStore((state) => state.setOffscreen);
  const setStorage = usePopupStore((state) => state.setStorage);
  const setDiagnosticsOpen = usePopupStore((state) => state.setDiagnosticsOpen);
  const setDragActive = usePopupStore((state) => state.setDragActive);

  useEffect(() => {
    document.title = t("app.documentTitle");
    document.documentElement.lang = locale;
  }, [locale, t]);

  useEffect(() => {
    void runBackgroundHealthCheck();
  }, []);

  useEffect(() => {
    void restoreSelectedPdf();
  }, []);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function ensureOffscreenDocument() {
    const openResult = await sendMessage<OffscreenControlResponse>({ type: "offscreen:open" });
    return openResult;
  }

  function translateValidationIssue(issue: "empty" | "tooLarge" | "unsupported" | "invalid") {
    switch (issue) {
      case "empty":
        return t("pdfInput.emptyFile");
      case "tooLarge":
        return t("pdfInput.fileTooLarge", {
          maxBytes: formatBytes(MAX_PDF_BYTES, locale),
        });
      case "unsupported":
        return t("pdfInput.unsupportedFile");
      case "invalid":
        return t("pdfInput.invalidPdf");
      default:
        return t("errors.storage");
    }
  }

  async function persistPdfFile(file: File) {
    setPdf({
      status: "validating",
      selected: false,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || null,
      recordId: null,
      storedByteLength: null,
      readBackByteLength: null,
      error: "",
    });

    const validation = await validatePdfFile(file);

    if (!validation.ok) {
      setPdf({
        status: "error",
        selected: false,
        error: translateValidationIssue(validation.issue),
      });
      return;
    }

    const { bytes, fileName, fileSize, mimeType } = validation.file;
    const byteArray = Array.from(new Uint8Array(bytes));
    const recordId = SELECTED_PDF_RECORD_ID;

    try {
      await ensureOffscreenDocument();

      const storeResponse = await sendMessage<PdfStoreResponse>({
        type: "pdf:store",
        record: {
          id: recordId,
          name: fileName,
          size: fileSize,
          type: mimeType || null,
          lastModified: file.lastModified,
          data: byteArray,
        },
      });
      const readBack = await sendMessage<PdfReadResponse>({
        type: "pdf:read",
        recordId,
      });

      console.info("[pdf-compressor] PDF record persistence debug", {
        writtenRecordId: recordId,
        readRecordId: readBack.recordId,
        found: readBack.record !== null,
      });

      if (!readBack.record) {
        throw new Error(`Local PDF record was not returned after persistence (recordId=${recordId})`);
      }

      const storedBytes = new Uint8Array(readBack.record.data).buffer;

      if (readBack.byteLength !== byteArray.length || !bytesEqual(bytes, storedBytes)) {
        throw new Error(
          `Local PDF verification failed: wrote ${byteArray.length} bytes, read ${readBack.byteLength} bytes (recordId=${recordId})`,
        );
      }

      setPdf({
        status: "ready",
        selected: true,
        fileName: readBack.record.name,
        fileSize: readBack.record.size,
        mimeType: readBack.record.type,
        recordId: storeResponse.recordId,
        storedByteLength: storeResponse.byteLength,
        readBackByteLength: readBack.byteLength,
        error: "",
      });
      console.info("[pdf-compressor] Selected PDF stored and verified locally", {
        recordId: storeResponse.recordId,
        storedByteLength: storeResponse.byteLength,
        readBackByteLength: readBack.byteLength,
        status: "ready",
      });
    } catch (error) {
      try {
        await sendMessage<PdfDeleteResponse>({
          type: "pdf:delete",
          recordId,
        });
      } catch {
        // Best effort cleanup only.
      }

      setPdf({
        status: "error",
        selected: false,
        error: errorMessage(error, t("errors.storage")),
      });
    } finally {
      resetFileInput();
      setDragActive(false);
    }
  }

  async function restoreSelectedPdf() {
    try {
      await ensureOffscreenDocument();
      const readBack = await sendMessage<PdfReadResponse>({
        type: "pdf:read",
        recordId: SELECTED_PDF_RECORD_ID,
      });

      console.info("[pdf-compressor] PDF restore debug", {
        requestedRecordId: SELECTED_PDF_RECORD_ID,
        found: readBack.record !== null,
      });

      if (!readBack.record) {
        return;
      }

      setPdf({
        status: "ready",
        selected: true,
        fileName: readBack.record.name,
        fileSize: readBack.record.size,
        mimeType: readBack.record.type,
        recordId: readBack.record.id,
        storedByteLength: readBack.byteLength,
        readBackByteLength: readBack.byteLength,
        error: "",
      });
      console.info("[pdf-compressor] Selected PDF restored locally", {
        recordId: readBack.record.id,
        byteLength: readBack.byteLength,
        status: "ready",
      });
    } catch (error) {
      setPdf({
        status: "error",
        selected: false,
        error: errorMessage(error, t("errors.storage")),
      });
    }
  }

  async function handlePickedFile(file: File | undefined) {
    if (!file) {
      return;
    }

    await persistPdfFile(file);
  }

  async function clearSelectedPdf() {
    const recordId = pdf.recordId ?? SELECTED_PDF_RECORD_ID;

    try {
      await sendMessage<PdfDeleteResponse>({
        type: "pdf:delete",
        recordId,
      });
    } catch {
      // Best effort cleanup only.
    }

    resetPdf();
    resetFileInput();
    console.info("[pdf-compressor] Selected PDF cleared locally", { recordId, status: "idle" });
  }

  async function runBackgroundHealthCheck() {
    const started = performance.now();
    setBackground({
      checked: false,
      durationMs: null,
      error: "",
    });

    try {
      const response = await sendMessage<BackgroundHealthResponse>({ type: "health:check" });
      const durationMs = performance.now() - started;
      setBackground({
        checked: true,
        durationMs,
        error: "",
      });
      console.info("[pdf-compressor] Background health check completed", response);
    } catch (error) {
      setBackground({
        checked: true,
        durationMs: null,
        error: error instanceof Error ? error.message : t("errors.popup"),
      });
    }
  }

  async function validateOffscreenDocument() {
    const started = performance.now();
    setOffscreen({
      checked: false,
      durationMs: null,
      error: "",
    });

    try {
      const openResult = await sendMessage<OffscreenControlResponse>({ type: "offscreen:open" });
      console.info("[pdf-compressor] Offscreen open result", openResult);
      const health = await sendMessage<OffscreenHealthResponse>({ type: "offscreen:health" });
      const durationMs = performance.now() - started;
      setOffscreen({
        checked: true,
        durationMs,
        error: "",
      });
      console.info("[pdf-compressor] Offscreen health check completed", health);
    } catch (error) {
      setOffscreen({
        checked: true,
        durationMs: null,
        error: error instanceof Error ? error.message : t("errors.offscreen"),
      });
    }
  }

  async function runIndexedDbSmokeTest() {
    const started = performance.now();
    setStorage({
      checked: false,
      durationMs: null,
      error: "",
      summary: null,
    });

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

      const durationMs = performance.now() - started;
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

      setStorage({
        checked: true,
        durationMs,
        summary: {
          savedBytes: writeResult.byteLength,
          readBytes: readResult.byteLength,
          compareEqual: compareResult.equal,
          deleteOk: true,
          missingRecordVerified: true,
        },
        error: "",
      });

      console.info("[pdf-compressor] IndexedDB smoke test summary", summary);
    } catch (error) {
      setStorage({
        checked: true,
        durationMs: performance.now() - started,
        summary: null,
        error: errorMessage(error, t("errors.storage")),
      });
    }
  }

  const backgroundValue = background.error
    ? background.error
    : !background.checked
      ? t("status.checking")
      : t("status.ready");
  const backgroundMetric = background.durationMs !== null ? formatDuration(background.durationMs, locale) : "";

  const offscreenValue = offscreen.error
    ? offscreen.error
    : !offscreen.checked
      ? t("status.notYetChecked")
      : t("status.ready");
  const offscreenMetric = offscreen.durationMs !== null ? formatDuration(offscreen.durationMs, locale) : "";

  const storageValue = storage.error
    ? storage.error
    : !storage.checked || !storage.summary
      ? t("status.notRun")
      : t("messages.storageStatus", {
          compareStatus: storage.summary.compareEqual ? t("compare.match") : t("compare.mismatch"),
          deleteStatus: t("common.ok"),
          missingRecordStatus: t("common.verified"),
        });
  const storageMetric =
    storage.checked && storage.summary
      ? `${formatBytes(storage.summary.savedBytes, locale)} / ${formatBytes(storage.summary.readBytes, locale)}`
      : "";

  const pdfStatusLabel = formatPdfStatus(t, pdf.status, pdf.error);
  const pdfMetric = pdf.selected && pdf.fileSize > 0 ? formatBytes(pdf.fileSize, locale) : "";
  const pdfHasFile = pdf.fileName !== null;
  const pdfSelectedLabel = pdf.selected ? t("pdfInput.selected") : t("pdfInput.notSelected");

  return (
    <main className="app">
      <section className="shell">
        <header className="hero">
          <div className="hero__brand">
            <div className="hero__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                <path
                  d="M7 2.75h6.7l3.8 3.8V20a1.25 1.25 0 0 1-1.25 1.25H7A1.25 1.25 0 0 1 5.75 20V4A1.25 1.25 0 0 1 7 2.75Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M13.5 2.9V7h4.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8.25 10.25h7.5M8.25 13h7.5M8.25 15.75h5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="hero__copy">
              <p className="eyebrow">{t("app.eyebrow")}</p>
              <h1>{t("app.title")}</h1>
              <p className="subtitle">{t("app.subtitle")}</p>
            </div>
          </div>
          <LanguageSwitcher />
        </header>

        <div className="body">
          <article className="input-card">
            <div className="input-card__header">
              <div className="input-card__title">
                <span className="status-dot" />
                <span>{t("pdfInput.title")}</span>
              </div>
              <span className="status-badge">{pdfStatusLabel}</span>
            </div>

            <div
              className={dragActive ? "dropzone dropzone--active" : "dropzone"}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                if (!dragActive) {
                  setDragActive(true);
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                void handlePickedFile(event.dataTransfer.files?.[0]);
              }}
              onClick={(event) => {
                if (event.currentTarget === event.target) {
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  void handlePickedFile(event.currentTarget.files?.[0]);
                  resetFileInput();
                }}
              />
              <p className="dropzone__eyebrow">{t("pdfInput.chooseFile")}</p>
              <h2>{t("pdfInput.dragAndDrop")}</h2>
              <p className="dropzone__note">{t("pdfInput.pdfOnly")}</p>
              <div className="dropzone__actions">
                <button type="button" className="primary" onClick={() => fileInputRef.current?.click()} disabled={pdf.status === "validating"}>
                  {pdfHasFile ? t("pdfInput.replaceFile") : t("pdfInput.chooseFile")}
                </button>
                {pdfHasFile ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void (async () => {
                        await clearSelectedPdf();
                        fileInputRef.current?.click();
                      })();
                    }}
                    disabled={pdf.status === "validating"}
                  >
                    {t("pdfInput.removeOrReplaceFile")}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="metadata-card">
              <div className="metadata-card__header">
                <div className="metadata-card__title">
                  <span className="status-dot" />
                  <span>{t("pdfInput.metadataTitle")}</span>
                </div>
                {pdfMetric ? <span className="status-badge">{pdfMetric}</span> : null}
              </div>
              <div className="metadata-grid">
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("pdfInput.fileName")}</span>
                  <span className="metadata-row__value">{fileNameFallback(pdf.fileName)}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("pdfInput.fileSize")}</span>
                  <span className="metadata-row__value">{pdf.fileSize > 0 ? formatBytes(pdf.fileSize, locale) : "—"}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("pdfInput.validationStatus")}</span>
                  <span className="metadata-row__value">{pdfStatusLabel}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("pdfInput.selectedState")}</span>
                  <span className="metadata-row__value">{pdfSelectedLabel}</span>
                </div>
              </div>
              {pdf.selected && pdf.recordId && pdf.storedByteLength !== null && pdf.readBackByteLength !== null ? (
                <div className="metadata-card__footnote">
                  {t("pdfInput.storageVerified", {
                    storedBytes: formatBytes(pdf.storedByteLength, locale),
                    readBytes: formatBytes(pdf.readBackByteLength, locale),
                  })}
                </div>
              ) : null}
            </div>

            {pdf.error ? <div className="error">{pdf.error}</div> : null}
          </article>

          <details
            className="diagnostics"
            open={diagnosticsOpen}
            onToggle={(event) => {
              setDiagnosticsOpen((event.currentTarget as HTMLDetailsElement).open);
            }}
          >
            <summary className="diagnostics__summary">
              <span className="diagnostics__label">{t("pdfInput.diagnostics")}</span>
            </summary>
            <div className="diagnostics__body">
              <div className="status-grid">
                <article className="status-card">
                  <div className="status-card__header">
                    <div className="status-card__title">
                      <span className="status-dot" />
                      <span>{t("status.background")}</span>
                    </div>
                    {backgroundMetric ? <span className="status-badge">{backgroundMetric}</span> : null}
                  </div>
                  <div className="status-card__message">{backgroundValue}</div>
                </article>

                <article className="status-card">
                  <div className="status-card__header">
                    <div className="status-card__title">
                      <span className="status-dot" />
                      <span>{t("status.offscreen")}</span>
                    </div>
                    {offscreenMetric ? <span className="status-badge">{offscreenMetric}</span> : null}
                  </div>
                  <div className="status-card__message">{offscreenValue}</div>
                </article>

                <article className="status-card">
                  <div className="status-card__header">
                    <div className="status-card__title">
                      <span className="status-dot" />
                      <span>{t("status.storage")}</span>
                    </div>
                    {storageMetric ? <span className="status-badge">{storageMetric}</span> : null}
                  </div>
                  <div className="status-card__message">{storageValue}</div>
                </article>
              </div>

              <div className="actions">
                <button type="button" onClick={() => void runBackgroundHealthCheck()} disabled={pdf.status === "validating"}>
                  {t("actions.rerunBackground")}
                </button>
                <button type="button" className="secondary" onClick={() => void validateOffscreenDocument()} disabled={pdf.status === "validating"}>
                  {t("actions.validateOffscreen")}
                </button>
                <button type="button" className="secondary" onClick={() => void runIndexedDbSmokeTest()} disabled={pdf.status === "validating"}>
                  {t("actions.runStorage")}
                </button>
              </div>
            </div>
          </details>

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
