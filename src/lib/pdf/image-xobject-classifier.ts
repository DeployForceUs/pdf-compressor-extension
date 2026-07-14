import type {
  PdfImageXObjectCandidate,
  PdfImageXObjectDiscovery,
} from "./image-xobject-discovery";

export type ImageCandidateClassificationCategory =
  | "SAFE_RECOMPRESS"
  | "SKIP"
  | "UNSUPPORTED";

export type ImageCandidateClassificationReasonCode =
  | "ELIGIBLE_FOR_RECOMPRESSION"
  | "MALFORMED_IMAGE_DICTIONARY"
  | "IMAGE_MASK"
  | "ALPHA_DEPENDENCY"
  | "UNRESOLVED_COLORSPACE"
  | "UNSUPPORTED_CMYK_COLORSPACE"
  | "UNSUPPORTED_INDEXED_COLORSPACE"
  | "UNSUPPORTED_COLORSPACE"
  | "UNSUPPORTED_FILTER_CHAIN"
  | "JBIG2_DECODE"
  | "JPX_DECODE"
  | "VERY_SMALL_IMAGE"
  | "DECORATIVE_ASSET_BELOW_THRESHOLD"
  | "ALREADY_EFFICIENTLY_COMPRESSED"
  | "RECOMPRESSION_WOULD_INCREASE_SIZE"
  | "SHARED_REFERENCE_UNSAFE";

export type ImageCandidateClassificationReason = {
  code: ImageCandidateClassificationReasonCode;
  detail: string;
};

export type ClassifiedImageCandidate = PdfImageXObjectCandidate & {
  category: ImageCandidateClassificationCategory;
  reason: ImageCandidateClassificationReason;
  estimatedBytesPerPixel: number | null;
  pixelArea: number | null;
};

export type ImageCandidateClassificationSummary = {
  totalImages: number;
  safeRecompressCount: number;
  skipCount: number;
  unsupportedCount: number;
  reasonBreakdown: Record<ImageCandidateClassificationReasonCode, number>;
  largestSafeCandidates: ClassifiedImageCandidate[];
  candidates: ClassifiedImageCandidate[];
};

const SMALL_STREAM_BYTES = 4096;
const DECORATIVE_AREA_THRESHOLD = 65_536;
const SAFE_STREAM_BYTES = 8_192;
const SAFE_AREA_THRESHOLD = 131_072;
const SAFE_BYTES_PER_PIXEL = 0.18;
const EFFICIENT_JPEG_BYTES_PER_PIXEL = 0.12;

const WRAPPER_FILTERS = new Set(["ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"]);
const SUPPORTED_FILTERS = new Set(["DCTDecode", "FlateDecode"]);
const UNSUPPORTED_FILTERS = new Set(["JBIG2Decode", "JPXDecode", "CCITTFaxDecode"]);
const SUPPORTED_COLORSPACES = new Set(["DeviceRGB", "DeviceGray"]);
const UNSUPPORTED_COLORSPACES = new Set([
  "DeviceCMYK",
  "Indexed",
  "ICCBased",
  "DeviceN",
  "Separation",
  "Lab",
  "CalRGB",
  "CalGray",
  "Pattern",
]);

function asInteger(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const integer = Math.trunc(value);
  return integer > 0 ? integer : null;
}

function computeArea(candidate: PdfImageXObjectCandidate) {
  const width = asInteger(candidate.width);
  const height = asInteger(candidate.height);

  if (width === null || height === null) {
    return null;
  }

  return width * height;
}

function computeBytesPerPixel(candidate: PdfImageXObjectCandidate, pixelArea: number | null) {
  if (pixelArea === null || pixelArea <= 0 || candidate.estimatedStreamSize === null || candidate.estimatedStreamSize <= 0) {
    return null;
  }

  return candidate.estimatedStreamSize / pixelArea;
}

function parseNames(value: string | null) {
  if (!value) {
    return [] as string[];
  }

  const tokens = value.match(/\/[A-Za-z0-9]+/g);
  return tokens ? tokens.map((token) => token.slice(1)) : [];
}

function stringifyDetail(candidate: PdfImageXObjectCandidate) {
  const parts = [
    `page=${candidate.pageNumber}`,
    `ref=${candidate.objectReference}`,
    `size=${candidate.width ?? "?"}x${candidate.height ?? "?"}`,
    `bpc=${candidate.bitsPerComponent ?? "?"}`,
    `filter=${candidate.filterEncoding ?? "?"}`,
    `colorspace=${candidate.colorspace ?? "?"}`,
    `stream=${candidate.estimatedStreamSize ?? "?"}`,
    `shared=${candidate.sharedReferenceCount ?? "?"}`,
  ];

  return parts.join(" ");
}

