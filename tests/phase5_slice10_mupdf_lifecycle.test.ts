import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PDFDocument, StandardFonts } from "pdf-lib";
import mupdf from "mupdf";
import { loadSplitSourceDocument, validateGeneratedSplitPartBytes } from "../src/lib/pdf/split-source-loader";
import { SplitRuntimeError } from "../src/lib/pdf/split-errors";

const CANON_PATH =
  "/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf";
const PASSWORD_PROTECTED_FIXTURE = "/private/tmp/phase5-password-protected-fixture.pdf";

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([72, 72]);
    page.drawText(String(index + 1), { font, size: 8, x: 6, y: 36 });
  }

  return pdf.save();
}

async function readCanonBytes() {
  return new Uint8Array(await readFile(CANON_PATH));
}

async function readPasswordProtectedBytes() {
  if (!existsSync(PASSWORD_PROTECTED_FIXTURE)) {
    const script = `
from pathlib import Path
from pypdf import PdfWriter

out = Path(${JSON.stringify(PASSWORD_PROTECTED_FIXTURE)})
writer = PdfWriter()
writer.add_blank_page(width=72, height=72)
writer.encrypt("secret")
with out.open("wb") as handle:
    writer.write(handle)
`;

    execFileSync("python3", ["-c", script]);
  }

  return new Uint8Array(await readFile(PASSWORD_PROTECTED_FIXTURE));
}

function createDestroySpyDocument(overrides: Partial<{ needsPassword: () => boolean; countPages: () => number; destroy: () => void }> = {}) {
  const calls = {
    destroy: 0,
  };

  const document = {
    needsPassword: overrides.needsPassword ?? (() => false),
    countPages: overrides.countPages ?? (() => 1),
    destroy: () => {
      calls.destroy += 1;
      overrides.destroy?.();
    },
  };

  return { document, calls };
}

function createMuPdfDouble(openDocumentImpl: (bytes: Uint8Array) => ReturnType<typeof createDestroySpyDocument>["document"]) {
  const openCalls: Uint8Array[] = [];
  return {
    openCalls,
    module: {
      Document: {
        openDocument(bytes: Uint8Array) {
          openCalls.push(bytes);
          return openDocumentImpl(bytes);
        },
      },
    } as unknown as typeof mupdf,
  };
}

{
  const bytes = await createPdf(1);
  let loadMuPdfCalls = 0;
  const result = await loadSplitSourceDocument(bytes, {
    loadMuPdf: async () => {
      loadMuPdfCalls += 1;
      return mupdf;
    },
  });

  assert.equal(result.encrypted, false);
  assert.equal(result.pdfDocument.getPageCount(), 1);
  assert.equal(loadMuPdfCalls, 0);
}

{
  const bytes = await readCanonBytes();
  const { document, calls } = createDestroySpyDocument();
  const { module, openCalls } = createMuPdfDouble(() => document);

  const result = await loadSplitSourceDocument(bytes, {
    loadMuPdf: async () => module,
  });

  assert.equal(result.encrypted, true);
  assert.equal(openCalls.length, 1);
  assert.equal(calls.destroy, 1);
}

{
  const bytes = await readPasswordProtectedBytes();
  const { document, calls } = createDestroySpyDocument({ needsPassword: () => true });
  const { module } = createMuPdfDouble(() => document);

  await assert.rejects(
    () =>
      loadSplitSourceDocument(bytes, {
        loadMuPdf: async () => module,
      }),
    (error: unknown) => (error as SplitRuntimeError).code === "ENCRYPTED_PDF",
  );

  assert.equal(calls.destroy, 1);
}

{
  const bytes = await createPdf(1);
  const { document, calls } = createDestroySpyDocument();
  const { module } = createMuPdfDouble(() => document);

  await validateGeneratedSplitPartBytes(bytes, 1, module, "part");

  assert.equal(calls.destroy, 1);
}

{
  const bytes = await createPdf(1);
  const { document, calls } = createDestroySpyDocument({ countPages: () => 2 });
  const { module } = createMuPdfDouble(() => document);

  await assert.rejects(
    () => validateGeneratedSplitPartBytes(bytes, 1, module, "part"),
    (error: unknown) => (error as SplitRuntimeError).code === "PART_VALIDATION_FAILED",
  );

  assert.equal(calls.destroy, 1);
}

{
  const bytes = await createPdf(1);
  const { document, calls } = createDestroySpyDocument({
    countPages: () => {
      throw new Error("boom");
    },
  });
  const { module } = createMuPdfDouble(() => document);

  await assert.rejects(
    () => validateGeneratedSplitPartBytes(bytes, 1, module, "part"),
    (error: unknown) => (error as SplitRuntimeError).code === "PART_VALIDATION_FAILED",
  );

  assert.equal(calls.destroy, 1);
}

console.log("phase5 slice 10 mupdf lifecycle assertions passed");
