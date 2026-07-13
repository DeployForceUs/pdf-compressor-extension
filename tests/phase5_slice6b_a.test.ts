import assert from "node:assert/strict";
import en from "../src/locales/en/translation.json";
import es from "../src/locales/es/translation.json";
import {
  assertDownloadableSplitArtifactBytes,
  buildSplitArtifactRender,
  buildSplitOutputModeOptions,
  buildSplitRequestFromForm,
  formatSplitProgressDisplay,
  formatSplitWarning,
  parseStrictPositiveDecimal,
  parseStrictPositiveInteger,
} from "../src/entrypoints/popup/split-ui";
import { normalizeSplitSnapshot, usePopupStore } from "../src/entrypoints/popup/store";

function makeT(dictionary: Record<string, unknown>) {
  return (key: string, options: Record<string, unknown> = {}) => {
    const parts = key.split(".");
    let value: unknown = dictionary;

    for (const part of parts) {
      if (typeof value !== "object" || value === null || !(part in value)) {
        throw new Error(`Missing translation key: ${key}`);
      }

      value = (value as Record<string, unknown>)[part];
    }

    if (typeof value !== "string") {
      throw new Error(`Translation key is not a string: ${key}`);
    }

    return value.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => String(options[token] ?? ""));
  };
}

const tEn = makeT(en as Record<string, unknown>);
const tEs = makeT(es as Record<string, unknown>);
const formatBytes = (value: number) => `${value} B`;

{
  const normalized = normalizeSplitSnapshot(undefined);
  assert.equal(normalized.outputMode, "single-zip");
  assert.deepEqual(normalized.artifacts, []);
  assert.deepEqual(normalized.warnings, []);
}

{
  const legacySnapshot = normalizeSplitSnapshot({
    ...usePopupStore.getState().split,
    status: "complete",
    outputMode: "single-zip",
    artifacts: [
      {
        id: "legacy-artifact",
        bundleId: "legacy-bundle",
        kind: "zip",
        filename: "legacy.zip",
        mimeType: "application/zip",
        byteLength: 1,
        status: "complete",
      },
    ],
    warnings: [
      {
        code: "COMPRESSION_FAILED_FALLBACK",
        partNumber: 1,
        fileName: "legacy.pdf",
        sourceByteSize: 10,
        selectedByteSize: 10,
        fallbackUsed: true,
      },
    ],
  });

  assert.equal(legacySnapshot.outputMode, "single-zip");
  assert.equal(legacySnapshot.artifacts.length, 1);
  assert.equal(legacySnapshot.warnings.length, 1);
}

{
  const bundleSnapshot = normalizeSplitSnapshot({
    ...usePopupStore.getState().split,
    status: "complete",
    outputMode: "individual-pdfs",
    artifacts: [
      {
        id: "bundle-artifact-1",
        bundleId: "bundle",
        kind: "pdf",
        filename: "part_001.pdf",
        mimeType: "application/pdf",
        byteLength: 1,
        status: "complete",
      },
      {
        id: "bundle-artifact-2",
        bundleId: "bundle",
        kind: "pdf",
        filename: "part_002.pdf",
        mimeType: "application/pdf",
        byteLength: 1,
        status: "complete",
      },
    ],
    warnings: [],
  });

  assert.equal(bundleSnapshot.outputMode, "individual-pdfs");
  assert.equal(bundleSnapshot.artifacts.length, 2);
  assert.deepEqual(
    bundleSnapshot.artifacts.map((artifact) => artifact.filename),
    ["part_001.pdf", "part_002.pdf"],
  );
}

{
  const options = buildSplitOutputModeOptions({
    t: tEn,
    formatBytes,
  });

  assert.deepEqual(
    options.map((option) => option.value),
    ["single-zip", "individual-pdfs", "separate-zips"],
  );
  assert.equal(options[0].label, "One ZIP");
  assert.equal(options[1].description, "Download each split PDF separately");
  assert.equal(options[2].label, "Separate ZIPs");
}

