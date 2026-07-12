import { PDFDocument } from "pdf-lib";
import { planSplit } from "./split-planner";
import type { SplitPageRange, SplitPlannedPart } from "./split-strategies";

export type SplitByPagesRequest = {
  inputBytes: ArrayBuffer | Uint8Array;
  pagesPerPart: number;
  documentName?: string;
};

export type SplitByPagesOutputPart = SplitPlannedPart & {
  filename: string;
  bytes: Uint8Array;
};

export type SplitByPagesResult = {
  sourcePageCount: number;
  parts: SplitByPagesOutputPart[];
};

function toUint8Array(inputBytes: ArrayBuffer | Uint8Array) {
  return inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
}

function formatPageRangeLabel(range: SplitPageRange) {
  return `${range.startPage}-${range.endPage}`;
}

function sanitizeDocumentStem(documentName: string | undefined) {
  const trimmed = (documentName ?? "document").trim();
  const withoutExtension = trimmed.replace(/\.[^./\\]+$/, "");
  const sanitized = withoutExtension.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[_\-.]+|[_\-.]+$/g, "");

  return sanitized || "document";
}

function formatSplitFilename(documentName: string | undefined, partNumber: number, range: SplitPageRange) {
  const stem = sanitizeDocumentStem(documentName);
  const paddedPartNumber = String(partNumber).padStart(3, "0");

  return `${stem}_part_${paddedPartNumber}_pages_${formatPageRangeLabel(range)}.pdf`;
}

async function extractPartBytes(sourceDocument: PDFDocument, range: SplitPageRange) {
  const outputDocument = await PDFDocument.create();
  const pageIndices = Array.from(
    { length: range.endPage - range.startPage + 1 },
    (_, index) => range.startPage - 1 + index,
  );
  const copiedPages = await outputDocument.copyPages(sourceDocument, pageIndices);

  for (const page of copiedPages) {
    outputDocument.addPage(page);
  }

  return outputDocument.save();
}

async function validatePartBytes(bytes: Uint8Array, expectedPageCount: number, range: SplitPageRange) {
  const reopened = await PDFDocument.load(bytes);
  const actualPageCount = reopened.getPageCount();

  if (actualPageCount !== expectedPageCount) {
    throw new Error(
      `Split part ${formatPageRangeLabel(range)} opened with ${actualPageCount} pages instead of ${expectedPageCount}`,
    );
  }
}

export async function splitPdfByPages(request: SplitByPagesRequest): Promise<SplitByPagesResult> {
  const sourceBytes = toUint8Array(request.inputBytes);
  const sourceDocument = await PDFDocument.load(sourceBytes);
  const sourcePageCount = sourceDocument.getPageCount();
  const plan = planSplit({
    totalPages: sourcePageCount,
    strategy: {
      type: "by-pages",
      pagesPerPart: request.pagesPerPart,
    },
  });

  if (plan.planningState !== "resolved" || plan.strategy.type !== "by-pages") {
    throw new Error("splitPdfByPages requires a resolved by-pages plan");
  }

  const parts: SplitByPagesOutputPart[] = [];

  for (const plannedPart of plan.parts) {
    const bytes = await extractPartBytes(sourceDocument, plannedPart.range);
    await validatePartBytes(bytes, plannedPart.pageCount, plannedPart.range);

    parts.push({
      ...plannedPart,
      filename: formatSplitFilename(request.documentName, plannedPart.partNumber, plannedPart.range),
      bytes,
    });
  }

  return {
    sourcePageCount,
    parts,
  };
}