function classifyUnsupported(candidate: PdfImageXObjectCandidate, code: ImageCandidateClassificationReasonCode, detail: string): ClassifiedImageCandidate {
  const pixelArea = computeArea(candidate);
  return {
    ...candidate,
    category: "UNSUPPORTED",
    reason: { code, detail },
    estimatedBytesPerPixel: computeBytesPerPixel(candidate, pixelArea),
    pixelArea,
  };
}

function classifySkip(candidate: PdfImageXObjectCandidate, code: ImageCandidateClassificationReasonCode, detail: string): ClassifiedImageCandidate {
  const pixelArea = computeArea(candidate);
  return {
    ...candidate,
    category: "SKIP",
    reason: { code, detail },
    estimatedBytesPerPixel: computeBytesPerPixel(candidate, pixelArea),
    pixelArea,
  };
}

function classifySafe(candidate: PdfImageXObjectCandidate, detail: string): ClassifiedImageCandidate {
  const pixelArea = computeArea(candidate);
  return {
    ...candidate,
    category: "SAFE_RECOMPRESS",
    reason: { code: "ELIGIBLE_FOR_RECOMPRESSION", detail },
    estimatedBytesPerPixel: computeBytesPerPixel(candidate, pixelArea),
    pixelArea,
  };
}

function classifyCandidate(candidate: PdfImageXObjectCandidate): ClassifiedImageCandidate {
  if (
    candidate.width === null ||
    candidate.height === null ||
    candidate.bitsPerComponent === null ||
    candidate.estimatedStreamSize === null ||
    candidate.width <= 0 ||
    candidate.height <= 0 ||
    candidate.bitsPerComponent <= 0
  ) {
    return classifyUnsupported(
      candidate,
      "MALFORMED_IMAGE_DICTIONARY",
      `${stringifyDetail(candidate)} malformed image dictionary`,
    );
  }

  if (candidate.imageMask === true) {
    return classifyUnsupported(candidate, "IMAGE_MASK", `${stringifyDetail(candidate)} image mask cannot be recompressed safely`);
  }

  if (candidate.softMask === true || candidate.explicitMask === true) {
    return classifyUnsupported(candidate, "ALPHA_DEPENDENCY", `${stringifyDetail(candidate)} mask or alpha dependency present`);
  }

  const colorspace = candidate.colorspace ?? "";
  const colorNames = parseNames(colorspace);
  const colorSet = new Set(colorNames);

  if (colorNames.length === 0 || / \d+ \d+ R$/.test(colorspace)) {
    return classifyUnsupported(
      candidate,
      "UNRESOLVED_COLORSPACE",
      `${stringifyDetail(candidate)} colorspace is not directly decodable`,
    );
  }

  if (colorSet.has("DeviceCMYK")) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_CMYK_COLORSPACE",
      `${stringifyDetail(candidate)} CMYK recompression is not enabled yet`,
    );
  }

  if (colorSet.has("Indexed")) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_INDEXED_COLORSPACE",
      `${stringifyDetail(candidate)} indexed colorspace is not safely decodable yet`,
    );
  }

  if ([...colorSet].some((name) => UNSUPPORTED_COLORSPACES.has(name))) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_COLORSPACE",
      `${stringifyDetail(candidate)} colorspace is not supported yet`,
    );
  }

  if (![...colorSet].some((name) => SUPPORTED_COLORSPACES.has(name))) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_COLORSPACE",
      `${stringifyDetail(candidate)} colorspace is not supported yet`,
    );
  }

  const filterNames = parseNames(candidate.filterEncoding);
  const primaryFilters = filterNames.filter((name) => !WRAPPER_FILTERS.has(name));

  if (filterNames.length === 0 || primaryFilters.length === 0) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_FILTER_CHAIN",
      `${stringifyDetail(candidate)} filter chain is not directly supported`,
    );
  }

  if (filterNames.some((name) => UNSUPPORTED_FILTERS.has(name))) {
    const unsupportedFilter = filterNames.find((name) => UNSUPPORTED_FILTERS.has(name)) ?? "unknown";
    if (unsupportedFilter === "JBIG2Decode") {
      return classifyUnsupported(candidate, "JBIG2_DECODE", `${stringifyDetail(candidate)} JBIG2Decode is not supported yet`);
    }

    if (unsupportedFilter === "JPXDecode") {
      return classifyUnsupported(candidate, "JPX_DECODE", `${stringifyDetail(candidate)} JPXDecode is not supported yet`);
    }

    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_FILTER_CHAIN",
      `${stringifyDetail(candidate)} unsupported filter ${unsupportedFilter} is present`,
    );
  }

  if (!primaryFilters.every((name) => SUPPORTED_FILTERS.has(name)) || primaryFilters.length > 1) {
    return classifyUnsupported(
      candidate,
      "UNSUPPORTED_FILTER_CHAIN",
      `${stringifyDetail(candidate)} filter chain is not supported yet`,
    );
  }

  if (candidate.sharedReferenceCount !== null && candidate.sharedReferenceCount > 1) {
    return classifySkip(
      candidate,
      "SHARED_REFERENCE_UNSAFE",
      `${stringifyDetail(candidate)} shared references are not safe to rewrite yet`,
    );
  }

  const pixelArea = computeArea(candidate);
  const bytesPerPixel = computeBytesPerPixel(candidate, pixelArea);

  if (
    candidate.estimatedStreamSize < SMALL_STREAM_BYTES ||
    (pixelArea !== null && pixelArea < DECORATIVE_AREA_THRESHOLD)
  ) {
    return classifySkip(
      candidate,
      "VERY_SMALL_IMAGE",
      `${stringifyDetail(candidate)} image is too small to justify recompression`,
    );
  }

  if (
    candidate.filterEncoding?.includes("DCTDecode") &&
    (bytesPerPixel !== null && bytesPerPixel <= EFFICIENT_JPEG_BYTES_PER_PIXEL || candidate.estimatedStreamSize < 32_768)
  ) {
    return classifySkip(
      candidate,
      "ALREADY_EFFICIENTLY_COMPRESSED",
      `${stringifyDetail(candidate)} JPEG stream is already efficiently compressed`,
    );
  }

  if (bytesPerPixel !== null && bytesPerPixel < SAFE_BYTES_PER_PIXEL) {
    return classifySkip(
      candidate,
      "RECOMPRESSION_WOULD_INCREASE_SIZE",
      `${stringifyDetail(candidate)} recompression is unlikely to save bytes`,
    );
  }

  if (candidate.estimatedStreamSize < SAFE_STREAM_BYTES || (pixelArea !== null && pixelArea < SAFE_AREA_THRESHOLD)) {
    return classifySkip(
      candidate,
      "DECORATIVE_ASSET_BELOW_THRESHOLD",
      `${stringifyDetail(candidate)} asset is below the safe recompression threshold`,
    );
  }

  return classifySafe(
    candidate,
    `${stringifyDetail(candidate)} eligible for read-only recompression planning`,
  );
}