{
  const rendered = buildSplitArtifactRender(
    {
      id: "artifact-1",
      bundleId: "bundle-1",
      kind: "pdf",
      filename: "part.pdf",
      mimeType: "application/pdf",
      byteLength: 1234,
      partNumber: 1,
      pageStart: 1,
      pageEnd: 2,
      status: "complete",
    },
    {
      t: tEs,
      formatBytes,
    },
  );

  assert.equal(rendered.kind, "PDF");
  assert.equal(rendered.size, "1234 B");
  assert.equal(rendered.pageRange, "Páginas 1-2");
  assert.equal(rendered.downloadLabel, "Descargar");
}

{
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%test\n%%EOF\n").buffer;
  const zipBytes = new TextEncoder().encode("PK\u0003\u0004").buffer;

  assert.equal(
    assertDownloadableSplitArtifactBytes(
      {
        kind: "pdf",
        filename: "part.pdf",
      },
      pdfBytes,
    ),
    pdfBytes,
  );

  assert.equal(
    assertDownloadableSplitArtifactBytes(
      {
        kind: "zip",
        filename: "part.zip",
      },
      zipBytes,
    ),
    zipBytes,
  );
}

{
  const split = usePopupStore.getState().split;
  assert.equal(split.status, "idle");
  assert.equal(split.strategy, "by-pages");
  assert.equal(split.outputMode, "single-zip");
  assert.equal(split.pagesPerPart, "20");
  assert.equal(split.maxPartSizeMb, "10");
  assert.equal(split.manualRanges, "");
  assert.equal(split.compressAfter, false);
  assert.equal(split.currentPart, null);
  assert.equal(split.partsCount, null);
  assert.equal(split.progressMessage, "");
}

{
  assert.equal(parseStrictPositiveInteger("1"), 1);
  assert.equal(parseStrictPositiveInteger("20"), 20);
  assert.equal(parseStrictPositiveInteger("20abc"), null);
  assert.equal(parseStrictPositiveInteger(" 20"), null);
  assert.equal(parseStrictPositiveInteger("20 "), null);
  assert.equal(parseStrictPositiveInteger("0"), null);
  assert.equal(parseStrictPositiveInteger("-1"), null);
  assert.equal(parseStrictPositiveInteger("1.5"), null);
  assert.equal(parseStrictPositiveInteger(""), null);
}

{
  assert.equal(parseStrictPositiveDecimal("1"), 1);
  assert.equal(parseStrictPositiveDecimal("1.5"), 1.5);
  assert.equal(parseStrictPositiveDecimal("10mb"), null);
  assert.equal(parseStrictPositiveDecimal("1.5xyz"), null);
  assert.equal(parseStrictPositiveDecimal("0"), null);
  assert.equal(parseStrictPositiveDecimal("0.0"), null);
  assert.equal(parseStrictPositiveDecimal("-1"), null);
  assert.equal(parseStrictPositiveDecimal("Infinity"), null);
  assert.equal(parseStrictPositiveDecimal(""), null);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "by-pages",
    outputMode: "single-zip",
    pagesPerPart: "12",
    maxPartSizeMb: "10",
    manualRanges: "",
    compressAfter: true,
  });

  assert.ok("type" in request);
  assert.equal(request.type, "split:local");
  assert.equal(request.strategy.type, "by-pages");
  assert.equal(request.outputMode, "single-zip");
  assert.equal(request.strategy.pagesPerPart, 12);
  assert.equal(request.compressAfter, true);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "by-max-size",
    outputMode: "individual-pdfs",
    pagesPerPart: "12",
    maxPartSizeMb: "2.5",
    manualRanges: "",
    compressAfter: false,
  });

  assert.ok("type" in request);
  assert.equal(request.strategy.type, "by-max-size");
  assert.equal(request.outputMode, "individual-pdfs");
  assert.equal(request.strategy.maxPartSizeBytes, Math.round(2.5 * 1024 * 1024));
  assert.equal(request.compressAfter, undefined);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "manual-ranges",
    outputMode: "separate-zips",
    pagesPerPart: "12",
    maxPartSizeMb: "10",
    manualRanges: "1-5,8,10-15",
    compressAfter: false,
  });

  assert.ok("type" in request);
  assert.equal(request.strategy.type, "manual-ranges");
  assert.equal(request.outputMode, "separate-zips");
  assert.equal(request.strategy.ranges, "1-5,8,10-15");
}

