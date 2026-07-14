import { PDFDocument } from "pdf-lib";
import { unzipSync, zipSync } from "fflate";

export type ZipPdfPart = {
  filename: string;
  bytes: Uint8Array | ArrayBuffer;
};

export type ZipPdfArchiveResult = {
  zipBytes: Uint8Array;
  filenames: string[];
  entryCount: number;
};

export type ZipPdfArchiveErrorCode =
  | "EMPTY_PART_LIST"
  | "INVALID_PART"
  | "DUPLICATE_FILENAME"
  | "ZIP_CREATION_FAILED"
  | "ZIP_VALIDATION_FAILED";

export type ZipPdfArchiveErrorDetails = {
  filename?: string;
  index?: number;
  entryCount?: number;
};

export class ZipPdfArchiveError extends Error {
  readonly code: ZipPdfArchiveErrorCode;
  readonly details: ZipPdfArchiveErrorDetails;

  constructor(code: ZipPdfArchiveErrorCode, message: string, details: ZipPdfArchiveErrorDetails = {}) {
    super(message);
    this.name = "ZipPdfArchiveError";
    this.code = code;
    this.details = details;
  }
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

async function validatePdfPart(part: ZipPdfPart, index: number) {
  if (!part || typeof part !== "object") {
    throw new ZipPdfArchiveError("INVALID_PART", "ZIP part input must be an object", { index });
  }

  const filename = (part.filename ?? "").trim();
  if (!filename) {
    throw new ZipPdfArchiveError("INVALID_PART", "ZIP part filename must be a non-empty string", { index });
  }

  const bytes = toUint8Array(part.bytes);
  if (bytes.byteLength === 0) {
    throw new ZipPdfArchiveError("INVALID_PART", "ZIP part bytes must not be empty", { index, filename });
  }

  try {
    await PDFDocument.load(bytes);
  } catch (error) {
    throw new ZipPdfArchiveError(
      "INVALID_PART",
      `ZIP part ${filename} is not a valid PDF`,
      {
        index,
        filename,
      },
    );
  }

  return {
    filename,
    bytes,
  };
}

function validateZipBytes(zipBytes: Uint8Array, expectedFilenames: string[]) {
  if (zipBytes.byteLength === 0) {
    throw new ZipPdfArchiveError("ZIP_VALIDATION_FAILED", "ZIP output is empty", {
      entryCount: expectedFilenames.length,
    });
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes);
  } catch (error) {
    throw new ZipPdfArchiveError("ZIP_VALIDATION_FAILED", "ZIP output could not be reopened", {
      entryCount: expectedFilenames.length,
    });
  }

  const actualFilenames = Object.keys(entries);
  if (actualFilenames.length !== expectedFilenames.length) {
    throw new ZipPdfArchiveError("ZIP_VALIDATION_FAILED", "ZIP entry count did not match input count", {
      entryCount: expectedFilenames.length,
    });
  }

  for (let index = 0; index < expectedFilenames.length; index += 1) {
    if (actualFilenames[index] !== expectedFilenames[index]) {
      throw new ZipPdfArchiveError("ZIP_VALIDATION_FAILED", "ZIP entry order or filenames were not preserved", {
        entryCount: expectedFilenames.length,
      });
    }

    const entryBytes = entries[actualFilenames[index]];
    if (!entryBytes || entryBytes.byteLength === 0) {
      throw new ZipPdfArchiveError("ZIP_VALIDATION_FAILED", "ZIP entry bytes were empty", {
        entryCount: expectedFilenames.length,
      });
    }
  }
}

export async function zipPdfParts(parts: ZipPdfPart[]): Promise<ZipPdfArchiveResult> {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new ZipPdfArchiveError("EMPTY_PART_LIST", "At least one PDF part is required");
  }

  const validatedParts: Array<{ filename: string; bytes: Uint8Array }> = [];
  const filenames = new Set<string>();

  for (let index = 0; index < parts.length; index += 1) {
    const validated = await validatePdfPart(parts[index], index);
    if (filenames.has(validated.filename)) {
      throw new ZipPdfArchiveError("DUPLICATE_FILENAME", `Duplicate ZIP filename: ${validated.filename}`, {
        index,
        filename: validated.filename,
      });
    }

    filenames.add(validated.filename);
    validatedParts.push(validated);
  }

  try {
    const zipInput = Object.fromEntries(
      validatedParts.map((part) => [part.filename, part.bytes] as const),
    ) as Record<string, Uint8Array>;
    const zipBytes = zipSync(zipInput, {
      level: 6,
    });

    validateZipBytes(zipBytes, validatedParts.map((part) => part.filename));

    return {
      zipBytes,
      filenames: validatedParts.map((part) => part.filename),
      entryCount: validatedParts.length,
    };
  } catch (error) {
    if (error instanceof ZipPdfArchiveError) {
      throw error;
    }

    throw new ZipPdfArchiveError("ZIP_CREATION_FAILED", error instanceof Error ? error.message : "ZIP creation failed");
  }
}

