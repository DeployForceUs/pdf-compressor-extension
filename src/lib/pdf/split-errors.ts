import { SplitPlannerError } from "./split-strategies";
import { ZipPdfArchiveError } from "../archive/zip-parts";

export type SplitErrorCode =
  | "INVALID_PDF"
  | "INVALID_PAGE_RANGE"
  | "PAGE_RANGE_OUT_OF_BOUNDS"
  | "OVERLAPPING_PAGE_RANGES"
  | "INVALID_MAX_PART_SIZE"
  | "SINGLE_PAGE_EXCEEDS_LIMIT"
  | "SPLIT_FAILED"
  | "PART_VALIDATION_FAILED"
  | "ZIP_CREATION_FAILED"
  | "CANCELLED"
  | "TIMEOUT"
  | "STORAGE_QUOTA_EXCEEDED";

export type SplitRuntimeErrorDetails = Record<string, unknown>;

export class SplitRuntimeError extends Error {
  readonly code: SplitErrorCode;
  readonly details: SplitRuntimeErrorDetails;

  constructor(code: SplitErrorCode, message: string, details: SplitRuntimeErrorDetails = {}) {
    super(message);
    this.name = "SplitRuntimeError";
    this.code = code;
    this.details = details;
  }
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  );
}

function hasSplitErrorCode(error: unknown): error is { code: string; message?: string; details?: SplitRuntimeErrorDetails } {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

export function toSplitRuntimeError(error: unknown, fallbackCode: SplitErrorCode = "SPLIT_FAILED"): SplitRuntimeError {
  if (error instanceof SplitRuntimeError) {
    return error;
  }

  if (isQuotaExceededError(error)) {
    return new SplitRuntimeError("STORAGE_QUOTA_EXCEEDED", "Split result could not be persisted because storage quota was exceeded");
  }

  if (error instanceof ZipPdfArchiveError) {
    switch (error.code) {
      case "EMPTY_PART_LIST":
      case "INVALID_PART":
        return new SplitRuntimeError("PART_VALIDATION_FAILED", error.message, error.details);
      case "DUPLICATE_FILENAME":
        return new SplitRuntimeError("ZIP_CREATION_FAILED", error.message, error.details);
      case "ZIP_CREATION_FAILED":
      case "ZIP_VALIDATION_FAILED":
        return new SplitRuntimeError("ZIP_CREATION_FAILED", error.message, error.details);
      default:
        return new SplitRuntimeError("ZIP_CREATION_FAILED", error.message, error.details);
    }
  }

  if (error instanceof SplitPlannerError) {
    switch (error.code) {
      case "INVALID_PAGE_RANGE":
        return new SplitRuntimeError("INVALID_PAGE_RANGE", error.message, error.details);
      case "PAGE_RANGE_OUT_OF_BOUNDS":
        return new SplitRuntimeError("PAGE_RANGE_OUT_OF_BOUNDS", error.message, error.details);
      case "OVERLAPPING_PAGE_RANGES":
      case "DUPLICATE_PAGE":
        return new SplitRuntimeError("OVERLAPPING_PAGE_RANGES", error.message, error.details);
      case "INVALID_MAX_PART_SIZE":
        return new SplitRuntimeError("INVALID_MAX_PART_SIZE", error.message, error.details);
      default:
        return new SplitRuntimeError(fallbackCode, error.message, error.details);
    }
  }

  if (hasSplitErrorCode(error)) {
    const code = error.code as SplitErrorCode;
    if (
      code === "INVALID_PDF" ||
      code === "INVALID_PAGE_RANGE" ||
      code === "PAGE_RANGE_OUT_OF_BOUNDS" ||
      code === "OVERLAPPING_PAGE_RANGES" ||
      code === "INVALID_MAX_PART_SIZE" ||
      code === "SINGLE_PAGE_EXCEEDS_LIMIT" ||
      code === "SPLIT_FAILED" ||
      code === "PART_VALIDATION_FAILED" ||
      code === "ZIP_CREATION_FAILED" ||
      code === "CANCELLED" ||
      code === "TIMEOUT" ||
      code === "STORAGE_QUOTA_EXCEEDED"
    ) {
      return new SplitRuntimeError(code, error.message ?? "Split failed", error.details ?? {});
    }
  }

  if (error instanceof Error) {
    return new SplitRuntimeError(fallbackCode, error.message || "Split failed");
  }

  return new SplitRuntimeError(fallbackCode, "Split failed");
}