export function classifyImageCandidates(discovery: PdfImageXObjectDiscovery): ImageCandidateClassificationSummary {
  const candidates = discovery.candidates.map(classifyCandidate);
  const reasonBreakdown = candidates.reduce<Record<ImageCandidateClassificationReasonCode, number>>(
    (accumulator, candidate) => {
      accumulator[candidate.reason.code] = (accumulator[candidate.reason.code] ?? 0) + 1;
      return accumulator;
    },
    {} as Record<ImageCandidateClassificationReasonCode, number>,
  );

  const safeCandidates = candidates
    .filter((candidate) => candidate.category === "SAFE_RECOMPRESS")
    .sort((left, right) => (right.estimatedStreamSize ?? 0) - (left.estimatedStreamSize ?? 0));

  return {
    totalImages: candidates.length,
    safeRecompressCount: safeCandidates.length,
    skipCount: candidates.filter((candidate) => candidate.category === "SKIP").length,
    unsupportedCount: candidates.filter((candidate) => candidate.category === "UNSUPPORTED").length,
    reasonBreakdown,
    largestSafeCandidates: safeCandidates.slice(0, 5),
    candidates,
  };
}

export function formatImageCandidateClassificationDiagnostics(summary: ImageCandidateClassificationSummary) {
  return {
    totalImages: summary.totalImages,
    safeRecompressCount: summary.safeRecompressCount,
    skipCount: summary.skipCount,
    unsupportedCount: summary.unsupportedCount,
    reasonBreakdown: summary.reasonBreakdown,
    largestSafeCandidates: summary.largestSafeCandidates.map((candidate) => ({
      pageNumber: candidate.pageNumber,
      objectReference: candidate.objectReference,
      estimatedStreamSize: candidate.estimatedStreamSize,
      estimatedBytesPerPixel: candidate.estimatedBytesPerPixel,
      category: candidate.category,
      reason: candidate.reason,
    })),
  };
}
