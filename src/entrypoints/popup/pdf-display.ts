import type { SelectedPdfSnapshot } from "./store";
import { formatBytes } from "../../lib/i18n/helpers";

export type SplitWarningsHeaderText = {
  label: string;
};

export type SelectedPdfDetailRow = {
  label: string;
  value: string;
};

export type SelectedPdfDisplay = {
  badge: string;
  rows: SelectedPdfDetailRow[];
};

type Translator = (key: string, options?: Record<string, unknown>) => string;

export function formatSplitWarningsHeader(count: number, t: Translator) {
  return t("split.warnings.title", { count });
}

export function buildSelectedPdfDisplay(pdf: SelectedPdfSnapshot, locale: string, t: Translator): SelectedPdfDisplay {
  const badge = pdf.selected && pdf.fileSize > 0 ? formatBytes(pdf.fileSize, locale) : "";

  return {
    badge,
    rows: [
      {
        label: t("pdfInput.fileName"),
        value: pdf.fileName ?? "—",
      },
      {
        label: t("pdfInput.pages"),
        value: pdf.pageCount !== null ? String(pdf.pageCount) : "—",
      },
      {
        label: t("pdfInput.validationStatus"),
        value: pdf.status === "idle" ? t("pdfInput.idle") : pdf.status === "validating" ? t("pdfInput.validating") : pdf.status === "ready" ? t("pdfInput.ready") : pdf.error || t("pdfInput.invalidPdf"),
      },
      {
        label: t("pdfInput.selectedState"),
        value: pdf.selected ? t("pdfInput.selected") : t("pdfInput.notSelected"),
      },
    ],
  };
}
