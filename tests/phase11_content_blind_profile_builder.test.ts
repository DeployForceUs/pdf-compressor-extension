import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentBlindDocumentProfile,
  ContentBlindProfileCancelledError,
  type ContentBlindProfileSource,
} from "../src/lib/ai/content-blind-profile-builder";

const source: ContentBlindProfileSource = {
  fileSizeBytes: 1_500,
  pageCount: 5,
  pages: [
    {
      pageNumber: 1,
      classification: "scanned",
      estimatedSizeBytes: 500,
      estimatedDpi: 120,
      imageObjectCount: 2,
      codecCounts: { jpeg: 2, jpx: 0, other: 0 },
    },
    {
      pageNumber: 2,
      classification: "text",
      estimatedSizeBytes: 100,
      estimatedDpi: null,
      imageObjectCount: 0,
      codecCounts: { jpeg: 0, jpx: 0, other: 0 },
    },
    {
      pageNumber: 3,
      classification: "scanned",
      estimatedSizeBytes: 400,
      estimatedDpi: 200,
      imageObjectCount: 1,
      codecCounts: { jpeg: 0, jpx: 1, other: 0 },
    },
    {
      pageNumber: 4,
      classification: "vector",
      estimatedSizeBytes: 200,
      estimatedDpi: null,
      imageObjectCount: 1,
      codecCounts: { jpeg: 0, jpx: 0, other: 1 },
    },
    {
      pageNumber: 5,
      classification: "scanned",
      estimatedSizeBytes: 300,
      estimatedDpi: 400,
      imageObjectCount: 3,
      codecCounts: { jpeg: 2, jpx: 0, other: 1 },
    },
  ],
};

test("aggregates only approved content-blind metrics", async () => {
  const profile = await buildContentBlindDocumentProfile(source);

  assert.deepEqual(profile, {
    fileSizeBytes: 1_500,
    pageCount: 5,
    imageObjectCount: 7,
    scannedPageRatio: 0.6,
    vectorPageRatio: 0.2,
    textPageRatio: 0.2,
    estimatedDpiBuckets: { under150: 0.2, "150to300": 0.2, over300: 0.2 },
    codecCounts: { jpeg: 4, jpx: 1, other: 2 },
    pageSizeDistributionBytes: { p50: 300, p90: 500, max: 500 },
  });
  assert.deepEqual(Object.keys(profile).sort(), [
    "codecCounts",
    "estimatedDpiBuckets",
    "fileSizeBytes",
    "imageObjectCount",
    "pageCount",
    "pageSizeDistributionBytes",
    "scannedPageRatio",
    "textPageRatio",
    "vectorPageRatio",
  ]);
});

test("rejects content, metadata, and unknown structural fields", async () => {
  await assert.rejects(
    buildContentBlindDocumentProfile({ ...source, filename: "secret.pdf" }),
    /\$\.filename: unknown field/,
  );
  await assert.rejects(
    buildContentBlindDocumentProfile({
      ...source,
      pages: [{ ...source.pages[0], extractedText: "secret" }, ...source.pages.slice(1)],
    }),
    /\$\.pages\[0\]\.extractedText: unknown field/,
  );
  await assert.rejects(
    buildContentBlindDocumentProfile({
      ...source,
      pages: [{ ...source.pages[0], codecCounts: { ...source.pages[0].codecCounts, imageBytes: 5 } }, ...source.pages.slice(1)],
    }),
    /\$\.pages\[0\]\.codecCounts\.imageBytes: unknown field/,
  );
});

test("requires one unique, contiguous observation per page", async () => {
  await assert.rejects(
    buildContentBlindDocumentProfile({ ...source, pages: source.pages.slice(0, 4) }),
    /expected exactly one observation per page/,
  );
  await assert.rejects(
    buildContentBlindDocumentProfile({
      ...source,
      pages: source.pages.map((page, index) => index === 4 ? { ...page, pageNumber: 4 } : page),
    }),
    /duplicate page number/,
  );
});

test("supports cancellation without returning a partial profile", async () => {
  let checks = 0;
  await assert.rejects(
    buildContentBlindDocumentProfile(source, {
      isCancelled: () => {
        checks += 1;
        return checks === 3;
      },
    }),
    ContentBlindProfileCancelledError,
  );
});
