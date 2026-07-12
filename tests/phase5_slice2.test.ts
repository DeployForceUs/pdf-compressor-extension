import assert from "node:assert/strict";
import { parseAndValidatePageRanges, parsePageRangeExpression, validatePageRanges } from "../src/lib/pdf/page-range-parser";
import { planSplit } from "../src/lib/pdf/split-planner";

function assertErrorCode(run: () => void, code: string) {
  assert.throws(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

{
  const plan = planSplit({
    totalPages: 100,
    strategy: {
      type: "by-pages",
      pagesPerPart: 20,
    },
  });

  assert.equal(plan.planningState, "resolved");
  assert.equal(plan.parts.length, 5);
  assert.deepEqual(
    plan.parts.map((part) => part.range),
    [
      { startPage: 1, endPage: 20 },
      { startPage: 21, endPage: 40 },
      { startPage: 41, endPage: 60 },
      { startPage: 61, endPage: 80 },
      { startPage: 81, endPage: 100 },
    ],
  );
}

{
  const ranges = parsePageRangeExpression("14-30, 1-5, 13, 6-12");

  assert.deepEqual(ranges, [
    { startPage: 14, endPage: 30 },
    { startPage: 1, endPage: 5 },
    { startPage: 13, endPage: 13 },
    { startPage: 6, endPage: 12 },
  ]);

  const validated = parseAndValidatePageRanges("14-30, 1-5, 13, 6-12", 30);
  assert.deepEqual(validated, [
    { startPage: 1, endPage: 5 },
    { startPage: 6, endPage: 12 },
    { startPage: 13, endPage: 13 },
    { startPage: 14, endPage: 30 },
  ]);
}

assertErrorCode(() => parseAndValidatePageRanges("1-5, 5-10", 10), "OVERLAPPING_PAGE_RANGES");
assertErrorCode(() => parseAndValidatePageRanges("1, 1", 10), "DUPLICATE_PAGE");
assertErrorCode(() => parseAndValidatePageRanges("1-5,,6-10", 10), "INVALID_PAGE_RANGE");
assertErrorCode(() => parseAndValidatePageRanges("1-5,6-10,", 10), "INVALID_PAGE_RANGE");
assertErrorCode(() => validatePageRanges([{ startPage: 1, endPage: 11 }], 10), "PAGE_RANGE_OUT_OF_BOUNDS");

{
  const plan = planSplit({
    totalPages: 42,
    strategy: {
      type: "by-max-size",
      maxPartSizeBytes: 12_000_000,
    },
  });

  assert.equal(plan.planningState, "deferred");
  assert.equal(plan.strategy.type, "by-max-size");
  assert.equal(plan.parts.length, 0);
  assert.equal(plan.sizePlanning.supported, false);
  assert.equal(plan.sizePlanning.reason, "SIZE_PLANNING_DEFERRED");
}

console.log("phase5 slice 2 planner assertions passed");
