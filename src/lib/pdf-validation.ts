import { EncryptedPDFError, PDFDocument } from "pdf-lib";
import { FREE_MAX_PDF_BYTES } from "./pdf-size-policy";

export const MAX_PDF_BYTES = FREE_MAX_PDF_BYTES;
const PDF_SIGNATURE_BYTES = new TextEncoder().encode("%PDF-");

export type PdfValidationIssue = "empty" | "tooLarge" | "unsupported" | "invalid";

export type ValidatedPdfFile = {
  bytes: ArrayBuffer;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

export type PdfValidationResult =
  | {
      ok: true;
      file: ValidatedPdfFile;
    }
  | {
      ok: false;
      issue: PdfValidationIssue;
      maxBytes?: number;
    };

function hasPdfExtension(fileName: string) {
  return fileName.toLowerCase().endsWith(".pdf");
}

function looksLikePdfMime(mimeType: string) {
  return mimeType.toLowerCase() === "application/pdf";
}

async function readSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, PDF_SIGNATURE_BYTES.length).arrayBuffer());
  if (header.length < PDF_SIGNATURE_BYTES.length) {
    return false;
  }

  return PDF_SIGNATURE_BYTES.every((value, index) => value === header[index]);
}

export async function validatePdfFile(
  file: File,
  options: { maxBytes?: number } = {},
): Promise<PdfValidationResult> {
  const maxBytes = options.maxBytes ?? MAX_PDF_BYTES;

  if (file.size <= 0) {
    return { ok: false, issue: "empty" };
  }

  if (file.size > maxBytes) {
    return { ok: false, issue: "tooLarge", maxBytes };
  }

  if (!hasPdfExtension(file.name)) {
    return { ok: false, issue: "unsupported" };
  }

  if (file.type && !looksLikePdfMime(file.type)) {
    return { ok: false, issue: "unsupported" };
  }

  if (!(await readSignature(file))) {
    return { ok: false, issue: "invalid" };
  }

  return {
    ok: true,
    file: {
      bytes: await file.arrayBuffer(),
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    },
  };
}

const ENCRYPTED_LOAD_ERROR_MESSAGE =
  "Input document to `PDFDocument.load` is encrypted. You can use `PDFDocument.load(..., { ignoreEncryption: true })` if you wish to load the document anyways.";

function isEncryptedPdfLoadError(error: unknown) {
  return error instanceof EncryptedPDFError || (error instanceof Error && error.message === ENCRYPTED_LOAD_ERROR_MESSAGE);
}

export async function readPdfPageCount(bytes: ArrayBuffer | Uint8Array): Promise<number | null> {
  const sourceBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  try {
    return (await PDFDocument.load(sourceBytes)).getPageCount();
  } catch (error) {
    if (!isEncryptedPdfLoadError(error)) {
      return null;
    }
  }

  try {
    return (await PDFDocument.load(sourceBytes, { ignoreEncryption: true })).getPageCount();
  } catch {
    return null;
  }
}
