import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentBlindProfilerResult,
  ContentBlindPdfProfilerCancelledError,
  profileContentBlindPdf,
} from "../src/lib/ai/content-blind-pdf-profiler";
import type { PdfImageXObjectDiscovery } from "../src/lib/pdf/image-xobject-discovery";

const discovery: PdfImageXObjectDiscovery = {
  pageCount: 3,
  totalOccurrences: 3,
  candidates: [
    {
      pageNumber: 1,
      objectReference: "10 0 R",
      width: 1200,
      height: 1600,
      bitsPerComponent: 8,
      colorspace: "/DeviceRGB",
      filterEncoding: "/DCTDecode",
      estimatedStreamSize: 1000,
      sharedReferenceCount: 1,
      imageMask: false,
      softMask: null,
      explicitMask: null,
    },
    {
      pageNumber: 2,
      objectReference: "11 0 R",
      width: 2000,
      height: 2500,
      bitsPerComponent: 8,
      colorspace: "/DeviceRGB",
      filterEncoding: "/JPXDecode",
      estimatedStreamSize: 3000,
      sharedReferenceCount: 1,
      imageMask: false,
      softMask: null,
      explicitMask: null,
    },
    {
      pageNumber: 2,
      objectReference: "12 0 R",
      width: 16,
      height: 16,
      bitsPerComponent: 8,
      colorspace: "/DeviceGray",
      filterEncoding: "/FlateDecode",
      estimatedStreamSize: null,
      sharedReferenceCount: 1,
      imageMask: false,
      softMask: null,
      explicitMask: null,
    },
  ],
};

test("builds deterministic content-blind structural metrics", () => {
  assert.deepEqual(buildContentBlindProfilerResult(9000, discovery), {
    schemaVersion: 1,
    status: "incomplete",
    derivedMetrics: {
      fileSizeBytes: 9000,
      pageCount: 3,
      imageObjectCount: 3,
      codecCounts: { jpeg: 1, jpx: 1, other: 1 },
      pageImageStreamSizeDistributionBytes: { p50: 1000, p90: 3000, max: 3000 },
    },
    unavailableMetrics: ["pageClassification", "estimatedDpi"],
  });
});

test("uses null for unavailable size distribution", () => {
  const result = buildContentBlindProfilerResult(500, {
    pageCount: 1,
    totalOccurrences: 0,
    candidates: [],
  });

  assert.deepEqual(result.derivedMetrics.pageImageStreamSizeDistributionBytes, {
    p50: null,
    p90: null,
    max: null,
  });
});

test("supports cancellation before MuPDF loading", async () => {
  await assert.rejects(
    profileContentBlindPdf(
      { input: new ArrayBuffer(1), mupdfRuntimeUrl: "chrome-extension://test/vendor/mupdf/mupdf.js" },
      () => true,
    ),
    ContentBlindPdfProfilerCancelledError,
  );
});
