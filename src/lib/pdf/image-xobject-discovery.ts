type MuPdfModule = typeof import("mupdf");
type MuPdfNamespace = MuPdfModule["default"];
type MuPdfPdfDocument = InstanceType<MuPdfNamespace["PDFDocument"]>;
type MuPdfPdfObject = InstanceType<MuPdfNamespace["PDFObject"]>;
type MuPdfBuffer = InstanceType<MuPdfNamespace["Buffer"]>;

export type PdfImageXObjectCandidate = {
  pageNumber: number;
  objectReference: string;
  width: number | null;
  height: number | null;
  bitsPerComponent: number | null;
  colorspace: string | null;
  filterEncoding: string | null;
  estimatedStreamSize: number | null;
  sharedReferenceCount: number | null;
};

export type PdfImageXObjectDiscovery = {
  candidates: PdfImageXObjectCandidate[];
  pageCount: number;
  totalOccurrences: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNumber(obj: MuPdfPdfObject | null | undefined): number | null {
  if (!obj || obj.isNull() || !obj.isNumber()) {
    return null;
  }

  const value = obj.asNumber();
  return isFiniteNumber(value) ? value : null;
}

function describeObject(obj: MuPdfPdfObject | null | undefined): string | null {
  if (!obj || obj.isNull()) {
    return null;
  }

  try {
    return obj.toString(true, true);
  } catch {
    return null;
  }
}

function getRawStreamSize(stream: MuPdfPdfObject): number | null {
  if (!stream.isStream()) {
    return null;
  }

  let buffer: MuPdfBuffer | null = null;
  try {
    buffer = stream.readRawStream();
    return buffer.asUint8Array().byteLength;
  } catch {
    return null;
  } finally {
    buffer?.destroy();
  }
}

function resolveXObjectCandidate(xObject: MuPdfPdfObject) {
  const objectReference = xObject.isIndirect() ? xObject.toString(true, true) : null;
  const resolved = xObject.isIndirect() ? xObject.resolve() : xObject;

  return { objectReference, resolved };
}

function getOrCreateCandidate(
  candidatesByReference: Map<string, PdfImageXObjectCandidate>,
  pageNumber: number,
  objectReference: string,
  resolved: MuPdfPdfObject,
  sharedCount: number,
) {
  const existing = candidatesByReference.get(objectReference);
  if (existing) {
    existing.sharedReferenceCount = sharedCount;
    return existing;
  }

  const candidate: PdfImageXObjectCandidate = {
    pageNumber,
    objectReference,
    width: readNumber(resolved.get("Width")),
    height: readNumber(resolved.get("Height")),
    bitsPerComponent: readNumber(resolved.get("BitsPerComponent")),
    colorspace: describeObject(resolved.get("ColorSpace")),
    filterEncoding: describeObject(resolved.get("Filter")),
    estimatedStreamSize: readNumber(resolved.get("Length")) ?? getRawStreamSize(resolved),
    sharedReferenceCount: sharedCount,
  };

  candidatesByReference.set(objectReference, candidate);
  return candidate;
}

function walkXObjects(
  pageNumber: number,
  xObjectDict: MuPdfPdfObject,
  candidatesByReference: Map<string, PdfImageXObjectCandidate>,
  occurrenceCounts: Map<string, number>,
  currentStack: Set<string>,
) {
  if (!xObjectDict.isDictionary()) {
    return;
  }

  xObjectDict.forEach((value, resourceName) => {
    const { objectReference, resolved } = resolveXObjectCandidate(value);
    const stableReference = objectReference ?? `page:${pageNumber}:xobject:${String(resourceName)}`;
    const subtype = describeObject(resolved.get("Subtype"));

    if (subtype === "/Image" || subtype === "Image") {
      const nextCount = (occurrenceCounts.get(stableReference) ?? 0) + 1;
      occurrenceCounts.set(stableReference, nextCount);
      getOrCreateCandidate(candidatesByReference, pageNumber, stableReference, resolved, nextCount);
      return;
    }

    if (subtype !== "/Form" && subtype !== "Form") {
      return;
    }

    if (currentStack.has(stableReference)) {
      return;
    }

    currentStack.add(stableReference);
    try {
      const resources = resolved.get("Resources");
      if (!resources || resources.isNull()) {
        return;
      }

      const nestedXObjects = resources.get("XObject");
      if (!nestedXObjects || nestedXObjects.isNull()) {
        return;
      }

      walkXObjects(pageNumber, nestedXObjects, candidatesByReference, occurrenceCounts, currentStack);
    } finally {
      currentStack.delete(stableReference);
    }
  });
}

export function discoverImageXObjects(document: MuPdfPdfDocument): PdfImageXObjectDiscovery {
  const pageCount = document.countPages();
  const candidatesByReference = new Map<string, PdfImageXObjectCandidate>();
  const occurrenceCounts = new Map<string, number>();
  let totalOccurrences = 0;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.loadPage(pageIndex);
    try {
      const pageObject = page.getObject();
      try {
        const resources = pageObject.getInheritable("Resources");
        if (resources && !resources.isNull()) {
          const xObjects = resources.get("XObject");
          if (xObjects && !xObjects.isNull()) {
            walkXObjects(pageIndex + 1, xObjects, candidatesByReference, occurrenceCounts, new Set<string>());
          }
        }
      } finally {
        pageObject.destroy();
      }
    } finally {
      page.destroy();
    }
  }

  for (const [reference, count] of occurrenceCounts) {
    totalOccurrences += count;
    const candidate = candidatesByReference.get(reference);
    if (candidate) {
      candidate.sharedReferenceCount = count;
    }
  }

  return {
    candidates: [...candidatesByReference.values()],
    pageCount,
    totalOccurrences,
  };
}

export function formatImageXObjectDiagnostics(discovery: PdfImageXObjectDiscovery) {
  return {
    pageCount: discovery.pageCount,
    candidateCount: discovery.candidates.length,
    totalOccurrences: discovery.totalOccurrences,
    candidates: discovery.candidates.map((candidate) => ({
      pageNumber: candidate.pageNumber,
      objectReference: candidate.objectReference,
      width: candidate.width,
      height: candidate.height,
      bitsPerComponent: candidate.bitsPerComponent,
      colorspace: candidate.colorspace,
      filterEncoding: candidate.filterEncoding,
      estimatedStreamSize: candidate.estimatedStreamSize,
      sharedReferenceCount: candidate.sharedReferenceCount,
    })),
  };
}
