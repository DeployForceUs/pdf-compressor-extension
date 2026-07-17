import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { PDFDocument } from "pdf-lib";

const execFileAsync = promisify(execFile);

const CANDIDATES = [
  { id: "balanced-144-q65", dpi: 144, quality: 65, qFactor: 0.4 },
  { id: "balanced-180-q72", dpi: 180, quality: 72, qFactor: 0.3 },
  { id: "balanced-180-q78", dpi: 180, quality: 78, qFactor: 0.22 },
  { id: "balanced-220-q85", dpi: 220, quality: 85, qFactor: 0.15 },
];

function requirePdfPath(value) {
  if (!value || !value.toLowerCase().endsWith(".pdf")) {
    throw new Error("Usage: node scripts/benchmark-ghostscript-balanced.mjs INPUT.pdf OUTPUT_DIR");
  }
  return resolve(value);
}

async function inspectPdf(path) {
  const bytes = await readFile(path);
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
  });
  return { bytes: bytes.byteLength, pageCount: pdf.getPageCount() };
}

function ghostscriptArgs(inputPath, outputPath, { dpi, qFactor }) {
  return [
    "-q",
    "-dSAFER",
    "-dBATCH",
    "-dNOPAUSE",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    "-dDetectDuplicateImages=true",
    "-dCompressFonts=true",
    "-dSubsetFonts=true",
    "-dPassThroughJPEGImages=false",
    "-dAutoFilterColorImages=false",
    "-dColorImageFilter=/DCTEncode",
    "-dAutoFilterGrayImages=false",
    "-dGrayImageFilter=/DCTEncode",
    "-dDownsampleColorImages=true",
    "-dColorImageDownsampleType=/Bicubic",
    "-dColorImageDownsampleThreshold=1.0",
    `-dColorImageResolution=${dpi}`,
    "-dDownsampleGrayImages=true",
    "-dGrayImageDownsampleType=/Bicubic",
    "-dGrayImageDownsampleThreshold=1.0",
    `-dGrayImageResolution=${dpi}`,
    "-dDownsampleMonoImages=true",
    "-dMonoImageDownsampleType=/Subsample",
    "-dMonoImageResolution=300",
    `-sOutputFile=${outputPath}`,
    "-c",
    `<</ColorImageDict <</QFactor ${qFactor} /Blend 1 /ColorTransform 1>> /GrayImageDict <</QFactor ${qFactor} /Blend 1>>>> setdistillerparams`,
    "-f",
    inputPath,
  ];
}

async function main() {
  const inputPath = requirePdfPath(process.argv[2]);
  const outputDirectory = resolve(process.argv[3] ?? "reports/engine-benchmark");
  await mkdir(outputDirectory, { recursive: true });

  const input = await inspectPdf(inputPath);
  const { stdout: versionOutput } = await execFileAsync("gs", ["--version"]);
  const results = [];

  for (const candidate of CANDIDATES) {
    const outputPath = resolve(outputDirectory, `${candidate.id}.pdf`);
    const startedAt = performance.now();
    await execFileAsync("gs", ghostscriptArgs(inputPath, outputPath, candidate), {
      maxBuffer: 1024 * 1024,
    });
    const durationMs = Math.round(performance.now() - startedAt);
    const output = await inspectPdf(outputPath);

    results.push({
      ...candidate,
      durationMs,
      outputBytes: output.bytes,
      compressionRatio: Number((output.bytes / input.bytes).toFixed(4)),
      pageCountMatches: output.pageCount === input.pageCount,
      opens: true,
      outputFile: basename(outputPath),
    });
  }

  process.stdout.write(
    `${JSON.stringify({
      fixture: {
        file: basename(inputPath),
        bytes: input.bytes,
        pageCount: input.pageCount,
      },
      ghostscriptVersion: versionOutput.trim(),
      candidates: results,
      decisionStatus: "calibration_only_not_approved",
    }, null, 2)}\n`,
  );
}

await main();
