import assert from "node:assert/strict";
import test from "node:test";
import { observeContentBlindPage } from "../src/lib/ai/content-blind-page-observer";

class FakeDevice {
  callbacks: Record<string, (...args: any[]) => void>;
  constructor(callbacks: Record<string, (...args: any[]) => void>) {
    this.callbacks = callbacks;
  }
  close() {}
}

const fakeMuPdf = {
  Device: FakeDevice,
  Matrix: { identity: [1, 0, 0, 1, 0, 0] },
} as any;

function fakeImage(width: number, height: number) {
  return {
    getWidth: () => width,
    getHeight: () => height,
  };
}

function fakePage(run: (callbacks: Record<string, (...args: any[]) => void>) => void) {
  return {
    getBounds: () => [0, 0, 612, 792],
    runPageContents: (device: FakeDevice) => run(device.callbacks),
  } as any;
}

test("classifies a confirmed full-page image as scanned and derives placed DPI", () => {
  const page = fakePage((callbacks) => {
    callbacks.fillImage?.(fakeImage(2550, 3300), [612, 0, 0, 792, 0, 0], 1);
  });

  const result = observeContentBlindPage(fakeMuPdf, page, 1);
  assert.equal(result.classification, "scanned");
  assert.equal(result.estimatedDpi, 300);
  assert.equal(result.imagePlacementCount, 1);
  assert.equal(result.dominantImageCoverageRatio, 1);
});

test("does not claim DPI for a partial-page image", () => {
  const page = fakePage((callbacks) => {
    callbacks.fillImage?.(fakeImage(1200, 1200), [200, 0, 0, 200, 0, 0], 1);
  });

  const result = observeContentBlindPage(fakeMuPdf, page, 1);
  assert.equal(result.classification, "vector");
  assert.equal(result.estimatedDpi, null);
  assert.ok((result.dominantImageCoverageRatio ?? 0) < 0.9);
});

test("text drawing operations take precedence over a full-page image", () => {
  const page = fakePage((callbacks) => {
    callbacks.fillImage?.(fakeImage(2550, 3300), [612, 0, 0, 792, 0, 0], 1);
    callbacks.fillText?.({}, [1, 0, 0, 1, 0, 0], null, [], 1);
  });

  const result = observeContentBlindPage(fakeMuPdf, page, 1);
  assert.equal(result.classification, "text");
  assert.equal(result.estimatedDpi, 300);
});
