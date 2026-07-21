import {
  discoverImageXObjects,
  type PdfImageXObjectDiscovery,
} from "../pdf/image-xobject-discovery";
import { buildContentBlindDocumentProfile } from "./content-blind-profile-builder";
import { observeContentBlindPage } from "./content-blind-page-observer";
import type { SmartPlannerDocumentProfile } from "./smart-planner-contract";

type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfDocument = InstanceType<MuPdfNamespace["Document"]>;
type MuPdfPdfDocument = InstanceType<MuPdfNamespace["PDFDocument"]>;

export type ContentBlindProfilerRequest = {
  input: ArrayBuffer;
  mupdfRuntimeUrl: string;
};

export type ContentBlindProfilerDerivedMetrics = {
  fileSizeBytes: number;
  pageCount: number;
  imageObjectCount: number;
  codecCounts: {
    jpeg: number;
    jpx: number;
    other: number;
  };
  pageImageStreamSizeDistributionBytes: {
    p50: number | null;
    p90: number | null;
    max: number | null;
  };
};

export type ContentBlindProfilerResult =
  | {
      schemaVersion: 1;
      status: "incomplete";
      derivedMetrics: ContentBlindProfilerDerivedMetrics;
      unavailableMetrics: readonly ["pageClassification", "estimatedDpi"];
    }
  | {
      schemaVersion: 1;
      status: "complete";
      documentProfile: SmartPlannerDocumentProfile;
      unavailableMetrics: readonly [];
    };

export class ContentBlindPdfProfilerCancelledError extends Error {
  constructor() {
    super("Content-blind PDF profiling was cancelled");
    this.name = "ContentBlindPdfProfilerCancelledError";
  }
}

let mupdfModulePromise: Promise<MuPdfNamespace> | null = null;

function validateRuntimeUrl(value: string) {
  if (!value.startsWith("chrome-extension://")) {
    throw new Error("MuPDF runtime URL must be an absolute extension URL");
  }
}

async function loadMuPdf(runtimeUrl: string) {
  validateRuntimeUrl(runtimeUrl);
  mupdfModulePromise ??= import(/* @vite-ignore */ runtimeUrl).then((module: MuPdfModule) => module.default);
  return mupdfModulePromise;
}

async function throwIfCancelled(isCancelled: () => boolean | Promise<boolean>) {
  if (await isCancelled()) {
    throw new ContentBlindPdfProfilerCancelledError();
  }
}

function codecBucket(filterEncoding: string | null): keyof ContentBlindProfilerDerivedMetrics["codecCounts"] {
  const normalized = filterEncoding ?? "";
  if (/DCTDecode|\/DCT/i.test(normalized)) return "jpeg";
  if (/JPXDecode|\/JPX/i.test(normalized)) return "jpx";
  return "other";
}

function nearestRank(sorted: readonly number[], percentile: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function buildContentBlindProfilerResult(
  fileSizeBytes: number,
  discovery: PdfImageXObjectDiscovery,
): ContentBlindProfilerResult {
  const codecCounts = { jpeg: 0, jpx: 0, other: 0 };
  const pageImageBytes = Array.from({ length: discovery.pageCount }, () => 0);

  for (const candidate of discovery.candidates) {
    codecCounts[codecBucket(candidate.filterEncoding)] += 1;
    if (candidate.estimatedStreamSize !== null && candidate.estimatedStreamSize >= 0) {
      pageImageBytes[candidate.pageNumber - 1] += candidate.estimatedStreamSize;
    }
  }

  const knownPageImageBytes = pageImageBytes.filter((value) => value > 0).sort((left, right) => left - right);

  return {
    schemaVersion: 1,
    status: "incomplete",
    derivedMetrics: {
      fileSizeBytes,
      pageCount: discovery.pageCount,
      imageObjectCount: discovery.candidates.length,
      codecCounts,
      pageImageStreamSizeDistributionBytes: {
        p50: nearestRank(knownPageImageBytes, 0.5),
        p90: nearestRank(knownPageImageBytes, 0.9),
        max: knownPageImageBytes.at(-1) ?? null,
      },
    },
    unavailableMetrics: ["pageClassification", "estimatedDpi"],
  };
}

async function buildRuntimeResult(
  input: ArrayBuffer,
  document: MuPdfPdfDocument,
  mupdf: MuPdfNamespace,
  isCancelled: () => boolean | Promise<boolean>,
): Promise<ContentBlindProfilerResult> {
  const discovery = discoverImageXObjects(document);
  const pages = [];

  for (let pageIndex = 0; pageIndex < discovery.pageCount; pageIndex += 1) {
    await throwIfCancelled(isCancelled);
    const page = document.loadPage(pageIndex);
    try {
      const observed = observeContentBlindPage(mupdf, page, pageIndex + 1);
      const candidates = discovery.candidates.filter((candidate) => candidate.pageNumber === pageIndex + 1);
      const codecCounts = { jpeg: 0, jpx: 0, other: 0 };
      let estimatedSizeBytes = 0;

      for (const candidate of candidates) {
        codecCounts[codecBucket(candidate.filterEncoding)] += 1;
        if (candidate.estimatedStreamSize !== null && candidate.estimatedStreamSize >= 0) {
          estimatedSizeBytes += candidate.estimatedStreamSize;
        }
      }

      pages.push({
        pageNumber: pageIndex + 1,
        classification: observed.classification,
        estimatedSizeBytes,
        estimatedDpi: observed.estimatedDpi,
        imageObjectCount: candidates.length,
        codecCounts,
      });
    } finally {
      page.destroy();
    }
  }

  const documentProfile = await buildContentBlindDocumentProfile(
    {
      fileSizeBytes: input.byteLength,
      pageCount: discovery.pageCount,
      pages,
    },
    { isCancelled },
  );

  return {
    schemaVersion: 1,
    status: "complete",
    documentProfile,
    unavailableMetrics: [],
  };
}

export async function profileContentBlindPdf(
  request: ContentBlindProfilerRequest,
  isCancelled: () => boolean | Promise<boolean> = () => false,
): Promise<ContentBlindProfilerResult> {
  await throwIfCancelled(isCancelled);
  const mupdf = await loadMuPdf(request.mupdfRuntimeUrl);
  await throwIfCancelled(isCancelled);

  let document: MuPdfDocument | null = null;
  try {
    document = mupdf.Document.openDocument(new Uint8Array(request.input));
    const pdfDocument = document.asPDF();
    if (!pdfDocument) {
      throw new Error("Selected file is not a PDF document");
    }

    await throwIfCancelled(isCancelled);
    const result = await buildRuntimeResult(request.input, pdfDocument, mupdf, isCancelled);
    await throwIfCancelled(isCancelled);
    return result;
  } finally {
    document?.destroy();
  }
}
