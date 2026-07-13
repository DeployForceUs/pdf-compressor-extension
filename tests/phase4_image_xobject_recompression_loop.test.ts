import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import mupdf from "mupdf";
import { classifyImageCandidates } from "../src/lib/pdf/image-xobject-classifier";
import { discoverImageXObjects } from "../src/lib/pdf/image-xobject-discovery";
import {
  createRecompressionProgressGuard,
  recompressSafeImageCandidates,
} from "../src/lib/pdf/image-xobject-recompression";

const CANON_PATH =
  "/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf";

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function readCanonBytes() {
  if (!existsSync(CANON_PATH)) {
    throw new Error(`Exact Canon PDF fixture not found: ${CANON_PATH}`);
  }

  return new Uint8Array(await readFile(CANON_PATH));
}

{
  const guard = createRecompressionProgressGuard(1);
  const fingerprint = "1|100|100|8|DeviceRGB";
  guard.beforeIteration(fingerprint);
  assert.throws(
    () => guard.requireProgress(false, fingerprint),
    /made no progress/i,
  );
}

{
  const guard = createRecompressionProgressGuard(1);
  const firstFingerprint = "1|100|100|8|DeviceRGB";
  guard.beforeIteration(firstFingerprint);
  guard.requireProgress(true, firstFingerprint);
  assert.throws(
    () => guard.beforeIteration(firstFingerprint),
    /same candidate repeatedly/i,
  );
}

{
  const guard = createRecompressionProgressGuard(1);
  for (let index = 0; index < 10; index += 1) {
    const fingerprint = `${index}|100|100|8|DeviceRGB`;
    guard.beforeIteration(fingerprint);
    guard.requireProgress(true, fingerprint);
  }

  assert.throws(
    () => guard.beforeIteration("10|100|100|8|DeviceRGB"),
    /safe iteration limit/i,
  );
}

{
  const bytes = await readCanonBytes();
  const document = mupdf.Document.openDocument(bytes);
  try {
    const pdfDocument = document.asPDF();
    if (!pdfDocument) {
      throw new Error("Canon PDF should open as a PDF document");
    }

    const classification = classifyImageCandidates(discoverImageXObjects(pdfDocument));
    assert.ok(classification.safeRecompressCount > 0, "Canon PDF should expose safe recompress candidates");

    const result = await recompressSafeImageCandidates(
      mupdf,
      toArrayBuffer(bytes),
      pdfDocument,
      classification,
      75,
      () => false,
    );

    assert.equal(result.pageCount, 220);
    assert.equal(result.diagnostics.successfullyRecompressedCount > 0, true);
    assert.equal(result.diagnostics.skippedBecauseNewStreamWasNotSmallerCount > 0, true);
    assert.equal(result.diagnostics.failedRecompressionCount, 0);
    assert.equal(result.outputBytes.byteLength > 0, true);

    const reopened = mupdf.Document.openDocument(result.outputBytes);
    try {
      assert.equal(reopened.countPages(), 220);
    } finally {
      reopened.destroy();
    }
  } finally {
    document.destroy();
  }
}

{
  const bytes = await readCanonBytes();
  const document = mupdf.Document.openDocument(bytes);
  try {
    const pdfDocument = document.asPDF();
    if (!pdfDocument) {
      throw new Error("Canon PDF should open as a PDF document");
    }

    const classification = classifyImageCandidates(discoverImageXObjects(pdfDocument));
    let cancellationChecks = 0;

    await assert.rejects(
      () =>
        recompressSafeImageCandidates(
          mupdf,
          toArrayBuffer(bytes),
          pdfDocument,
          classification,
          75,
          () => {
            cancellationChecks += 1;
            return cancellationChecks >= 2;
          },
        ),
      (error: unknown) => (error as { code?: string }).code === "CANCELLED",
    );

    assert.ok(cancellationChecks >= 2);
  } finally {
    document.destroy();
  }
}

console.log("phase4 image xobject recompression loop assertions passed");
