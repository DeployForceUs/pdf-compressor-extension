export type SplitPageRange = {
  startPage: number;
  endPage: number;
};

export type SplitByPagesStrategy = {
  type: "by-pages";
  pagesPerPart: number;
};

export type SplitManualRangesStrategy = {
  type: "manual-ranges";
  ranges: string;
};

export type SplitByMaxSizeStrategy = {
  type: "by-max-size";
  maxPartSizeBytes: number;
};

export type SplitStrategy = SplitByPagesStrategy | SplitManualRangesStrategy | SplitByMaxSizeStrategy;

export type SplitPlannedPart = {
  partNumber: number;
  range: SplitPageRange;
  pageCount: number;
};

export type SplitPlannerErrorCode =
  | "INVALID_TOTAL_PAGES"
  | "INVALID_PAGES_PER_PART"
  | "INVALID_PAGE_RANGE"
  | "PAGE_RANGE_OUT_OF_BOUNDS"
  | "OVERLAPPING_PAGE_RANGES"
  | "DUPLICATE_PAGE"
  | "INVALID_MAX_PART_SIZE";

export type SplitPlannerErrorDetails = {
  input?: string;
  page?: number;
  range?: SplitPageRange;
  ranges?: SplitPageRange[];
  totalPages?: number;
  pagesPerPart?: number;
  maxPartSizeBytes?: number;
};

export class SplitPlannerError extends Error {
  readonly code: SplitPlannerErrorCode;
  readonly details: SplitPlannerErrorDetails;

  constructor(code: SplitPlannerErrorCode, message: string, details: SplitPlannerErrorDetails = {}) {
    super(message);
    this.name = "SplitPlannerError";
    this.code = code;
    this.details = details;
  }
}

export type SplitPlanBase = {
  totalPages: number;
  strategy: SplitStrategy;
};

export type SplitResolvedPlan = SplitPlanBase & {
  parts: SplitPlannedPart[];
  planningState: "resolved";
};

export type SplitDeferredSizePlan = SplitPlanBase & {
  strategy: SplitByMaxSizeStrategy;
  parts: SplitPlannedPart[];
  planningState: "deferred";
  sizePlanning: {
    supported: false;
    reason: "SIZE_PLANNING_DEFERRED";
  };
};

export type SplitPlan = SplitResolvedPlan | SplitDeferredSizePlan;

export type SplitPlanningRequest = {
  totalPages: number;
  strategy: SplitStrategy;
};

export function assertPositiveInteger(
  value: number,
  code: SplitPlannerErrorCode,
  fieldName: "totalPages" | "pagesPerPart" | "maxPartSizeBytes",
) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SplitPlannerError(code, `${fieldName} must be a positive integer`, {
      [fieldName]: value,
    } as SplitPlannerErrorDetails);
  }
}

export function isSplitPageRange(value: unknown): value is SplitPageRange {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger((value as SplitPageRange).startPage) &&
    Number.isInteger((value as SplitPageRange).endPage)
  );
}

export function cloneSplitPageRange(range: SplitPageRange): SplitPageRange {
  return {
    startPage: range.startPage,
    endPage: range.endPage,
  };
}