{
  assert.equal(
    buildSplitRequestFromForm({
      strategy: "by-pages",
      outputMode: "single-zip",
      pagesPerPart: "20abc",
      maxPartSizeMb: "10",
      manualRanges: "",
      compressAfter: false,
    }).issue,
    "INVALID_PAGES_PER_PART",
  );

  assert.equal(
    buildSplitRequestFromForm({
      strategy: "by-max-size",
      outputMode: "single-zip",
      pagesPerPart: "10",
      maxPartSizeMb: "10mb",
      manualRanges: "",
      compressAfter: false,
    }).issue,
    "INVALID_MAX_PART_SIZE",
  );

  assert.equal(
    buildSplitRequestFromForm({
      strategy: "by-max-size",
      outputMode: "single-zip",
      pagesPerPart: "10",
      maxPartSizeMb: "0",
      manualRanges: "",
      compressAfter: false,
    }).issue,
    "INVALID_MAX_PART_SIZE",
  );

  assert.equal(
    buildSplitRequestFromForm({
      strategy: "manual-ranges",
      outputMode: "single-zip",
      pagesPerPart: "10",
      maxPartSizeMb: "10",
      manualRanges: "   ",
      compressAfter: false,
    }).issue,
    "INVALID_PAGE_RANGE",
  );
}

{
  usePopupStore.setState({
    split: {
      ...usePopupStore.getState().split,
      status: "running",
      progress: 42,
      stage: "creating-part",
      error: "",
      recordId: "split",
      currentPart: 2,
      partsCount: 7,
      progressMessage: "Creating part 2 of 7",
      sourceByteSize: 2048,
      compressedCandidateByteSize: 1024,
      selectedByteSize: 1024,
      fallbackUsed: false,
    },
  });

  const split = usePopupStore.getState().split;
  assert.equal(split.currentPart, 2);
  assert.equal(split.partsCount, 7);
  assert.notEqual(split.currentPart, split.partsCount);

  const display = formatSplitProgressDisplay(split, {
    t: tEn,
    formatBytes,
  });

  assert.equal(display.label, "Creating part 2 of 7");
  assert.ok(display.detail.includes("Source 2048 B"));
  assert.ok(display.detail.includes("Candidate 1024 B"));
  assert.ok(display.detail.includes("Selected 1024 B"));
  assert.ok(display.detail.includes("No fallback"));
}

{
  const display = formatSplitProgressDisplay(
    {
      stage: "compressing-part",
      progress: 42,
      message: "Compressing part 2 of 7",
      currentPart: 2,
      partsCount: 7,
      sourceByteSize: 2048,
      compressedCandidateByteSize: 1024,
      selectedByteSize: 1024,
      fallbackUsed: true,
    },
    {
      t: tEs,
      formatBytes,
    },
  );

  assert.equal(display.label, "Comprimiendo parte 2 de 7");
  assert.ok(display.detail.includes("Origen 2048 B"));
  assert.ok(display.detail.includes("Candidato 1024 B"));
  assert.ok(display.detail.includes("Seleccionado 1024 B"));
  assert.ok(display.detail.includes("Se usó alternativa"));
}

{
  const warning = formatSplitWarning(
    {
      code: "COMPRESSION_FAILED_FALLBACK",
      fileName: "example_part_001_pages_1-2.pdf",
      partNumber: 1,
      sourceByteSize: 1024,
      selectedByteSize: 1024,
      fallbackUsed: true,
    },
    {
      t: tEs,
      formatBytes,
    },
  );

  assert.equal(warning.title, "La compresión falló, se usa la parte original");
  assert.ok(warning.detail.includes("example_part_001_pages_1-2.pdf"));
  assert.ok(warning.detail.includes("Origen 1024 B"));
  assert.ok(warning.detail.includes("seleccionado 1024 B"));
  assert.ok(warning.detail.includes("candidato n/d"));
}

console.log("phase5 slice 6b-a popup split ui assertions passed");
