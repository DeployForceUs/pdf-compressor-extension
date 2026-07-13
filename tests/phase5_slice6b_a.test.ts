import assert from "node:assert/strict";
import { buildSplitRequestFromForm, splitProgressSummary, splitWarningLabel } from "../src/entrypoints/popup/split-ui";
import { usePopupStore } from "../src/entrypoints/popup/store";

{
  const split = usePopupStore.getState().split;
  assert.equal(split.status, "idle");
  assert.equal(split.strategy, "by-pages");
  assert.equal(split.pagesPerPart, "20");
  assert.equal(split.maxPartSizeMb, "10");
  assert.equal(split.manualRanges, "");
  assert.equal(split.compressAfter, false);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "by-pages",
    pagesPerPart: "12",
    maxPartSizeMb: "10",
    manualRanges: "",
    compressAfter: true,
  });

  assert.ok("type" in request);
  assert.equal(request.type, "split:local");
  assert.equal(request.strategy.type, "by-pages");
  assert.equal(request.strategy.pagesPerPart, 12);
  assert.equal(request.compressAfter, true);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "by-max-size",
    pagesPerPart: "12",
    maxPartSizeMb: "2.5",
    manualRanges: "",
    compressAfter: false,
  });

  assert.ok("type" in request);
  assert.equal(request.strategy.type, "by-max-size");
  assert.equal(request.strategy.maxPartSizeBytes, Math.round(2.5 * 1024 * 1024));
  assert.equal(request.compressAfter, undefined);
}

{
  const request = buildSplitRequestFromForm({
    strategy: "manual-ranges",
    pagesPerPart: "12",
    maxPartSizeMb: "10",
    manualRanges: "1-5,8,10-15",
    compressAfter: false,
  });

  assert.ok("type" in request);
  assert.equal(request.strategy.type, "manual-ranges");
  assert.equal(request.strategy.ranges, "1-5,8,10-15");
}

{
  assert.equal(
    buildSplitRequestFromForm({
      strategy: "by-pages",
      pagesPerPart: "0",
      maxPartSizeMb: "10",
      manualRanges: "",
      compressAfter: false,
    }).issue,
    "INVALID_PAGES_PER_PART",
  );

  assert.equal(
    buildSplitRequestFromForm({
      strategy: "by-max-size",
      pagesPerPart: "10",
      maxPartSizeMb: "abc",
      manualRanges: "",
      compressAfter: false,
    }).issue,
    "INVALID_MAX_PART_SIZE",
  );

  assert.equal(
    buildSplitRequestFromForm({
      strategy: "manual-ranges",
      pagesPerPart: "10",
      maxPartSizeMb: "10",
      manualRanges: "   ",
      compressAfter: false,
    }).issue,
    "INVALID_PAGE_RANGE",
  );
}

{
  const summary = splitProgressSummary({
    type: "split:progress",
    recordId: "split",
    stage: "compressing-part",
    progress: 42,
    partsCount: 3,
    currentPart: 2,
    message: "Compressing part 2 of 3",
    sourceByteSize: 2048,
    compressedCandidateByteSize: 1024,
    selectedByteSize: 1024,
    fallbackUsed: false,
  });

  assert.equal(summary.parts, "2 of 3");
  assert.ok(summary.detail.includes("source 2048 bytes"));
  assert.ok(summary.detail.includes("candidate 1024 bytes"));
  assert.ok(summary.detail.includes("selected 1024 bytes"));
}

{
  assert.equal(
    splitWarningLabel({
      code: "COMPRESSION_FAILED_FALLBACK",
      fileName: "example_part_001_pages_1-2.pdf",
      partNumber: 1,
      sourceByteSize: 1024,
      selectedByteSize: 1024,
      fallbackUsed: true,
    }),
    "example_part_001_pages_1-2.pdf fell back after compression failed",
  );
}

console.log("phase5 slice 6b-a popup split ui assertions passed");
