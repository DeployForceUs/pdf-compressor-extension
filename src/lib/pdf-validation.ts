export const MAX_PDF_BYTES = 25 * 1024 * 1024;
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

export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  if (file.size <= 0) {
    return { ok: false, issue: "empty" };
  }

  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, issue: "tooLarge" };
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
