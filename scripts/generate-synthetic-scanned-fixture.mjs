import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { PDFDocument } from "pdf-lib";

const execFileAsync = promisify(execFile);
const PAGE_COUNT = 24;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function requireOutputPath(value) {
  if (!value) {
    throw new Error("Usage: node scripts/generate-synthetic-scanned-fixture.mjs OUTPUT.pdf");
  }
  if (!value.toLowerCase().endsWith(".pdf")) {
    throw new Error("Output path must end in .pdf");
  }
  return resolve(value);
}

async function generatePageImage(directory, pageNumber) {
  const outputPath = resolve(directory, `page-${String(pageNumber).padStart(3, "0")}.jpg`);
  const shade = 210 + (pageNumber % 30);
  const accent = 70 + (pageNumber * 17) % 120;

  await execFileAsync("convert", [
    "-size",
    "1700x2200",
    `gradient:rgb(${shade},${shade},${shade})-white`,
    "-colorspace",
    "sRGB",
    "-attenuate",
    "0.08",
    "+noise",
    "Gaussian",
    "-stroke",
    `rgb(${accent},${accent},${accent})`,
    "-strokewidth",
    "3",
    "-fill",
    "none",
    "-draw",
    "rectangle 120,140 1580,2060 line 160,420 1540,420 line 160,1780 1540,1780 line 320,520 320,1660 line 850,520 850,1660 line 1380,520 1380,1660",
    "-gravity",
    "north",
    "-fill",
    "#111111",
    "-stroke",
    "none",
    "-pointsize",
    "42",
    "-annotate",
    "+0+210",
    `Synthetic scanned benchmark — page ${pageNumber}`,
    "-gravity",
    "south",
    "-pointsize",
    "24",
    "-annotate",
    "+0+240",
    "Public synthetic fixture; contains no customer or document content",
    "-quality",
    "92",
    outputPath,
  ]);

  return outputPath;
}

async function main() {
  const outputPath = requireOutputPath(process.argv[2]);
  const directory = await mkdtemp(resolve(tmpdir(), "pdf-office-benchmark-"));

  try {
    const pdf = await PDFDocument.create();
    pdf.setTitle("Synthetic scanned benchmark fixture");
    pdf.setAuthor("PDF Compressor Extension benchmark harness");

    for (let pageNumber = 1; pageNumber <= PAGE_COUNT; pageNumber += 1) {
      const imagePath = await generatePageImage(directory, pageNumber);
      const image = await pdf.embedJpg(await readFile(imagePath));
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
      });
    }

    await writeFile(outputPath, await pdf.save({ useObjectStreams: false }));
    process.stdout.write(`${JSON.stringify({ outputPath, pageCount: PAGE_COUNT })}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await main();
