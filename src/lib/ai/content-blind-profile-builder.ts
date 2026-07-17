import type { SmartPlannerDocumentProfile } from "./smart-planner-contract";

export type ContentBlindPageClassification = "scanned" | "vector" | "text";

export type ContentBlindPageObservation = {
  pageNumber: number;
  classification: ContentBlindPageClassification;
  estimatedSizeBytes: number;
  estimatedDpi: number | null;
  imageObjectCount: number;
  codecCounts: {
    jpeg: number;
    jpx: number;
    other: number;
  };
};

export type ContentBlindProfileSource = {
  fileSizeBytes: number;
  pageCount: number;
  pages: readonly ContentBlindPageObservation[];
};

export type BuildContentBlindProfileOptions = {
  isCancelled?: () => boolean | Promise<boolean>;
};

const SOURCE_KEYS = ["fileSizeBytes", "pageCount", "pages"] as const;
const PAGE_KEYS = [
  "pageNumber",
  "classification",
  "estimatedSizeBytes",
  "estimatedDpi",
  "imageObjectCount",
  "codecCounts",
] as const;
const CODEC_KEYS = ["jpeg", "jpx", "other"] as const;
const CLASSIFICATIONS = new Set<ContentBlindPageClassification>(["scanned", "vector", "text"]);

export class ContentBlindProfileCancelledError extends Error {
  constructor() {
    super("Content-blind PDF profiling was cancelled");
    this.name = "ContentBlindProfileCancelledError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}.${key}: unknown field`);
    }
  }
}

function expectNonNegativeInteger(value: unknown, path: string, errors: string[]) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    errors.push(`${path}: expected non-negative safe integer`);
  }
}

function expectPositiveInteger(value: unknown, path: string, errors: string[]) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    errors.push(`${path}: expected positive safe integer`);
  }
}

function validateSource(value: unknown): ContentBlindProfileSource {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new TypeError("$: expected object");
  }

  rejectUnknownKeys(value, SOURCE_KEYS, "$", errors);
  expectNonNegativeInteger(value.fileSizeBytes, "$.fileSizeBytes", errors);
  expectPositiveInteger(value.pageCount, "$.pageCount", errors);

  if (!Array.isArray(value.pages)) {
    errors.push("$.pages: expected array");
  } else {
    const pageNumbers = new Set<number>();
    value.pages.forEach((page, index) => {
      const path = `$.pages[${index}]`;
      if (!isRecord(page)) {
        errors.push(`${path}: expected object`);
        return;
      }

      rejectUnknownKeys(page, PAGE_KEYS, path, errors);
      expectPositiveInteger(page.pageNumber, `${path}.pageNumber`, errors);
      if (Number.isSafeInteger(page.pageNumber) && (page.pageNumber as number) > 0) {
        const pageNumber = page.pageNumber as number;
        if (pageNumbers.has(pageNumber)) {
          errors.push(`${path}.pageNumber: duplicate page number`);
        }
        pageNumbers.add(pageNumber);
      }

      if (!CLASSIFICATIONS.has(page.classification as ContentBlindPageClassification)) {
        errors.push(`${path}.classification: expected scanned, vector, or text`);
      }
      expectNonNegativeInteger(page.estimatedSizeBytes, `${path}.estimatedSizeBytes`, errors);
      if (
        page.estimatedDpi !== null &&
        (typeof page.estimatedDpi !== "number" ||
          !Number.isFinite(page.estimatedDpi) ||
          page.estimatedDpi <= 0)
      ) {
        errors.push(`${path}.estimatedDpi: expected null or positive finite number`);
      }
      expectNonNegativeInteger(page.imageObjectCount, `${path}.imageObjectCount`, errors);

      if (!isRecord(page.codecCounts)) {
        errors.push(`${path}.codecCounts: expected object`);
      } else {
        rejectUnknownKeys(page.codecCounts, CODEC_KEYS, `${path}.codecCounts`, errors);
        for (const key of CODEC_KEYS) {
          expectNonNegativeInteger(page.codecCounts[key], `${path}.codecCounts.${key}`, errors);
        }
      }
    });

    if (Number.isSafeInteger(value.pageCount) && value.pages.length !== value.pageCount) {
      errors.push("$.pages: expected exactly one observation per page");
    }

    if (Number.isSafeInteger(value.pageCount) && (value.pageCount as number) > 0) {
      for (let pageNumber = 1; pageNumber <= (value.pageCount as number); pageNumber += 1) {
        if (!pageNumbers.has(pageNumber)) {
          errors.push(`$.pages: missing page ${pageNumber}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new TypeError(errors.join("; "));
  }

  return value as unknown as ContentBlindProfileSource;
}

function nearestRank(sorted: readonly number[], percentile: number) {
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  return sorted[rank - 1] ?? 0;
}

function ratio(count: number, total: number) {
  return total === 0 ? 0 : count / total;
}

async function throwIfCancelled(isCancelled: BuildContentBlindProfileOptions["isCancelled"]) {
  if (isCancelled && (await isCancelled())) {
    throw new ContentBlindProfileCancelledError();
  }
}

export async function buildContentBlindDocumentProfile(
  sourceValue: unknown,
  options: BuildContentBlindProfileOptions = {},
): Promise<SmartPlannerDocumentProfile> {
  const source = validateSource(sourceValue);
  await throwIfCancelled(options.isCancelled);

  const classificationCounts: Record<ContentBlindPageClassification, number> = {
    scanned: 0,
    vector: 0,
    text: 0,
  };
  const dpiCounts = { under150: 0, "150to300": 0, over300: 0 };
  const codecCounts = { jpeg: 0, jpx: 0, other: 0 };
  const pageSizes: number[] = [];
  let imageObjectCount = 0;

  for (const page of source.pages) {
    await throwIfCancelled(options.isCancelled);
    classificationCounts[page.classification] += 1;
    pageSizes.push(page.estimatedSizeBytes);
    imageObjectCount += page.imageObjectCount;
    codecCounts.jpeg += page.codecCounts.jpeg;
    codecCounts.jpx += page.codecCounts.jpx;
    codecCounts.other += page.codecCounts.other;

    if (page.estimatedDpi !== null) {
      if (page.estimatedDpi < 150) {
        dpiCounts.under150 += 1;
      } else if (page.estimatedDpi <= 300) {
        dpiCounts["150to300"] += 1;
      } else {
        dpiCounts.over300 += 1;
      }
    }
  }

  await throwIfCancelled(options.isCancelled);
  pageSizes.sort((left, right) => left - right);

  return {
    fileSizeBytes: source.fileSizeBytes,
    pageCount: source.pageCount,
    imageObjectCount,
    scannedPageRatio: ratio(classificationCounts.scanned, source.pageCount),
    vectorPageRatio: ratio(classificationCounts.vector, source.pageCount),
    textPageRatio: ratio(classificationCounts.text, source.pageCount),
    estimatedDpiBuckets: {
      under150: ratio(dpiCounts.under150, source.pageCount),
      "150to300": ratio(dpiCounts["150to300"], source.pageCount),
      over300: ratio(dpiCounts.over300, source.pageCount),
    },
    codecCounts,
    pageSizeDistributionBytes: {
      p50: nearestRank(pageSizes, 0.5),
      p90: nearestRank(pageSizes, 0.9),
      max: pageSizes.at(-1) ?? 0,
    },
  };
}
