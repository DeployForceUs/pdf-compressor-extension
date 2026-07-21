type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfPage = InstanceType<MuPdfNamespace["Page"]>;
type MuPdfImage = InstanceType<MuPdfNamespace["Image"]>;
type MuPdfMatrix = readonly number[];

export type ContentBlindPageObservation = {
  pageNumber: number;
  classification: "scanned" | "vector" | "text";
  estimatedDpi: number | null;
  imagePlacementCount: number;
  dominantImageCoverageRatio: number | null;
};

function placementSizePoints(ctm: MuPdfMatrix) {
  const [a = 0, b = 0, c = 0, d = 0] = ctm;
  return {
    width: Math.hypot(a, b),
    height: Math.hypot(c, d),
  };
}

function pageSizePoints(bounds: readonly number[]) {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = bounds;
  return {
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function observeContentBlindPage(
  mupdf: MuPdfNamespace,
  page: MuPdfPage,
  pageNumber: number,
): ContentBlindPageObservation {
  const pageSize = pageSizePoints(page.getBounds());
  const pageArea = pageSize.width * pageSize.height;
  let hasText = false;
  let hasVector = false;
  let imagePlacementCount = 0;
  let dominantImageCoverageRatio: number | null = null;
  let dominantImageDpi: number | null = null;

  const recordImage = (image: MuPdfImage, ctm: MuPdfMatrix) => {
    imagePlacementCount += 1;
    const placement = placementSizePoints(ctm);
    if (!finitePositive(pageArea) || !finitePositive(placement.width) || !finitePositive(placement.height)) return;

    const coverage = Math.min(1, (placement.width * placement.height) / pageArea);
    if (dominantImageCoverageRatio !== null && coverage <= dominantImageCoverageRatio) return;

    dominantImageCoverageRatio = coverage;
    const widthPx = image.getWidth();
    const heightPx = image.getHeight();
    if (!finitePositive(widthPx) || !finitePositive(heightPx)) {
      dominantImageDpi = null;
      return;
    }

    const dpiX = widthPx / (placement.width / 72);
    const dpiY = heightPx / (placement.height / 72);
    dominantImageDpi = finitePositive(dpiX) && finitePositive(dpiY) ? Math.min(dpiX, dpiY) : null;
  };

  const device = new mupdf.Device({
    fillText: () => { hasText = true; },
    strokeText: () => { hasText = true; },
    clipText: () => { hasText = true; },
    clipStrokeText: () => { hasText = true; },
    ignoreText: () => { hasText = true; },
    fillPath: () => { hasVector = true; },
    strokePath: () => { hasVector = true; },
    clipPath: () => { hasVector = true; },
    clipStrokePath: () => { hasVector = true; },
    fillShade: () => { hasVector = true; },
    fillImage: recordImage,
    fillImageMask: recordImage,
  });

  try {
    page.runPageContents(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }

  const dominantFullPageImage = dominantImageCoverageRatio !== null && dominantImageCoverageRatio >= 0.9;
  const classification = dominantFullPageImage && !hasText && !hasVector
    ? "scanned"
    : hasText
      ? "text"
      : "vector";

  return {
    pageNumber,
    classification,
    estimatedDpi: dominantFullPageImage ? dominantImageDpi : null,
    imagePlacementCount,
    dominantImageCoverageRatio,
  };
}
