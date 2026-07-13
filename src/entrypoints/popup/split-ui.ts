import {
  normalizeSplitOutputMode,
  type SplitArtifactDescriptor,
  type SplitLocalRequest,
  type SplitOutputMode,
  type SplitProgressEvent,
  type SplitWarning,
} from "../../lib/messaging";
import type { SplitStrategy } from "../../lib/pdf/split-strategies";

export type SplitFormState = {
  strategy: SplitStrategy["type"];
  outputMode: SplitOutputMode;
  pagesPerPart: string;
  maxPartSizeMb: string;
  manualRanges: string;
  compressAfter: boolean;
};

export type SplitFormIssue = "INVALID_PAGES_PER_PART" | "INVALID_MAX_PART_SIZE" | "INVALID_PAGE_RANGE";

export type SplitFormError = {
  issue: SplitFormIssue;
};

export type SplitUiText = {
  t: (key: string, options?: Record<string, unknown>) => string;
  formatBytes: (value: number) => string;
};

export type SplitProgressSnapshot = Pick<
  SplitProgressEvent,
  | "progress"
  | "message"
  | "currentPart"
  | "partsCount"
  | "sourceByteSize"
  | "compressedCandidateByteSize"
  | "selectedByteSize"
  | "fallbackUsed"
> & {
  stage: SplitProgressEvent["stage"] | "idle";
};

export type SplitProgressRender = {
  label: string;
  detail: string;
};

export type SplitWarningRender = {
  title: string;
  detail: string;
};

export type SplitOutputModeOption = {
  value: SplitOutputMode;
  label: string;
  description: string;
};

export type SplitArtifactRender = {
  id: string;
  filename: string;
  size: string;
  pageRange: string;
  kind: string;
  downloadLabel: string;
};

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const POSITIVE_DECIMAL_OR_INTEGER_PATTERN = /^(?:[1-9]\d*|0)(?:\.\d+)?$/;

