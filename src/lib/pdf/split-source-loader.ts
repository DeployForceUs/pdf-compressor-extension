import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { SplitRuntimeError } from "./split-errors";

type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfDocument = InstanceType<MuPdfNamespace["Document"]>;

const ENCRYPTED_LOAD_ERROR_MESSAGE =
  "Input document to `PDFDocument.load` is encrypted. You can use `PDFDocument.load(..., { ignoreEncryption: true })` if you wish to load the document anyways.";

let runtimeMuPdfModulePromise: Promise<MuPdfNamespace> | null = null;

export type SplitSourceLoadDependencies = {
  loadMuPdf?: () => Promise<MuPdfNamespace>;
};

export type SplitSourceLoadResult = {
  pdfDocument: PDFDocument;
  encrypted: boolean;
};

function toLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isEncryptedPdfLoadError(error: unknown) {
  return (
    error instanceof EncryptedPDFError ||
    (error instanceof Error && error.message === ENCRYPTED_LOAD_ERROR_MESSAGE)
  );
}

function validateMuPdfRuntimeUrl(mupdfRuntimeUrl: string) {
  if (!mupdfRuntimeUrl.startsWith("chrome-extension://")) {
    throw new SplitRuntimeError("INVALID_PDF", "MuPDF runtime URL must be an absolute extension URL");
  }
}

export async function loadMuPdfModule(mupdfRuntimeUrl?: string): Promise<MuPdfNamespace> {
  if (!mupdfRuntimeUrl) {
    throw new SplitRuntimeError("INVALID_PDF", "MuPDF runtime URL is required for Split PDF loading");
  }

  validateMuPdfRuntimeUrl(mupdfRuntimeUrl);
  runtimeMuPdfModulePromise ??= import(/* @vite-ignore */ mupdfRuntimeUrl).then((module: MuPdfModule) => module.default);
  return runtimeMuPdfModulePromise;
}

export async function loadSplitSourceDocument(
  inputBytes: ArrayBuffer | Uint8Array,
  deps: SplitSourceLoadDependencies = {},
): Promise<SplitSourceLoadResult> {
  const sourceBytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);

  try {
    return {
      pdfDocument: await PDFDocument.load(sourceBytes),
      encrypted: false,
    };
  } catch (error) {
    if (!isEncryptedPdfLoadError(error)) {
      throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", {
        cause: toLoadErrorMessage(error),
      });
    }
  }

  const loadMuPdf = deps.loadMuPdf;

  let mupdf: MuPdfNamespace;
  try {
    if (!loadMuPdf) {
      throw new SplitRuntimeError("INVALID_PDF", "MuPDF loader is required for encrypted Split PDF sources");
    }
    mupdf = await loadMuPdf();
  } catch (error) {
    throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", {
      cause: toLoadErrorMessage(error),
    });
  }

  let sourceDocument: MuPdfDocument;
  try {
    sourceDocument = mupdf.Document.openDocument(sourceBytes);
  } catch (error) {
    throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", {
      cause: toLoadErrorMessage(error),
    });
  }

  if (sourceDocument.needsPassword()) {
    throw new SplitRuntimeError("ENCRYPTED_PDF", "Password-protected PDFs are not supported in Split");
  }

  try {
    return {
      pdfDocument: await PDFDocument.load(sourceBytes, { ignoreEncryption: true }),
      encrypted: true,
    };
  } catch (error) {
    throw new SplitRuntimeError("INVALID_PDF", "Input file is not a valid PDF", {
      cause: toLoadErrorMessage(error),
    });
  }
}

export async function validateGeneratedSplitPartBytes(
  bytes: Uint8Array,
  expectedPageCount: number,
  mupdf: MuPdfNamespace,
  label: string,
) {
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    throw new SplitRuntimeError("PART_VALIDATION_FAILED", `Split part ${label} is missing the %PDF- header`);
  }

  let reopened: PDFDocument;
  try {
    reopened = await PDFDocument.load(bytes);
  } catch (error) {
    if (isEncryptedPdfLoadError(error)) {
      throw new SplitRuntimeError("PART_VALIDATION_FAILED", `Split part ${label} is encrypted`, {
        cause: toLoadErrorMessage(error),
      });
    }

    throw new SplitRuntimeError("PART_VALIDATION_FAILED", `Split part ${label} could not be reopened`, {
      cause: toLoadErrorMessage(error),
    });
  }

  if (reopened.getPageCount() !== expectedPageCount) {
    throw new SplitRuntimeError(
      "PART_VALIDATION_FAILED",
      `Split part ${label} opened with ${reopened.getPageCount()} pages instead of ${expectedPageCount}`,
    );
  }

  let mupdfDocument: MuPdfDocument;
  try {
    mupdfDocument = mupdf.Document.openDocument(bytes);
  } catch (error) {
    throw new SplitRuntimeError("PART_VALIDATION_FAILED", `Split part ${label} could not be opened by MuPDF`, {
      cause: toLoadErrorMessage(error),
    });
  }

  if (mupdfDocument.needsPassword()) {
    throw new SplitRuntimeError("PART_VALIDATION_FAILED", `Split part ${label} requires a password`);
  }

  if (mupdfDocument.countPages() !== expectedPageCount) {
    throw new SplitRuntimeError(
      "PART_VALIDATION_FAILED",
      `Split part ${label} opened in MuPDF with ${mupdfDocument.countPages()} pages instead of ${expectedPageCount}`,
    );
  }
}
