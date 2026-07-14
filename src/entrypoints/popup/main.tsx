import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import browser from "webextension-polyfill";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { initI18n } from "../../lib/i18n/config";
import { formatBytes, formatDuration, formatPercent, normalizeLocale } from "../../lib/i18n/helpers";
import { MAX_PDF_BYTES, validatePdfFile } from "../../lib/pdf-validation";
import { buildSelectedPdfDisplay, formatSplitWarningsHeader } from "./pdf-display";
import { readPdfPageCount } from "../../lib/pdf-validation";
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
  SplitArtifactDescriptor,
  SplitCancelResponse,
  SplitErrorEvent,
  SplitProgressEvent,
  SplitResultMetadata,
  SplitStartResponse,
  PdfDeleteResponse,
  PdfReadResponse,
  PdfStoreResponse,
  StorageCompareResponse,
  StorageReadResponse,
  StorageWriteResponse,
  LicenseStateResponse,
  BackgroundErrorResponse,
} from "../../lib/messaging";
import { sendMessage } from "../../lib/messaging";
import { tracePdfSplit } from "../../lib/pdf-split-trace";
import { COMPRESSED_PDF_RECORD_ID } from "../../lib/pdf-records";
import { readCompressionResult } from "../../lib/storage/pdf-compression-db";
import {
  buildSplitResultMetadataFromBundle,
  buildSplitResultMetadataFromLegacyRecord,
  deleteSplitResult,
  readSplitArtifact,
  readSplitArtifactsForBundle,
  readSplitResult,
  readSplitResultBundle,
} from "../../lib/storage/pdf-split-results-db";
import { persistSelectedPdfRecord } from "./selected-pdf-persistence";
import {
  assertDownloadableSplitArtifactBytes,
  buildSplitArtifactRender,
  buildSplitOutputModeOptions,
  buildSplitRequestFromForm,
  formatSplitProgressDisplay,
  formatSplitWarning,
  type SplitFormState,
} from "./split-ui";
import { SELECTED_PDF_RECORD_ID, normalizeSplitSnapshot, usePopupStore, type SplitSnapshot } from "./store";
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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function monetizationErrorMessage(t: ReturnType<typeof useTranslation>["t"], response: BackgroundErrorResponse) {
  switch (response.code) {
    case "PRO_REQUIRED":
      return t("monetization.proRequired");
    case "FREE_DAILY_LIMIT_REACHED":
      return t(response.operation === "compression"
        ? "monetization.compressionLimitReached"
        : "monetization.splitLimitReached");
    case "FREE_COOLDOWN_ACTIVE":
      return t("monetization.cooldownActive", {
        seconds: Math.max(1, Math.ceil((response.retryAfterMs ?? 0) / 1000)),
      });
    default:
      return response.error;
  }
}

function isCompressionProgressEvent(message: unknown): message is CompressionProgressEvent {
  return typeof message === "object" && message !== null && (message as CompressionProgressEvent).type === "compression:progress";
}

function isCompressionResultEvent(message: unknown): message is { type: "compression:result"; result: CompressionResultMetadata } {
  return typeof message === "object" && message !== null && (message as { type?: string }).type === "compression:result";
}

function isSplitProgressEvent(message: unknown): message is SplitProgressEvent {
  return typeof message === "object" && message !== null && (message as SplitProgressEvent).type === "split:progress";
}

function isSplitResultEvent(message: unknown): message is { type: "split:result"; result: SplitResultMetadata } {
  return typeof message === "object" && message !== null && (message as { type?: string }).type === "split:result";
}

