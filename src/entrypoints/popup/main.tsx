import { StrictMode, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import browser from "webextension-polyfill";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { initI18n } from "../../lib/i18n/config";
import { formatBytes, formatDuration, formatPercent, normalizeLocale } from "../../lib/i18n/helpers";
import { MAX_PDF_BYTES, validatePdfFile } from "../../lib/pdf-validation";
import type {
  BackgroundCompressionCancelRequest,
  BackgroundCompressionHealthRequest,
  BackgroundCompressionResultDeleteRequest,
  BackgroundCompressionResultReadRequest,
  BackgroundCompressionStartRequest,
  BackgroundHealthResponse,
  OffscreenControlResponse,
  OffscreenHealthResponse,
  CompressionErrorEvent,
  CompressionHealthResponse,
  CompressionResultMetadata,
  CompressionCancelResponse,
  CompressionProgressEvent,
  CompressionResultDeleteResponse,
  CompressionResultReadResponse,
  CompressionStartResponse,
  PdfDeleteResponse,
  PdfReadResponse,
  PdfStoreResponse,
  StorageCompareResponse,
  StorageReadResponse,
  StorageWriteResponse,
} from "../../lib/messaging";
import { sendMessage } from "../../lib/messaging";
import { COMPRESSED_PDF_RECORD_ID } from "../../lib/pdf-records";
import { readCompressionResult } from "../../lib/storage/pdf-compression-db";
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

function isValidByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeSmokeReadResult(
  value: StorageReadResponse["value"],
  byteLength: StorageReadResponse["byteLength"],
  label: string,
) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} returned an invalid IndexedDB smoke-test payload`);
  }

  if (!isValidByteCount(byteLength)) {
    throw new Error(`${label} returned an invalid byte count`);
  }

  if (!value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    throw new Error(`${label} returned non-byte data`);
  }

  if (value.length !== byteLength) {
    throw new Error(`${label} byte count mismatch: data=${value.length}, reported=${byteLength}`);
  }

  return value;
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

function isCompressionProgressEvent(message: unknown): message is CompressionProgressEvent {
  return typeof message === "object" && message !== null && (message as CompressionProgressEvent).type === "compression:progress";
}

function isCompressionResultEvent(message: unknown): message is { type: "compression:result"; result: CompressionResultMetadata } {
  return typeof message === "object" && message !== null && (message as { type?: string }).type === "compression:result";
}

function isPdfArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function assertDownloadablePdf(record: Awaited<ReturnType<typeof readCompressionResult>>): ArrayBuffer {
  if (!record) {
    throw new Error("Compressed PDF record was not found in IndexedDB");
  }

  if (!isPdfArrayBuffer(record.data)) {
    throw new Error("Compressed PDF record data is not an ArrayBuffer");
  }

  if (record.data.byteLength !== record.compressedSize) {
    throw new Error(
      `Compressed PDF byte count mismatch: data=${record.data.byteLength}, metadata=${record.compressedSize}`,
    );
  }

  const header = new TextDecoder().decode(new Uint8Array(record.data).slice(0, 5));
  if (header !== "%PDF-") {
    throw new Error("Compressed PDF record does not start with %PDF-");
  }

  return record.data;
}

function isCompressionErrorEvent(message: unknown): message is CompressionErrorEvent {
  return typeof message === "object" && message !== null && (message as CompressionErrorEvent).type === "compression:error";
}

function isCompressionHealthResponse(message: unknown): message is CompressionHealthResponse {
  return typeof message === "object" && message !== null && (message as CompressionHealthResponse).engine === "mupdf";
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

function formatCompressionStatus(
  t: (key: string, options?: Record<string, unknown>) => string,
  status: string,
  error: string,
) {
  if (status === "loading-engine") {
    return t("compression.loadingEngine");
  }

  if (status === "compressing") {
    return t("compression.compressing");
  }

  if (status === "cancelling") {
    return t("compression.cancelling");
  }

  if (status === "cancelled") {
    return t("compression.cancelled");
  }

  if (status === "complete") {
    return t("compression.complete");
  }

  if (status === "error") {
    return error || t("compression.compressionFailed");
  }

  return t("compression.idle");
}

function translateCompressionError(t: (key: string, options?: Record<string, unknown>) => string, code: string, fallback: string) {
  switch (code) {
    case "WASM_NOT_SUPPORTED":
      return t("compression.wasmNotSupported");
    case "WASM_LOAD_FAILED":
      return t("compression.wasmLoadFailed");
    case "TIMEOUT":
      return t("compression.timeout");
    case "CANCELLED":
      return t("compression.cancelled");
    case "INVALID_PDF":
      return t("compression.invalidPdf");
    default:
      return fallback || t("compression.compressionFailed");
  }
}

function Popup() {
  const { i18n, t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locale = normalizeLocale(i18n?.resolvedLanguage ?? i18n?.language);
  const pdf = usePopupStore((state) => state.pdf);
  const compression = usePopupStore((state) => state.compression);
  const background = usePopupStore((state) => state.background);
  const offscreen = usePopupStore((state) => state.offscreen);
  const storage = usePopupStore((state) => state.storage);
  const diagnosticsOpen = usePopupStore((state) => state.diagnosticsOpen);
  const dragActive = usePopupStore((state) => state.dragActive);
  const setPdf = usePopupStore((state) => state.setPdf);
  const resetPdf = usePopupStore((state) => state.resetPdf);
  const setCompression = usePopupStore((state) => state.setCompression);
  const resetCompression = usePopupStore((state) => state.resetCompression);
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

  useEffect(() => {
    void restoreCompressionEngine();
    void restoreCompressionResult();
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isCompressionProgressEvent(message)) {
        applyCompressionProgress(message);
        return;
      }

      if (isCompressionResultEvent(message)) {
        applyCompressionResult(message.result);
        return;
      }

      if (isCompressionErrorEvent(message)) {
        setCompression({
          status: message.code === "CANCELLED" ? "cancelled" : "error",
          progress: 0,
          stage: "idle",
          error: translateCompressionError(t, message.code, message.message),
        });
        return;
      }

      if (isCompressionHealthResponse(message)) {
        setCompression({
          engineStatus: message.status,
          error:
            message.status === "unsupported"
              ? t("compression.wasmNotSupported")
              : message.status === "failed"
                ? t("compression.wasmLoadFailed")
                : "",
        });
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [applyCompressionProgress, applyCompressionResult, setCompression, t]);

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

  function applyCompressionResult(result: CompressionResultMetadata, status: "complete" | "cancelled" = "complete") {
    setCompression({
      status,
      engineStatus: "ready",
      progress: 100,
      stage: "complete",
      error: "",
      recordId: result.id,
      fileName: result.fileName,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      savedBytes: result.savedBytes,
      savedPercent: result.savedPercent,
      pageCount: result.pageCount,
      resultAvailable: true,
    });
  }

  function applyCompressionProgress(event: CompressionProgressEvent) {
    setCompression({
      status: event.stage === "complete" ? "complete" : "compressing",
      progress: event.progress,
      stage: event.stage,
      error: "",
      recordId: event.recordId,
    });
  }

  async function restoreCompressionResult() {
    try {
      await ensureOffscreenDocument();
      const response = await sendMessage<CompressionResultReadResponse>(
        { type: "background:compression-result-read" } as BackgroundCompressionResultReadRequest,
      );

      if (response.ok && response.result) {
        applyCompressionResult(response.result);
      }
    } catch (error) {
      setCompression({
        status: "error",
        error: errorMessage(error, t("compression.compressionFailed")),
      });
    }
  }

  async function restoreCompressionEngine() {
    try {
      const response = await sendMessage<CompressionHealthResponse>(
        { type: "background:compression-health" } as BackgroundCompressionHealthRequest,
      );

      if (response.status === "ready") {
        resetCompression();
      }

      setCompression({
        engineStatus: response.status,
        status: response.status === "ready" ? "idle" : "error",
        progress: 0,
        stage: "idle",
        error:
          response.status === "unsupported"
            ? t("compression.wasmNotSupported")
            : response.status === "failed"
              ? t("compression.wasmLoadFailed")
              : "",
      });

      const compressionState = usePopupStore.getState().compression;
      console.info("[pdf-compressor] Compression engine restore state", {
        pdfSelected: usePopupStore.getState().pdf.selected,
        pdfStatus: usePopupStore.getState().pdf.status,
        compressionStatus: compressionState.status,
        compressionBusy:
          compressionState.status === "loading-engine" ||
          compressionState.status === "compressing" ||
          compressionState.status === "cancelling",
        engineStatus: compressionState.engineStatus,
      });
    } catch (error) {
      setCompression({
        engineStatus: "failed",
        error: errorMessage(error, t("compression.wasmLoadFailed")),
      });
    }
  }

  async function startCompression() {
    if (!pdf.selected || pdf.status !== "ready") {
      return;
    }

    setCompression({
      status: "loading-engine",
      progress: 0,
      stage: "loading-engine",
      error: "",
    });

    try {
      const response = await sendMessage<CompressionStartResponse | { ok: false; error: string }>(
        { type: "background:compression-start", mode: "Balanced" } as BackgroundCompressionStartRequest,
      );

      if (!response.ok) {
        throw new Error(response.error);
      }

      applyCompressionResult(response.result);
    } catch (error) {
      setCompression({
        status: "error",
        progress: 0,
        stage: "idle",
        error: errorMessage(error, t("compression.compressionFailed")),
      });
    }
  }

  async function cancelCompression() {
    setCompression({
      status: "cancelling",
      error: "",
    });

    try {
      await sendMessage<CompressionCancelResponse>(
        { type: "background:compression-cancel" } as BackgroundCompressionCancelRequest,
      );
    } catch (error) {
      setCompression({
        status: "error",
        error: errorMessage(error, t("compression.cancelled")),
      });
    }
  }

  async function deleteCompressionResult() {
    try {
      await sendMessage<CompressionResultDeleteResponse>(
        { type: "background:compression-result-delete" } as BackgroundCompressionResultDeleteRequest,
      );
    } catch {
      // Best effort cleanup only.
    } finally {
      resetCompression();
    }
  }

  async function downloadCompressedPdf() {
    try {
      const recordId = compression.recordId ?? COMPRESSED_PDF_RECORD_ID;
      const metadataResponse = await sendMessage<CompressionResultReadResponse>({
        type: "background:compression-result-read",
        recordId,
      } as BackgroundCompressionResultReadRequest);

      if (!metadataResponse.ok || !metadataResponse.result) {
        throw new Error("No compressed PDF is available for download");
      }

      const record = await readCompressionResult(recordId);
      const bytes = assertDownloadablePdf(record);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = compression.fileName ? compression.fileName.replace(/\.pdf$/i, "-compressed.pdf") : "compressed.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setCompression({
        status: "error",
        error: errorMessage(error, t("compression.compressionFailed")),
      });
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
      await deleteCompressionResult();
      console.info("[pdf-compressor] Selected PDF stored and verified locally", {
        recordId: storeResponse.recordId,
        storedByteLength: storeResponse.byteLength,
        readBackByteLength: readBack.byteLength,
        status: "ready",
      });

      const pdfState = usePopupStore.getState().pdf;
      const compressionState = usePopupStore.getState().compression;
      console.info("[pdf-compressor] Selected PDF restore state", {
        pdfSelected: pdfState.selected,
        pdfStatus: pdfState.status,
        compressionStatus: compressionState.status,
        compressionBusy:
          compressionState.status === "loading-engine" ||
          compressionState.status === "compressing" ||
          compressionState.status === "cancelling",
        engineStatus: compressionState.engineStatus,
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
    await deleteCompressionResult();
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

      if (!isValidByteCount(writeResult.byteLength)) {
        throw new Error("IndexedDB smoke test write response is invalid");
      }

      if (!isValidByteCount(compareResult.byteLength)) {
        throw new Error("IndexedDB smoke test compare response is invalid");
      }

      const readBytes = normalizeSmokeReadResult(readResult.value, readResult.byteLength, "IndexedDB smoke test read");

      if (readBytes.length === 0) {
        throw new Error("IndexedDB smoke test returned an empty record");
      }

      if (!compareResult.equal) {
        throw new Error(
          `IndexedDB smoke test mismatch: wrote ${writeResult.byteLength} bytes, read ${readResult.byteLength} bytes`,
        );
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
        compareStatus: t("compare.match"),
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
          compareEqual: true,
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
  const compressionStatusLabel = formatCompressionStatus(t, compression.status, compression.error);
  const compressionOriginalValue = pdf.fileSize > 0 ? formatBytes(pdf.fileSize, locale) : "—";
  const compressionCompressedValue =
    compression.compressedSize !== null ? formatBytes(compression.compressedSize, locale) : "—";
  const compressionSavedValue =
    compression.savedBytes !== null
      ? compression.savedBytes > 0
        ? formatBytes(compression.savedBytes, locale)
        : t("compression.noSizeReduction")
      : "—";
  const compressionSavedPercentValue =
    compression.savedPercent !== null ? formatPercent(compression.savedPercent, locale) : "—";
  const compressionBusy = compression.status === "loading-engine" || compression.status === "compressing" || compression.status === "cancelling";
  const compressionHasResult = compression.status === "complete" && compression.resultAvailable;
  const compressionCanStart = pdf.selected && pdf.status === "ready" && !compressionBusy && compression.engineStatus === "ready";
  const compressionDownloadName = compression.fileName
    ? compression.fileName.replace(/\.pdf$/i, "-compressed.pdf")
    : "compressed.pdf";

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

            <article className="compression-card">
              <div className="compression-card__header">
                <div className="compression-card__title">
                  <span className="status-dot" />
                  <span>{t("compression.title")}</span>
                </div>
                <span className="status-badge">
                  {compression.engineStatus === "ready"
                    ? t("compression.engineReady")
                    : compression.engineStatus === "unsupported"
                      ? t("compression.wasmNotSupported")
                      : compression.engineStatus === "failed"
                        ? t("compression.wasmLoadFailed")
                        : t("compression.loadingEngine")}
                </span>
              </div>

              <div className="compression-card__status">{compressionStatusLabel}</div>
              <div className="compression-card__mode">{t("compression.balanced")}</div>

              <div className="compression-progress" role="progressbar" aria-valuenow={compression.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="compression-progress__track">
                  <div className="compression-progress__fill" style={{ width: `${compression.progress}%` }} />
                </div>
                <div className="compression-progress__meta">
                  <span>{`${Math.round(compression.progress)}%`}</span>
                  <span>{compression.pageCount !== null ? `${compression.pageCount} ${t("compression.pages")}` : t("compression.idle")}</span>
                </div>
              </div>

              <div className="compression-grid">
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("compression.originalSize")}</span>
                  <span className="metadata-row__value">{compressionOriginalValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("compression.compressedSize")}</span>
                  <span className="metadata-row__value">{compressionCompressedValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("compression.saved")}</span>
                  <span className="metadata-row__value">{compressionSavedValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("compression.savedPercent")}</span>
                  <span className="metadata-row__value">{compressionSavedPercentValue}</span>
                </div>
              </div>

              <div className="compression-actions">
                <button type="button" className="primary" onClick={() => void startCompression()} disabled={!compressionCanStart}>
                  {compressionHasResult ? t("compression.compressAgain") : t("compression.compressPdf")}
                </button>
                {compressionBusy ? (
                  <button type="button" className="secondary" onClick={() => void cancelCompression()}>
                    {t("compression.cancel")}
                  </button>
                ) : null}
                {compressionHasResult ? (
                  <button type="button" className="secondary" onClick={() => void downloadCompressedPdf()}>
                    {t("compression.downloadCompressedPdf")}
                  </button>
                ) : null}
                {compressionHasResult ? (
                  <button type="button" className="secondary" onClick={() => void deleteCompressionResult()}>
                    {t("compression.removeResult")}
                  </button>
                ) : null}
                {!compressionBusy && compression.status === "error" ? (
                  <button type="button" className="secondary" onClick={() => void startCompression()}>
                    {t("compression.retry")}
                  </button>
                ) : null}
              </div>
            </article>

            {pdf.error ? <div className="error">{pdf.error}</div> : null}
            {compression.status === "error" && compression.error ? <div className="error">{compression.error}</div> : null}
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
