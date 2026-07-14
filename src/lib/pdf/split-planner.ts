import {
  assertPositiveInteger,
  type SplitDeferredSizePlan,
  type SplitPlan,
  type SplitPlanningRequest,
  type SplitPlannedPart,
  type SplitResolvedPlan,
  type SplitStrategy,
} from "./split-strategies";
import { parseAndValidatePageRanges } from "./page-range-parser";

function buildPartsFromRanges(ranges: { startPage: number; endPage: number }[]): SplitPlannedPart[] {
  return ranges.map((range, index) => ({
    partNumber: index + 1,
    range,
    pageCount: range.endPage - range.startPage + 1,
  }));
}

function planByPages(totalPages: number, pagesPerPart: number): SplitResolvedPlan {
  assertPositiveInteger(totalPages, "INVALID_TOTAL_PAGES", "totalPages");
  assertPositiveInteger(pagesPerPart, "INVALID_PAGES_PER_PART", "pagesPerPart");

  const parts: SplitPlannedPart[] = [];

  for (let startPage = 1, partNumber = 1; startPage <= totalPages; startPage += pagesPerPart, partNumber += 1) {
    const endPage = Math.min(totalPages, startPage + pagesPerPart - 1);
    parts.push({
      partNumber,
      range: {
        startPage,
        endPage,
      },
      pageCount: endPage - startPage + 1,
    });
  }

  return {
    totalPages,
    strategy: {
      type: "by-pages",
      pagesPerPart,
    },
    parts,
    planningState: "resolved",
  };
}

function planManualRanges(totalPages: number, ranges: string): SplitResolvedPlan {
  assertPositiveInteger(totalPages, "INVALID_TOTAL_PAGES", "totalPages");

  const resolvedRanges = parseAndValidatePageRanges(ranges, totalPages);

  return {
    totalPages,
    strategy: {
      type: "manual-ranges",
      ranges,
    },
    parts: buildPartsFromRanges(resolvedRanges),
    planningState: "resolved",
  };
}

function planDeferredSize(totalPages: number, maxPartSizeBytes: number): SplitDeferredSizePlan {
  assertPositiveInteger(totalPages, "INVALID_TOTAL_PAGES", "totalPages");
  assertPositiveInteger(maxPartSizeBytes, "INVALID_MAX_PART_SIZE", "maxPartSizeBytes");

  return {
    totalPages,
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes,
    },
    parts: [],
    planningState: "deferred",
    sizePlanning: {
      supported: false,
      reason: "SIZE_PLANNING_DEFERRED",
    },
  };
}

export function planSplit(request: SplitPlanningRequest): SplitPlan {
  const strategy = request.strategy as SplitStrategy;

  switch (strategy.type) {
    case "by-pages":
      return planByPages(request.totalPages, strategy.pagesPerPart);
    case "manual-ranges":
      return planManualRanges(request.totalPages, strategy.ranges);
    case "by-max-size":
      return planDeferredSize(request.totalPages, strategy.maxPartSizeBytes);
    default: {
      const exhaustedStrategy: never = strategy;
      return exhaustedStrategy;
    }
  }
}

export function isDeferredSizePlan(plan: SplitPlan): plan is SplitDeferredSizePlan {
  return plan.strategy.type === "by-max-size";
}

