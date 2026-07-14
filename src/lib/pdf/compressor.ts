import type {
  CompressionErrorCode,
  CompressionHealthResponse,
  CompressionMode,
  CompressionProgressEvent,
  CompressionResultRecord,
} from "../messaging";
import { createLogger } from "../bootstrap";
import { classifyImageCandidates, formatImageCandidateClassificationDiagnostics } from "./image-xobject-classifier";
import { discoverImageXObjects } from "./image-xobject-discovery";
import {
  formatSafeImageRecompressionDiagnostics,
  recompressSafeImageCandidates,
} from "./image-xobject-recompression";
import { normalizeCompressionQuality } from "../compression-quality";

type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfDocument = InstanceType<MuPdfNamespace["Document"]>;
type MuPdfPdfDocument = InstanceType<MuPdfNamespace["PDFDocument"]>;

const TINY_PDF_BYTES = createTinyPdfBytes();
let mupdfModulePromise: Promise<MuPdfNamespace> | null = null;
const logger = createLogger("pdf-compressor");

type CompressionProgressCallback = (event: CompressionProgressEvent) => void | Promise<void>;

type AbortChecker = () => boolean | Promise<boolean>;

export type CompressionRequest = {
  input: ArrayBuffer;
  mupdfRuntimeUrl: string;
  recordId: string;
  sourceRecordId: string;
  fileName: string;
  mimeType: string | null;
  mode: CompressionMode;
  quality?: number;
  timeoutMs: number;
};

export type CompressionOutcome = {
  result: CompressionResultRecord;
  pageCount: number;
  outputBytes: ArrayBuffer;
};

export type CompressionFailure = {
  code: CompressionErrorCode;
  message: string;
};

function createTinyPdfBytes() {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  function push(chunk: string) {
    offsets.push(cursor);
    pieces.push(chunk);
    cursor += encoder.encode(chunk).length;
  }

  push("%PDF-1.4\n");
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  push("2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n");
  push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>\nendobj\n");

  const body = pieces.join("");
  const xrefStart = encoder.encode(body).length;
  const xref = [
    "xref\n",
    "0 4\n",
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    "trailer\n",
    "<< /Root 1 0 R /Size 4 >>\n",
    "startxref\n",
    `${xrefStart}\n`,
    "%%EOF\n",
  ].join("");

  return encoder.encode(body + xref);
}

function validateMuPdfRuntimeUrl(mupdfRuntimeUrl: string) {
  if (!mupdfRuntimeUrl.startsWith("chrome-extension://")) {
    throw compressionFailure("WASM_LOAD_FAILED", "MuPDF runtime URL must be an absolute extension URL");
  }
}

async function loadMuPdf(mupdfRuntimeUrl: string) {
  validateMuPdfRuntimeUrl(mupdfRuntimeUrl);

  mupdfModulePromise ??= import(/* @vite-ignore */ mupdfRuntimeUrl).then((module: MuPdfModule) => module.default);
  return mupdfModulePromise;
}

function isCancelled(check: AbortChecker) {
  return Promise.resolve(check()).then(Boolean);
}

function progressEvent(
  recordId: string,
  stage: CompressionProgressEvent["stage"],
  progress: number,
  pageCount: number,
  currentPage: number,
  message: string,
  originalBytes: number,
): CompressionProgressEvent {
  return {
    type: "compression:progress",
    recordId,
    stage,
    progress,
    pageCount,
    currentPage,
    message,
  };
}

function compressionFailure(code: CompressionErrorCode, message: string): CompressionFailure {
  return { code, message };
}

async function throwIfCancelled(check: AbortChecker) {
  if (await isCancelled(check)) {
    throw compressionFailure("CANCELLED", "Compression was cancelled");
  }
}

function scrubMetadata(doc: MuPdfPdfDocument, mupdf: MuPdfNamespace) {
  const metadataKeys = [
    mupdf.Document.META_INFO_TITLE,
    mupdf.Document.META_INFO_AUTHOR,
    mupdf.Document.META_INFO_SUBJECT,
    mupdf.Document.META_INFO_KEYWORDS,
    mupdf.Document.META_INFO_CREATOR,
    mupdf.Document.META_INFO_PRODUCER,
    mupdf.Document.META_INFO_CREATIONDATE,
    mupdf.Document.META_INFO_MODIFICATIONDATE,
  ] as const;

  for (const key of metadataKeys) {
    try {
      doc.setMetaData(key, "");
    } catch {
      // Best effort only. The safe rewrite path remains valid without a single metadata key.
    }
  }
}

