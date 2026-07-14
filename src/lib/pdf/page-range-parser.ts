import {
  cloneSplitPageRange,
  SplitPlannerError,
  type SplitPageRange,
  type SplitPlannerErrorCode,
} from "./split-strategies";

const RANGE_SEPARATOR = /\s*,\s*/;
const SINGLE_PAGE_PATTERN = /^\d+$/;
const RANGE_PATTERN = /^(\d+)\s*-\s*(\d+)$/;

function toPositivePageNumber(raw: string, input: string) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new SplitPlannerError("INVALID_PAGE_RANGE", `Invalid page range expression: ${input}`, { input });
  }

  return value;
}

function compareRanges(left: SplitPageRange, right: SplitPageRange) {
  if (left.startPage !== right.startPage) {
    return left.startPage - right.startPage;
  }

  return left.endPage - right.endPage;
}

export function parsePageRangeExpression(expression: string): SplitPageRange[] {
  const input = expression.trim();

  if (!input) {
    throw new SplitPlannerError("INVALID_PAGE_RANGE", "Page range expression cannot be empty", { input: expression });
  }

  const segments = input.split(RANGE_SEPARATOR);
  if (segments.length === 0) {
    throw new SplitPlannerError("INVALID_PAGE_RANGE", "Page range expression cannot be empty", { input: expression });
  }

  return segments.map((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) {
      throw new SplitPlannerError("INVALID_PAGE_RANGE", `Invalid page range expression: ${expression}`, {
        input: expression,
      });
    }

    if (SINGLE_PAGE_PATTERN.test(trimmed)) {
      const page = toPositivePageNumber(trimmed, expression);
      return {
        startPage: page,
        endPage: page,
      };
    }

    const match = trimmed.match(RANGE_PATTERN);
    if (!match) {
      throw new SplitPlannerError("INVALID_PAGE_RANGE", `Invalid page range expression: ${expression}`, { input: expression });
    }

    const startPage = toPositivePageNumber(match[1], expression);
    const endPage = toPositivePageNumber(match[2], expression);

    if (startPage > endPage) {
      throw new SplitPlannerError("INVALID_PAGE_RANGE", `Range start must be less than or equal to end: ${trimmed}`, {
        input: expression,
        range: {
          startPage,
          endPage,
        },
      });
    }

    return {
      startPage,
      endPage,
    };
  });
}

export function normalizePageRanges(ranges: SplitPageRange[]): SplitPageRange[] {
  return ranges
    .map(cloneSplitPageRange)
    .sort(compareRanges);
}

function createRangeConflictError(
  code: SplitPlannerErrorCode,
  message: string,
  range: SplitPageRange,
  totalPages: number,
) {
  throw new SplitPlannerError(code, message, {
    range,
    totalPages,
  });
}

export function validatePageRanges(ranges: SplitPageRange[], totalPages: number): SplitPageRange[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    throw new SplitPlannerError("INVALID_TOTAL_PAGES", "totalPages must be a positive integer", { totalPages });
  }

  const normalized = normalizePageRanges(ranges);
  let previousRange: SplitPageRange | null = null;

  for (const range of normalized) {
    if (range.startPage < 1 || range.endPage > totalPages) {
      createRangeConflictError(
        "PAGE_RANGE_OUT_OF_BOUNDS",
        `Page range ${range.startPage}-${range.endPage} is outside the document bounds`,
        range,
        totalPages,
      );
    }

    if (previousRange && range.startPage <= previousRange.endPage) {
      const isDuplicateSinglePage =
        range.startPage === range.endPage &&
        previousRange.startPage === previousRange.endPage &&
        range.startPage === previousRange.startPage;

      createRangeConflictError(
        isDuplicateSinglePage ? "DUPLICATE_PAGE" : "OVERLAPPING_PAGE_RANGES",
        isDuplicateSinglePage
          ? `Page ${range.startPage} was specified more than once`
          : `Page ranges ${previousRange.startPage}-${previousRange.endPage} and ${range.startPage}-${range.endPage} overlap`,
        range,
        totalPages,
      );
    }

    previousRange = range;
  }

  return normalized;
}

export function validatePageRangesInInputOrder(ranges: SplitPageRange[], totalPages: number): SplitPageRange[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    throw new SplitPlannerError("INVALID_TOTAL_PAGES", "totalPages must be a positive integer", { totalPages });
  }

  const validated = ranges.map(cloneSplitPageRange);
  const seenPages = new Set<number>();
  let previousRange: SplitPageRange | null = null;

  for (const range of validated) {
    if (range.startPage < 1 || range.endPage > totalPages) {
      createRangeConflictError(
        "PAGE_RANGE_OUT_OF_BOUNDS",
        `Page range ${range.startPage}-${range.endPage} is outside the document bounds`,
        range,
        totalPages,
      );
    }

    if (previousRange && range.startPage <= previousRange.endPage) {
      const isDuplicateSinglePage =
        range.startPage === range.endPage &&
        previousRange.startPage === previousRange.endPage &&
        range.startPage === previousRange.startPage;

      createRangeConflictError(
        isDuplicateSinglePage ? "DUPLICATE_PAGE" : "OVERLAPPING_PAGE_RANGES",
        isDuplicateSinglePage
          ? `Page ${range.startPage} was specified more than once`
          : `Page ranges ${previousRange.startPage}-${previousRange.endPage} and ${range.startPage}-${range.endPage} overlap`,
        range,
        totalPages,
      );
    }

    for (let page = range.startPage; page <= range.endPage; page += 1) {
      if (seenPages.has(page)) {
        createRangeConflictError(
          "DUPLICATE_PAGE",
          `Page ${page} was specified more than once`,
          range,
          totalPages,
        );
      }

      seenPages.add(page);
    }

    previousRange = range;
  }

  return validated;
}

export function parseAndValidatePageRanges(expression: string, totalPages: number): SplitPageRange[] {
  return validatePageRanges(parsePageRangeExpression(expression), totalPages);
}
