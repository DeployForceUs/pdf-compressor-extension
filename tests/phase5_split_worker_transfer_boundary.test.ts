import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync } from "fflate";
import mupdf from "mupdf";

(globalThis as unknown as { browser?: unknown }).browser ??= {
  runtime: {
    getURL: () => "chrome-extension://test/mupdf.js",
  },
};

(globalThis as unknown as { chrome?: unknown }).chrome ??= {
  runtime: {
    id: "test",
  },
};

const { createSplitZipArchive } = await import("../src/lib/pdf/split-archive.ts");
const {
  getSplitWorkerTransferables,
  planSplitWorkerReturn,
} = await import("../src/lib/offscreen/split-worker-transfer.ts");

async function createPdf(pageCount: number, label: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([72, 72]);
    page.drawText(`${label}-${index + 1}`, { font, size: 8, x: 6, y: 36 });
  }

  return pdf.save();
}

async function createOutcome(outputMode?: "single-zip" | "individual-pdfs" | "separate-zips") {
  const bytes = new Uint8Array(await createPdf(3, outputMode ?? "single"));
  return createSplitZipArchive(
    {
      inputBytes: bytes.buffer,
      strategy: {
        type: "by-pages",
        pagesPerPart: 1,
      },
      outputMode,
      documentName: `${outputMode ?? "single"}.pdf`,
      mupdfRuntimeUrl: "chrome-extension://test/mupdf.js",
    },
    () => false,
    async () => undefined,
    { loadMuPdf: async () => mupdf },
  );
}

function assertReadableOutcome(outcome: Awaited<ReturnType<typeof createSplitZipArchive>>) {
  assert.ok(outcome.result.artifacts.length > 0);
  assert.equal(structuredClone(outcome.result).artifactCount, outcome.result.artifactCount);
}

{
  const outcome = await createOutcome("single-zip");
  const plan = planSplitWorkerReturn(outcome);

  assert.equal(plan.transferables.length, 1);
  assert.ok(plan.payload.zipBytes);
  assert.ok(plan.payload.artifacts[0].data instanceof ArrayBuffer);

  const cloned = structuredClone(plan.payload);
  assert.ok(cloned.zipBytes instanceof ArrayBuffer);
  assert.equal(cloned.artifacts.length, 1);
  const zipEntries = unzipSync(new Uint8Array(cloned.zipBytes));
  assert.deepEqual(Object.keys(zipEntries), [
    "single-zip_part_001_pages_1-1.pdf",
    "single-zip_part_002_pages_2-2.pdf",
    "single-zip_part_003_pages_3-3.pdf",
  ]);
  assertReadableOutcome(outcome);
}

{
  const outcome = await createOutcome("individual-pdfs");
  const plan = planSplitWorkerReturn(outcome);

  assert.equal(plan.transferables.length, 0);
  assert.equal(plan.payload.zipBytes, undefined);
  assert.equal(plan.payload.artifacts.length, 3);

  const cloned = structuredClone(plan.payload);
  assert.equal(cloned.artifacts.length, 3);
  for (const artifact of cloned.artifacts) {
    assert.equal(new TextDecoder().decode(new Uint8Array(artifact.data).slice(0, 5)), "%PDF-");
  }
  assertReadableOutcome(outcome);
}

{
  const outcome = await createOutcome("separate-zips");
  const plan = planSplitWorkerReturn(outcome);

  assert.equal(plan.transferables.length, 0);
  assert.equal(plan.payload.zipBytes, undefined);
  assert.equal(plan.payload.artifacts.length, 3);

  const cloned = structuredClone(plan.payload);
  assert.equal(cloned.artifacts.length, 3);
  for (const artifact of cloned.artifacts) {
    assert.equal(new TextDecoder().decode(new Uint8Array(artifact.data).slice(0, 2)), "PK");
  }
  assertReadableOutcome(outcome);
}

{
  const sharedBuffer = new ArrayBuffer(4);
  const deduped = getSplitWorkerTransferables({
    zipBytes: sharedBuffer,
    artifacts: [
      {
        id: "bundle:part:001:zip",
        bundleId: "bundle",
        kind: "zip",
        filename: "bundle_part_001.zip",
        mimeType: "application/zip",
        byteLength: sharedBuffer.byteLength,
        partNumber: 1,
        pageStart: 1,
        pageEnd: 1,
        status: "complete",
        data: sharedBuffer,
      },
    ],
    result: {
      zipBlobId: "bundle",
      outputMode: "single-zip",
      artifactIds: ["bundle:part:001:zip"],
      artifacts: [],
      artifactCount: 1,
      fileName: "bundle.zip",
      mimeType: "application/zip",
      size: 4,
      compressAfterRequested: false,
      originalSplitPartsSize: 4,
      finalPartsSize: 4,
      compressedPartsCount: 0,
      fallbackPartsCount: 0,
      totalBytesSaved: 0,
      originalSize: 4,
      totalPartsSize: 4,
      partsCount: 1,
      strategy: {
        type: "by-pages",
        pagesPerPart: 1,
      },
      warnings: [],
      status: "complete",
    },
  } as never);

  assert.equal(deduped.length, 1);
}

console.log("phase5 split worker transfer boundary assertions passed");