function getHeaderPreview(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

export async function checkMuPdfHealth(mupdfRuntimeUrl: string): Promise<CompressionHealthResponse> {
  if (typeof WebAssembly === "undefined") {
    return {
      ok: true,
      engine: "mupdf",
      status: "unsupported",
      details: "WebAssembly is not supported in this browser context",
      pageCount: 0,
    };
  }

  const mupdf = await loadMuPdf(mupdfRuntimeUrl);
  const document = mupdf.Document.openDocument(TINY_PDF_BYTES);
  const pdfDocument = document.asPDF();

  if (!pdfDocument) {
    document.destroy();
    throw compressionFailure("INVALID_PDF", "MuPDF health check failed to open a PDF document");
  }

  const pageCount = document.countPages();
  const output = pdfDocument.saveToBuffer({ garbage: 4 });
  const outputBytes = output.asUint8Array();
  const header = getHeaderPreview(outputBytes);

  document.destroy();
  output.destroy();

  if (header !== "%PDF-") {
    throw compressionFailure("WASM_LOAD_FAILED", "MuPDF health check did not produce a PDF output");
  }

  return {
    ok: true,
    engine: "mupdf",
    status: "ready",
    details: "MuPDF WASM is ready",
    pageCount,
  };
}

export async function compressBalancedPdf(
  request: CompressionRequest,
  isCancelled: AbortChecker,
  onProgress: CompressionProgressCallback,
): Promise<CompressionOutcome> {
  const started = performance.now();
  const originalBytes = request.input.byteLength;
  const mupdf = await loadMuPdf(request.mupdfRuntimeUrl);

  if (request.mode !== "Balanced") {
    throw compressionFailure("UNKNOWN", `Unsupported compression mode: ${request.mode}`);
  }

  await onProgress(
    progressEvent(request.recordId, "loading-engine", 4, 0, 0, "Loading engine", originalBytes),
  );

  await throwIfCancelled(isCancelled);

  if (typeof WebAssembly === "undefined") {
    throw compressionFailure("WASM_NOT_SUPPORTED", "Your browser does not support WebAssembly");
  }

  let document: MuPdfDocument | null = null;
  let pdfDocument: MuPdfPdfDocument | null = null;
  let verifiedDocument: MuPdfDocument | null = null;

  try {
    await onProgress(
      progressEvent(request.recordId, "opening", 12, 0, 0, "Opening PDF", originalBytes),
    );

    document = mupdf.Document.openDocument(request.input);

    if (document.needsPassword()) {
      throw compressionFailure("ENCRYPTED_PDF", "Encrypted PDFs are not supported in the browser MVP");
    }

    const pageCount = document.countPages();
    pdfDocument = document.asPDF();

    if (!pdfDocument) {
      throw compressionFailure("INVALID_PDF", "The selected file is not a valid PDF document");
    }

    const imageDiscovery = discoverImageXObjects(pdfDocument);
    const imageClassification = classifyImageCandidates(imageDiscovery);
    if (import.meta.env.DEV) {
      logger.info("Image candidate classification", formatImageCandidateClassificationDiagnostics(imageClassification));
    }

    await throwIfCancelled(isCancelled);

    await onProgress(
      progressEvent(request.recordId, "scrubbing", 35, pageCount, 0, "Scrubbing metadata", originalBytes),
    );

    scrubMetadata(pdfDocument, mupdf);

    await throwIfCancelled(isCancelled);

    await onProgress(
      progressEvent(request.recordId, "rewriting", 68, pageCount, 0, "Rewriting PDF", originalBytes),
    );

    const recompressionOutcome = await recompressSafeImageCandidates(
      mupdf,
      request.input,
      pdfDocument,
      imageClassification,
      normalizeCompressionQuality(request.quality),
      isCancelled,
    );
    if (import.meta.env.DEV) {
      logger.info(
        "Image recompression diagnostics",
        formatSafeImageRecompressionDiagnostics(recompressionOutcome.diagnostics),
      );
    }

    const outputBytes = recompressionOutcome.outputBytes;
    const outputHeader = getHeaderPreview(new Uint8Array(outputBytes));

    if (outputHeader !== "%PDF-") {
      throw compressionFailure("UNKNOWN", "MuPDF returned data that is not a PDF");
    }

    await throwIfCancelled(isCancelled);

    await onProgress(
      progressEvent(request.recordId, "verifying", 88, pageCount, pageCount, "Verifying output", originalBytes),
    );

    verifiedDocument = mupdf.Document.openDocument(outputBytes);
    const outputPageCount = verifiedDocument.countPages();

    if (outputPageCount !== pageCount) {
      throw compressionFailure(
        "UNKNOWN",
        `Output page count changed from ${pageCount} to ${outputPageCount}`,
      );
    }

    const compressedBytes = outputBytes.byteLength;
    const savedBytes = Math.max(0, originalBytes - compressedBytes);
    const savedPercent = originalBytes > 0 ? savedBytes / originalBytes : 0;
    const now = Date.now();

    await onProgress(
      progressEvent(request.recordId, "persisting", 96, pageCount, pageCount, "Preparing result", originalBytes),
    );

    return {
      pageCount,
      outputBytes,
      result: {
        id: request.recordId,
        sourceRecordId: request.sourceRecordId,
        fileName: request.fileName,
        mimeType: request.mimeType,
        originalSize: originalBytes,
        compressedSize: compressedBytes,
        savedBytes,
        savedPercent,
        pageCount,
        data: outputBytes,
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "message" in error) {
      throw error;
    }

    if (error instanceof WebAssembly.RuntimeError) {
      throw compressionFailure("WASM_LOAD_FAILED", error.message);
    }

    if (error instanceof Error) {
      throw compressionFailure("UNKNOWN", error.message);
    }

    throw compressionFailure("UNKNOWN", "Unknown compression error");
  } finally {
    verifiedDocument?.destroy();
    document?.destroy();
    const elapsedMs = performance.now() - started;
    void elapsedMs;
  }
}