export function parseStrictPositiveInteger(value: string): number | null {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseStrictPositiveDecimal(value: string): number | null {
  if (!POSITIVE_DECIMAL_OR_INTEGER_PATTERN.test(value)) {
    return null;
  }

  if (Number.isNaN(Number(value)) || !Number.isFinite(Number(value))) {
    return null;
  }

  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

function toSplitFormError(issue: SplitFormIssue): SplitFormError {
  return { issue };
}

export function buildSplitOutputModeOptions(i18n: SplitUiText): SplitOutputModeOption[] {
  return [
    {
      value: "single-zip",
      label: i18n.t("split.outputModes.singleZip"),
      description: i18n.t("split.outputModes.singleZipDescription"),
    },
    {
      value: "individual-pdfs",
      label: i18n.t("split.outputModes.individualPdfs"),
      description: i18n.t("split.outputModes.individualPdfsDescription"),
    },
    {
      value: "separate-zips",
      label: i18n.t("split.outputModes.separateZips"),
      description: i18n.t("split.outputModes.separateZipsDescription"),
    },
  ];
}

export function buildSplitRequestFromForm(form: SplitFormState): SplitLocalRequest | SplitFormError {
  switch (form.strategy) {
    case "by-pages": {
      const pagesPerPart = parseStrictPositiveInteger(form.pagesPerPart);
      if (pagesPerPart === null) {
        return toSplitFormError("INVALID_PAGES_PER_PART");
      }

      return {
        type: "split:local",
        strategy: {
          type: "by-pages",
          pagesPerPart,
        },
        outputMode: normalizeSplitOutputMode(form.outputMode),
        compressAfter: form.compressAfter || undefined,
      };
    }
    case "by-max-size": {
      const maxPartSizeMb = parseStrictPositiveDecimal(form.maxPartSizeMb);
      if (maxPartSizeMb === null) {
        return toSplitFormError("INVALID_MAX_PART_SIZE");
      }

      return {
        type: "split:local",
        strategy: {
          type: "by-max-size",
          maxPartSizeBytes: Math.max(1, Math.round(maxPartSizeMb * 1024 * 1024)),
        },
        outputMode: normalizeSplitOutputMode(form.outputMode),
        compressAfter: form.compressAfter || undefined,
      };
    }
    case "manual-ranges": {
      const ranges = form.manualRanges.trim();
      if (!ranges) {
        return toSplitFormError("INVALID_PAGE_RANGE");
      }

      return {
        type: "split:local",
        strategy: {
          type: "manual-ranges",
          ranges,
        },
        outputMode: normalizeSplitOutputMode(form.outputMode),
        compressAfter: form.compressAfter || undefined,
      };
    }
    default:
      return toSplitFormError("INVALID_PAGE_RANGE");
  }
}

export function formatSplitProgressDisplay(event: SplitProgressSnapshot, i18n: SplitUiText): SplitProgressRender {
  const partsLabel =
    event.partsCount !== null
      ? i18n.t("split.progress.parts", {
          current: event.currentPart ?? 0,
          total: event.partsCount,
        })
      : i18n.t("split.progress.partsUnknown", {
          current: event.currentPart ?? 0,
        });

  let label = partsLabel;
  switch (event.stage) {
    case "validating":
      label = i18n.t("split.progress.validating");
      break;
    case "planning-parts":
      label = i18n.t("split.progress.planningParts");
      break;
    case "creating-part":
      label = i18n.t("split.progress.creatingPart", {
        current: event.currentPart ?? 0,
        total: event.partsCount ?? 0,
      });
      break;
    case "compressing-part":
      label = i18n.t("split.progress.compressingPart", {
        current: event.currentPart ?? 0,
        total: event.partsCount ?? 0,
      });
      break;
    case "validating-part":
      label = i18n.t("split.progress.validatingPart", {
        current: event.currentPart ?? 0,
        total: event.partsCount ?? 0,
      });
      break;
    case "creating-zip":
      label = i18n.t("split.progress.creatingZip");
      break;
    case "creating-artifacts":
      label = i18n.t("split.progress.creatingArtifacts");
      break;
    case "persisting":
      label = i18n.t("split.progress.savingResult");
      break;
    case "complete":
      label = i18n.t("split.progress.complete");
      break;
    default:
      break;
  }

  const detail: string[] = [];
  if (typeof event.sourceByteSize === "number") {
    detail.push(i18n.t("split.progress.sourceBytes", { size: i18n.formatBytes(event.sourceByteSize) }));
  }
  if (typeof event.compressedCandidateByteSize === "number") {
    detail.push(i18n.t("split.progress.candidateBytes", { size: i18n.formatBytes(event.compressedCandidateByteSize) }));
  }
  if (typeof event.selectedByteSize === "number") {
    detail.push(i18n.t("split.progress.selectedBytes", { size: i18n.formatBytes(event.selectedByteSize) }));
  }
  if (typeof event.fallbackUsed === "boolean") {
    detail.push(
      event.fallbackUsed
        ? i18n.t("split.progress.fallbackUsed")
        : i18n.t("split.progress.noFallback"),
    );
  }

  return {
    label,
    detail: detail.join(" · "),
  };
}

export function formatSplitWarning(warning: SplitWarning, i18n: SplitUiText): SplitWarningRender {
  switch (warning.code) {
    case "SINGLE_PAGE_EXCEEDS_LIMIT":
      return {
        title: i18n.t("split.warnings.singlePageExceedsLimit"),
        detail: i18n.t("split.warnings.singlePageExceedsLimitDetail", {
          page: warning.pageNumber,
          actual: i18n.formatBytes(warning.actualGeneratedByteSize),
          requested: i18n.formatBytes(warning.requestedMaximumByteSize),
          fileName: warning.fileName,
        }),
      };
    case "COMPRESSION_FAILED_FALLBACK":
      return {
        title: i18n.t("split.warnings.compressionFailedFallback"),
        detail: i18n.t("split.warnings.compressionFailedFallbackDetail", {
          fileName: warning.fileName,
          source: i18n.formatBytes(warning.sourceByteSize),
          selected: i18n.formatBytes(warning.selectedByteSize),
          candidate:
            typeof warning.compressedCandidateByteSize === "number"
              ? i18n.formatBytes(warning.compressedCandidateByteSize)
              : i18n.t("split.warnings.notAvailable"),
        }),
      };
    case "COMPRESSED_PART_INVALID_FALLBACK":
      return {
        title: i18n.t("split.warnings.compressedPartInvalidFallback"),
        detail: i18n.t("split.warnings.compressedPartInvalidFallbackDetail", {
          fileName: warning.fileName,
          source: i18n.formatBytes(warning.sourceByteSize),
          selected: i18n.formatBytes(warning.selectedByteSize),
          candidate:
            typeof warning.compressedCandidateByteSize === "number"
              ? i18n.formatBytes(warning.compressedCandidateByteSize)
              : i18n.t("split.warnings.notAvailable"),
        }),
      };
    case "COMPRESSED_PART_NOT_SMALLER_FALLBACK":
      return {
        title: i18n.t("split.warnings.compressedPartNotSmallerFallback"),
        detail: i18n.t("split.warnings.compressedPartNotSmallerFallbackDetail", {
          fileName: warning.fileName,
          source: i18n.formatBytes(warning.sourceByteSize),
          selected: i18n.formatBytes(warning.selectedByteSize),
          candidate:
            typeof warning.compressedCandidateByteSize === "number"
              ? i18n.formatBytes(warning.compressedCandidateByteSize)
              : i18n.t("split.warnings.notAvailable"),
        }),
      };
    default: {
      const exhausted: never = warning;
      return exhausted;
    }
  }
}

function formatArtifactPageRange(artifact: Pick<SplitArtifactDescriptor, "pageStart" | "pageEnd">, t: SplitUiText["t"]) {
  if (typeof artifact.pageStart === "number" && typeof artifact.pageEnd === "number") {
    return t("split.artifactPageRange", {
      start: artifact.pageStart,
      end: artifact.pageEnd,
    });
  }

  return t("split.artifactPageRangeUnknown");
}

export function buildSplitArtifactRender(
  artifact: SplitArtifactDescriptor,
  i18n: SplitUiText,
): SplitArtifactRender {
  return {
    id: artifact.id,
    filename: artifact.filename,
    size: i18n.formatBytes(artifact.byteLength),
    pageRange: formatArtifactPageRange(artifact, i18n.t),
    kind: i18n.t(`split.artifactKinds.${artifact.kind}`),
    downloadLabel: i18n.t("split.downloadArtifact"),
  };
}

export function assertDownloadableSplitArtifactBytes(
  artifact: Pick<SplitArtifactDescriptor, "kind" | "filename">,
  bytes: ArrayBuffer,
) {
  if (!(bytes instanceof ArrayBuffer)) {
    throw new Error(`Artifact ${artifact.filename} data is not an ArrayBuffer`);
  }

  const headerLength = artifact.kind === "pdf" ? 5 : 2;
  const header = new TextDecoder().decode(new Uint8Array(bytes).slice(0, headerLength));

  if (artifact.kind === "pdf" && header !== "%PDF-") {
    throw new Error(`Artifact ${artifact.filename} does not start with %PDF-`);
  }

  if (artifact.kind === "zip" && header !== "PK") {
    throw new Error(`Artifact ${artifact.filename} does not start with PK`);
  }

  return bytes;
}

export function splitDownloadFileName(fileName: string | null | undefined) {
  if (!fileName) {
    return "split.zip";
  }

  return fileName.replace(/\.zip$/i, ".zip");
}
