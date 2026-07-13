import type { SplitLocalRequest, SplitProgressEvent, SplitWarning } from "../../lib/messaging";
import type { SplitStrategy } from "../../lib/pdf/split-strategies";

export type SplitFormState = {
  strategy: SplitStrategy["type"];
  pagesPerPart: string;
  maxPartSizeMb: string;
  manualRanges: string;
  compressAfter: boolean;
};

export type SplitFormIssue = "INVALID_PAGES_PER_PART" | "INVALID_MAX_PART_SIZE" | "INVALID_PAGE_RANGE";
export type SplitFormError = {
  issue: SplitFormIssue;
};

export function buildSplitRequestFromForm(form: SplitFormState): SplitLocalRequest | SplitFormError {
  switch (form.strategy) {
    case "by-pages": {
      const pagesPerPart = Number.parseInt(form.pagesPerPart, 10);
      if (!Number.isInteger(pagesPerPart) || pagesPerPart <= 0) {
        return { issue: "INVALID_PAGES_PER_PART" };
      }

      return {
        type: "split:local",
        strategy: {
          type: "by-pages",
          pagesPerPart,
        },
        compressAfter: form.compressAfter || undefined,
      };
    }
    case "by-max-size": {
      const maxPartSizeMb = Number.parseFloat(form.maxPartSizeMb);
      if (!Number.isFinite(maxPartSizeMb) || maxPartSizeMb <= 0) {
        return { issue: "INVALID_MAX_PART_SIZE" };
      }

      return {
        type: "split:local",
        strategy: {
          type: "by-max-size",
          maxPartSizeBytes: Math.max(1, Math.round(maxPartSizeMb * 1024 * 1024)),
        },
        compressAfter: form.compressAfter || undefined,
      };
    }
    case "manual-ranges": {
      const ranges = form.manualRanges.trim();
      if (!ranges) {
        return { issue: "INVALID_PAGE_RANGE" };
      }

      return {
        type: "split:local",
        strategy: {
          type: "manual-ranges",
          ranges,
        },
        compressAfter: form.compressAfter || undefined,
      };
    }
    default: {
      return { issue: "INVALID_PAGE_RANGE" };
    }
  }
}

export function splitProgressLabel(event: SplitProgressEvent): string {
  return event.message;
}

export function splitProgressSummary(event: SplitProgressEvent) {
  const parts = event.partsCount > 0 ? `${event.currentPart} of ${event.partsCount}` : `${event.currentPart}`;
  const detail: string[] = [];

  if (typeof event.sourceByteSize === "number") {
    detail.push(`source ${event.sourceByteSize} bytes`);
  }

  if (typeof event.compressedCandidateByteSize === "number") {
    detail.push(`candidate ${event.compressedCandidateByteSize} bytes`);
  }

  if (typeof event.selectedByteSize === "number") {
    detail.push(`selected ${event.selectedByteSize} bytes`);
  }

  if (typeof event.fallbackUsed === "boolean") {
    detail.push(event.fallbackUsed ? "fallback used" : "no fallback");
  }

  return {
    parts,
    detail: detail.join(" · "),
  };
}

export function splitWarningLabel(warning: SplitWarning): string {
  switch (warning.code) {
    case "SINGLE_PAGE_EXCEEDS_LIMIT":
      return `Page ${warning.pageNumber} exceeded the requested limit`;
    case "COMPRESSION_FAILED_FALLBACK":
      return `${warning.fileName} fell back after compression failed`;
    case "COMPRESSED_PART_INVALID_FALLBACK":
      return `${warning.fileName} fell back after validation failed`;
    case "COMPRESSED_PART_NOT_SMALLER_FALLBACK":
      return `${warning.fileName} fell back because the compressed part was not smaller`;
    default: {
      const exhausted: never = warning;
      return exhausted;
    }
  }
}

export function splitDownloadFileName(fileName: string | null | undefined) {
  if (!fileName) {
    return "split.zip";
  }

  return fileName.replace(/\.zip$/i, ".zip");
}