function isSplitErrorEvent(message: unknown): message is SplitErrorEvent {
  return typeof message === "object" && message !== null && (message as SplitErrorEvent).type === "split:error";
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

function formatSplitStatus(t: (key: string, options?: Record<string, unknown>) => string, status: string, error: string) {
  if (status === "loading") {
    return t("split.splitting");
  }

  if (status === "running") {
    return t("split.splitting");
  }

  if (status === "cancelling") {
    return t("split.cancel");
  }

  if (status === "cancelled") {
    return t("split.errors.cancelled");
  }

  if (status === "complete") {
    return t("split.complete");
  }

  if (status === "error") {
    return error || t("split.errors.splitFailed");
  }

  return t("split.start");
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

function translateSplitError(t: (key: string, options?: Record<string, unknown>) => string, code: string, fallback: string) {
  switch (code) {
    case "INVALID_PDF":
      return t("split.errors.invalidPdf");
    case "ENCRYPTED_PDF":
      return t("split.errors.encryptedPdf");
    case "INVALID_PAGE_RANGE":
      return t("split.errors.invalidPageRange");
    case "PAGE_RANGE_OUT_OF_BOUNDS":
      return t("split.errors.pageRangeOutOfBounds");
    case "OVERLAPPING_PAGE_RANGES":
      return t("split.errors.overlappingPageRanges");
    case "INVALID_MAX_PART_SIZE":
      return t("split.errors.invalidMaxPartSize");
    case "SINGLE_PAGE_EXCEEDS_LIMIT":
      return t("split.errors.singlePageExceedsLimit");
    case "SPLIT_FAILED":
      return t("split.errors.splitFailed");
    case "PART_VALIDATION_FAILED":
      return t("split.errors.partValidationFailed");
    case "ZIP_CREATION_FAILED":
      return t("split.errors.zipCreationFailed");
    case "CANCELLED":
      return t("split.errors.cancelled");
    case "TIMEOUT":
      return t("split.errors.timeout");
    case "STORAGE_QUOTA_EXCEEDED":
      return t("split.errors.storageQuotaExceeded");
    default:
      return fallback || t("split.errors.splitFailed");
  }
}

function Popup() {
  const { i18n, t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [licenseToken, setLicenseToken] = useState("");
  const [licenseState, setLicenseState] = useState<LicenseStateResponse | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseError, setLicenseError] = useState("");

  const locale = normalizeLocale(i18n?.resolvedLanguage ?? i18n?.language);
  const pdf = usePopupStore((state) => state.pdf);
  const compression = usePopupStore((state) => state.compression);
  const split = normalizeSplitSnapshot(usePopupStore((state) => state.split));
  const background = usePopupStore((state) => state.background);
  const offscreen = usePopupStore((state) => state.offscreen);
  const storage = usePopupStore((state) => state.storage);
  const diagnosticsOpen = usePopupStore((state) => state.diagnosticsOpen);
  const dragActive = usePopupStore((state) => state.dragActive);
  const setPdf = usePopupStore((state) => state.setPdf);
  const resetPdf = usePopupStore((state) => state.resetPdf);
  const setCompression = usePopupStore((state) => state.setCompression);
  const resetCompression = usePopupStore((state) => state.resetCompression);
  const setSplit = usePopupStore((state) => state.setSplit);
  const resetSplit = usePopupStore((state) => state.resetSplit);
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
    void checkLicense();
  }, []);

  useEffect(() => {
    void restoreSelectedPdf();
  }, []);

  useEffect(() => {
    void restoreCompressionEngine();
    void restoreCompressionResult();
    void restoreSplitResult();
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (isSplitProgressEvent(message)) {
        applySplitProgress(message);
        return;
      }

      if (isSplitResultEvent(message)) {
        tracePdfSplit({
          outputMode: message.result.outputMode,
          stage: "popup-received-completion",
          messageDirection: "offscreen->popup",
          success: true,
          details: { artifactCount: message.result.artifactCount },
        });
        applySplitResult(message.result);
        return;
      }

      if (isSplitErrorEvent(message)) {
        applySplitError(message);
        return;
      }

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
  }, [applyCompressionProgress, applyCompressionResult, applySplitError, applySplitProgress, applySplitResult, setCompression, t]);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function checkLicense() {
    setLicenseBusy(true);
    setLicenseError("");
    try {
      setLicenseState(await sendMessage<LicenseStateResponse>({ type: "license:check" }));
    } catch (error) {
      setLicenseError(errorMessage(error, t("license.checkFailed")));
    } finally {
      setLicenseBusy(false);
    }
  }

  async function activateLicense() {
    const token = licenseToken.trim();
    if (!token) {
      setLicenseError(t("license.tokenRequired"));
      return;
    }

    setLicenseBusy(true);
    setLicenseError("");
    try {
      const response = await sendMessage<LicenseStateResponse>({ type: "license:activate", token });
      setLicenseState(response);
      if (response.isPro) {
        setLicenseToken("");
      } else {
        setLicenseError(t("license.invalidToken"));
      }
    } catch (error) {
      setLicenseError(errorMessage(error, t("license.activationFailed")));
    } finally {
      setLicenseBusy(false);
    }
  }

  async function revokeLicense() {
    setLicenseBusy(true);
    setLicenseError("");
    try {
      setLicenseState(await sendMessage<LicenseStateResponse>({ type: "license:revoke" }));
      setLicenseToken("");
    } catch (error) {
      setLicenseError(errorMessage(error, t("license.revokeFailed")));
    } finally {
      setLicenseBusy(false);
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

  function applySplitResult(result: SplitResultMetadata, status: "complete" | "cancelled" = "complete") {
    setSplit(normalizeSplitSnapshot({
      status,
      progress: 100,
      stage: "complete",
      error: "",
      recordId: result.zipBlobId,
      outputMode: result.outputMode,
      currentPart: result.partsCount,
      partsCount: result.partsCount,
      progressMessage: "Split complete",
      sourceByteSize: null,
      compressedCandidateByteSize: null,
      selectedByteSize: null,
      fallbackUsed: null,
      zipBlobId: result.zipBlobId,
      fileName: result.fileName,
      mimeType: result.mimeType,
      size: result.size,
      originalSize: result.originalSize,
      totalPartsSize: result.totalPartsSize,
      artifacts: result.artifacts,
      strategy: result.strategy.type,
      compressAfterRequested: result.compressAfterRequested,
      originalSplitPartsSize: result.originalSplitPartsSize,
      finalPartsSize: result.finalPartsSize,
      compressedPartsCount: result.compressedPartsCount,
      fallbackPartsCount: result.fallbackPartsCount,
      totalBytesSaved: result.totalBytesSaved,
      warnings: result.warnings,
      resultAvailable: true,
    }));
  }

  function applySplitProgress(event: SplitProgressEvent) {
    setSplit({
      status: event.stage === "complete" ? "complete" : "running",
      progress: event.progress,
      stage: event.stage,
      error: "",
      recordId: event.recordId,
      currentPart: event.currentPart,
      partsCount: event.partsCount,
      progressMessage: event.message,
      sourceByteSize: event.sourceByteSize ?? null,
      compressedCandidateByteSize: event.compressedCandidateByteSize ?? null,
      selectedByteSize: event.selectedByteSize ?? null,
      fallbackUsed: event.fallbackUsed ?? null,
    });
  }

  function applySplitError(event: SplitErrorEvent) {
    setSplit({
      status: event.code === "CANCELLED" ? "cancelled" : "error",
      progress: 0,
      stage: "idle",
      error: translateSplitError(t, event.code, event.message),
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

  async function restoreSplitResult() {
    try {
      const bundle = await readSplitResultBundle();
      if (bundle) {
        const artifacts = await readSplitArtifactsForBundle(bundle.id);
        if (!artifacts) {
          return;
        }

        applySplitResult(buildSplitResultMetadataFromBundle(bundle, artifacts));
        return;
      }

      const legacy = await readSplitResult();
      if (legacy) {
        applySplitResult(buildSplitResultMetadataFromLegacyRecord(legacy));
      }
    } catch (error) {
      setSplit({
        status: "error",
        error: errorMessage(error, t("split.errors.splitFailed")),
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
      const response = await sendMessage<CompressionStartResponse | BackgroundErrorResponse>(
        { type: "background:compression-start", mode: "Balanced" } as BackgroundCompressionStartRequest,
      );

      if (!response.ok) {
        throw new Error(monetizationErrorMessage(t, response));
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

  async function startSplit() {
    if (!pdf.selected || pdf.status !== "ready") {
      return;
    }

    const request = buildSplitRequestFromForm({
      strategy: split.strategy,
      outputMode: split.outputMode,
      pagesPerPart: split.pagesPerPart,
      maxPartSizeMb: split.maxPartSizeMb,
      manualRanges: split.manualRanges,
      compressAfter: split.compressAfter,
    });

    if ("issue" in request) {
      const errorKey =
        request.issue === "INVALID_PAGES_PER_PART"
          ? "split.errors.invalidPagesPerPart"
          : request.issue === "INVALID_MAX_PART_SIZE"
            ? "split.errors.invalidMaxSize"
            : "split.errors.invalidRanges";

      setSplit({
        status: "error",
        progress: 0,
        stage: "idle",
        error: t(errorKey),
      });
      return;
    }

    setSplit({
      status: "loading",
      progress: 0,
      stage: "idle",
      error: "",
      recordId: null,
      outputMode: split.outputMode,
      currentPart: null,
      partsCount: null,
      progressMessage: "",
      sourceByteSize: null,
      compressedCandidateByteSize: null,
      selectedByteSize: null,
      fallbackUsed: null,
      zipBlobId: null,
      fileName: null,
      mimeType: null,
      size: null,
      originalSize: null,
      totalPartsSize: null,
      artifacts: [],
      warnings: [],
      resultAvailable: false,
      compressAfterRequested: split.compressAfter,
      originalSplitPartsSize: null,
      finalPartsSize: null,
      compressedPartsCount: null,
      fallbackPartsCount: null,
      totalBytesSaved: null,
    });

    try {
      tracePdfSplit({
        outputMode: request.outputMode,
        stage: "popup-send-request",
        messageDirection: "popup->background",
        success: true,
      });
      const response = await sendMessage<SplitStartResponse | BackgroundErrorResponse>(
        {
          type: "split:local",
          strategy: request.strategy,
          outputMode: request.outputMode,
          compressAfter: request.compressAfter,
        },
      );

      if (!response.ok) {
        throw new Error(monetizationErrorMessage(t, response));
      }

      tracePdfSplit({
        outputMode: response.result.outputMode,
        stage: "popup-received-request-response",
        messageDirection: "background->popup",
        success: true,
        details: { artifactCount: response.result.artifactCount },
      });
      applySplitResult(response.result);
    } catch (error) {
      tracePdfSplit({
        outputMode: request.outputMode,
        stage: "popup-request-failed",
        messageDirection: "background->popup",
        success: false,
        error,
      });
      setSplit({
        status: "error",
        progress: 0,
        stage: "idle",
        error: errorMessage(error, t("split.errors.splitFailed")),
      });
    }
  }

  async function cancelSplit() {
    setSplit({
      status: "cancelling",
      error: "",
    });

    try {
      await sendMessage<SplitCancelResponse>({ type: "split:cancel" });
    } catch (error) {
      setSplit({
        status: "error",
        error: errorMessage(error, t("split.errors.cancelled")),
      });
    }
  }

  async function downloadSplitArtifact(artifact: SplitArtifactDescriptor) {
    try {
      const record = await readSplitArtifact(artifact.id);

      if (!record) {
        throw new Error("No split artifact is available for download");
      }

      const bytes = assertDownloadableSplitArtifactBytes(artifact, record.data);
      const blob = new Blob([bytes], { type: artifact.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setSplit({
        status: "error",
        error: errorMessage(error, t("split.errors.splitFailed")),
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
    const pageCount = await readPdfPageCount(bytes);
    const byteArray = Array.from(new Uint8Array(bytes));
    const recordId = SELECTED_PDF_RECORD_ID;

    try {
      await ensureOffscreenDocument();

      const { storeResponse, readBack } = await persistSelectedPdfRecord(
        {
          id: recordId,
          name: fileName,
          size: fileSize,
          type: mimeType || null,
          lastModified: file.lastModified,
          pageCount,
          data: byteArray,
        },
        {
          store: (record) =>
            sendMessage<PdfStoreResponse | { ok: false; error: string }>({
              type: "pdf:store",
              record,
            }),
          read: (recordId) =>
            sendMessage<PdfReadResponse>({
              type: "pdf:read",
              recordId,
            }),
        },
      );

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
        pageCount: readBack.record.pageCount ?? pageCount,
        mimeType: readBack.record.type,
        recordId: storeResponse.recordId,
        storedByteLength: storeResponse.byteLength,
        readBackByteLength: readBack.byteLength,
        error: "",
      });
      await deleteCompressionResult();
      await deleteSplitResult();
      resetSplit();
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

      const restoredPageCount =
        readBack.record.pageCount ?? (await readPdfPageCount(new Uint8Array(readBack.record.data).buffer));

      setPdf({
        status: "ready",
        selected: true,
        fileName: readBack.record.name,
        fileSize: readBack.record.size,
        pageCount: restoredPageCount,
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
    await deleteSplitResult();
    resetSplit();
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
  const pdfDisplay = buildSelectedPdfDisplay(pdf, locale, t);
  const pdfHasFile = pdf.fileName !== null;
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
  const splitBusy = split.status === "loading" || split.status === "running" || split.status === "cancelling";
  const sharedBusy = compressionBusy || splitBusy;
  const compressionCanStart = pdf.selected && pdf.status === "ready" && !sharedBusy && compression.engineStatus === "ready";
  const compressionDownloadName = compression.fileName
    ? compression.fileName.replace(/\.pdf$/i, "-compressed.pdf")
    : "compressed.pdf";
  const splitStatusLabel = formatSplitStatus(t, split.status, split.error);
  const splitHasResult = split.status === "complete" && split.resultAvailable;
  const splitControlsDisabled = sharedBusy || pdf.status !== "ready" || !pdf.selected;
  const splitCanStart =
    pdf.selected &&
    pdf.status === "ready" &&
    !sharedBusy &&
    (!split.compressAfter || compression.engineStatus === "ready");
  const splitProgressSummaryValue = formatSplitProgressDisplay(
    {
      stage: split.stage,
      progress: split.progress,
      message: split.progressMessage || splitStatusLabel,
      currentPart: split.currentPart ?? 0,
      partsCount: split.partsCount ?? 0,
      sourceByteSize: split.sourceByteSize ?? undefined,
      compressedCandidateByteSize: split.compressedCandidateByteSize ?? undefined,
      selectedByteSize: split.selectedByteSize ?? undefined,
      fallbackUsed: split.fallbackUsed ?? undefined,
    },
    {
      t,
      formatBytes: (value) => formatBytes(value, locale),
    },
  );
  const splitProgressMetaLabel = split.status === "idle" ? splitStatusLabel : splitProgressSummaryValue.label;
  const splitOriginalValue = split.originalSize !== null ? formatBytes(split.originalSize, locale) : "—";
  const splitSizeLabel = split.outputMode === "single-zip" ? t("split.zipSize") : t("split.outputSize");
  const splitZipValue = split.size !== null ? formatBytes(split.size, locale) : "—";
  const splitSavedValue =
    split.totalBytesSaved !== null
      ? split.totalBytesSaved > 0
        ? formatBytes(split.totalBytesSaved, locale)
        : t("compression.noSizeReduction")
      : "—";
  const splitWarningsCount = split.warnings.length;
  const splitOutputModeOptions = buildSplitOutputModeOptions({
    t,
    formatBytes: (value) => formatBytes(value, locale),
  });

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
          <article className={licenseState?.isPro ? "license-card license-card--pro" : "license-card"}>
            <div className="license-card__header">
              <div>
                <p className="eyebrow">{t("license.eyebrow")}</p>
                <h2>{t("license.title")}</h2>
              </div>
              <span className="status-badge">
                {licenseBusy && !licenseState
                  ? t("license.checking")
                  : licenseState?.isPro
                    ? t("license.proActive")
                    : t("license.free")}
              </span>
            </div>

            {licenseState?.isPro ? (
              <div className="license-card__active">
                <p>{t("license.activeDescription")}</p>
                {licenseState.licenseId ? (
                  <div className="license-card__id">
                    <span>{t("license.licenseId")}</span>
                    <code>{licenseState.licenseId}</code>
                  </div>
                ) : null}
                <button type="button" className="secondary" onClick={() => void revokeLicense()} disabled={licenseBusy}>
                  {t("license.deactivate")}
                </button>
              </div>
            ) : (
              <div className="license-card__form">
                <p>{t("license.description")}</p>
                <label className="license-card__field">
                  <span>{t("license.tokenLabel")}</span>
                  <textarea
                    rows={3}
                    value={licenseToken}
                    placeholder={t("license.tokenPlaceholder")}
                    onChange={(event) => {
                      setLicenseToken(event.currentTarget.value);
                      setLicenseError("");
                    }}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={licenseBusy}
                  />
                </label>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void activateLicense()}
                  disabled={licenseBusy || !licenseToken.trim()}
                >
                  {licenseBusy ? t("license.activating") : t("license.activate")}
                </button>
              </div>
            )}

            {licenseError ? <p className="license-card__error" role="alert">{licenseError}</p> : null}
          </article>

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
                {pdfDisplay.badge ? <span className="status-badge">{pdfDisplay.badge}</span> : null}
              </div>
              <div className="metadata-grid">
                {pdfDisplay.rows.map((row) => (
                  <div className="metadata-row" key={row.label}>
                    <span className="metadata-row__label">{row.label}</span>
                    <span className="metadata-row__value">{row.value}</span>
                  </div>
                ))}
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

            <article className="split-card">
              <div className="split-card__header">
                <div className="split-card__title">
                  <span className="status-dot" />
                  <span>{t("split.title")}</span>
                </div>
                <span className="status-badge">
                  {split.status === "complete"
                    ? t("split.complete")
                    : split.status === "error"
                      ? t("split.errors.splitFailed")
                      : splitBusy
                        ? t("split.splitting")
                        : t("split.start")}
                </span>
              </div>

              <div className="split-card__status">{splitStatusLabel}</div>

              <div className="split-mode">
                <div className="split-mode__label">{t("split.outputMode")}</div>
                <div className="split-mode__options" role="radiogroup" aria-label={t("split.outputMode")}>
                  {splitOutputModeOptions.map((option) => (
                    <label
                      key={option.value}
                      className={
                        split.outputMode === option.value
                          ? "split-mode__option split-mode__option--active"
                          : "split-mode__option"
                      }
                    >
                      <input
                        type="radio"
                        name="split-output-mode"
                        value={option.value}
                        checked={split.outputMode === option.value}
                        onChange={() => setSplit({ outputMode: option.value, error: "" })}
                        disabled={splitControlsDisabled}
                      />
                      <span className="split-mode__option-title">{option.label}</span>
                      <span className="split-mode__option-detail">{option.description}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="split-card__strategies" role="tablist" aria-label={t("split.strategy")}>
                {[
                  ["by-pages", t("split.byPages")],
                  ["by-max-size", t("split.bySize")],
                  ["manual-ranges", t("split.manual")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={split.strategy === value ? "split-card__strategy split-card__strategy--active" : "split-card__strategy"}
                    aria-pressed={split.strategy === value}
                    onClick={() =>
      setSplit({
                        strategy: value as SplitSnapshot["strategy"],
                        error: "",
                      })
                    }
                    disabled={splitControlsDisabled}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {split.strategy === "by-pages" ? (
                <label className="split-field">
                  <span>{t("split.pagesPerPart")}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={split.pagesPerPart}
                    onChange={(event) => setSplit({ pagesPerPart: event.currentTarget.value, error: "" })}
                    disabled={splitControlsDisabled}
                  />
                </label>
              ) : null}

              {split.strategy === "by-max-size" ? (
                <label className="split-field">
                  <span>{t("split.maxSize")}</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={split.maxPartSizeMb}
                    onChange={(event) => setSplit({ maxPartSizeMb: event.currentTarget.value, error: "" })}
                    disabled={splitControlsDisabled}
                  />
                </label>
              ) : null}

              {split.strategy === "manual-ranges" ? (
                <label className="split-field">
                  <span>{t("split.manualRanges")}</span>
                  <textarea
                    rows={4}
                    value={split.manualRanges}
                    placeholder={t("split.manualRangesPlaceholder")}
                    onChange={(event) => setSplit({ manualRanges: event.currentTarget.value, error: "" })}
                    disabled={splitControlsDisabled}
                  />
                </label>
              ) : null}

              <label className="split-checkbox">
                <input
                  type="checkbox"
                  checked={split.compressAfter}
                  onChange={(event) => setSplit({ compressAfter: event.currentTarget.checked, error: "" })}
                  disabled={splitControlsDisabled}
                />
                <span>{t("split.compressAfter")}</span>
              </label>

              <div className="split-progress" role="progressbar" aria-valuenow={split.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="split-progress__track">
                  <div className="split-progress__fill" style={{ width: `${split.progress}%` }} />
                </div>
                <div className="split-progress__meta">
                  <span>{`${Math.round(split.progress)}%`}</span>
                  <span>{splitProgressMetaLabel}</span>
                </div>
              </div>

              <div className="split-progress__detail">
                {splitProgressSummaryValue.detail ? <span>{splitProgressSummaryValue.detail}</span> : null}
              </div>

              <div className="split-grid">
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("split.originalSize")}</span>
                  <span className="metadata-row__value">{splitOriginalValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{splitSizeLabel}</span>
                  <span className="metadata-row__value">{splitZipValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("split.saved")}</span>
                  <span className="metadata-row__value">{splitSavedValue}</span>
                </div>
                <div className="metadata-row">
                  <span className="metadata-row__label">{t("split.result")}</span>
                  <span className="metadata-row__value">{split.partsCount !== null ? t("split.partsCreated", { count: split.partsCount }) : "—"}</span>
                </div>
                {split.outputMode !== "single-zip" ? (
                  <div className="metadata-row">
                    <span className="metadata-row__label">{t("split.artifacts")}</span>
                    <span className="metadata-row__value">
                      {split.artifacts.length > 0 ? t("split.artifactsCreated", { count: split.artifacts.length }) : "—"}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="split-actions">
                <button type="button" className="primary" onClick={() => void startSplit()} disabled={!splitCanStart}>
                  {splitBusy ? t("split.splitting") : t("split.start")}
                </button>
                {splitBusy ? (
                  <button type="button" className="secondary" onClick={() => void cancelSplit()}>
                    {t("split.cancel")}
                  </button>
                ) : null}
                {splitHasResult && split.outputMode === "single-zip" && split.artifacts[0] ? (
                  <button type="button" className="secondary" onClick={() => void downloadSplitArtifact(split.artifacts[0])}>
                    {t("split.downloadZip")}
                  </button>
                ) : null}
              </div>

              {splitHasResult && split.outputMode !== "single-zip" ? (
                <div className="split-artifacts" aria-live="polite">
                  <div className="split-artifacts__header">
                    <span>{t("split.artifacts")}</span>
                    <span>{t("split.artifactsCreated", { count: split.artifacts.length })}</span>
                  </div>
                  <div className="split-artifacts__list">
                    {split.artifacts.map((artifact) => {
                      const rendered = buildSplitArtifactRender(artifact, {
                        t,
                        formatBytes: (value) => formatBytes(value, locale),
                      });

                      return (
                        <div key={artifact.id} className="split-artifact">
                          <div className="split-artifact__main">
                            <div className="split-artifact__title">{rendered.filename}</div>
                            <div className="split-artifact__detail">
                              {rendered.kind}
                              {" · "}
                              {rendered.size}
                              {" · "}
                              {rendered.pageRange}
                            </div>
                          </div>
                          <button type="button" className="secondary split-artifact__download" onClick={() => void downloadSplitArtifact(artifact)}>
                            {rendered.downloadLabel}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {splitHasResult && splitWarningsCount > 0 ? (
                <div className="split-warnings" aria-live="polite">
                  <div className="split-warnings__header">
                    <span>{formatSplitWarningsHeader(splitWarningsCount, t)}</span>
                  </div>
                  <div className="split-warnings__list">
                    {split.warnings.map((warning) => (
                      <div key={`${warning.code}-${warning.fileName}-${warning.partNumber}`} className="split-warning">
                        {(() => {
                          const rendered = formatSplitWarning(warning, {
                            t,
                            formatBytes: (value) => formatBytes(value, locale),
      });

                          return (
                            <>
                              <div className="split-warning__title">{rendered.title}</div>
                              <div className="split-warning__detail">{rendered.detail}</div>
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {splitHasResult && splitWarningsCount === 0 ? <div className="split-card__footnote">{t("split.noWarnings")}</div> : null}
            </article>

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
