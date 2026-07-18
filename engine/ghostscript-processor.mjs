import { execFile, execFileSync, spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import { BALANCED_PROCESSING_POLICY } from "./processing-config.mjs";

const execFileAsync = promisify(execFile);

export function detectGhostscriptVersion() {
  try {
    return execFileSync("gs", ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    }).trim();
  } catch {
    return null;
  }
}

export async function inspectPdf(path) {
  const { stdout } = await execFileAsync("pdfinfo", [path], {
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  });
  const pages = /^Pages:\s+(\d+)\s*$/m.exec(stdout);
  const pageCount = pages ? Number(pages[1]) : 0;
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error("PDF page count is unavailable");
  }
  return { pageCount };
}

function balancedArguments(inputPath, outputPath) {
  const { dpi } = BALANCED_PROCESSING_POLICY;
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
    "<</ColorImageDict <</QFactor 0.4 /Blend 1 /ColorTransform 1>> /GrayImageDict <</QFactor 0.4>>>> setdistillerparams",
    "-f",
    inputPath,
  ];
}

export function processBalancedPdf({ inputPath, outputPath, signal, maxOutputBytes }) {
  return new Promise((resolve, reject) => {
    const child = spawn("gs", balancedArguments(inputPath, outputPath), {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrBytes = 0;
    let outputTooLarge = false;
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > 256 * 1024) child.kill("SIGKILL");
    });

    let killTimer;
    const abort = () => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      killTimer.unref?.();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const outputMonitor = Number.isSafeInteger(maxOutputBytes)
      ? setInterval(async () => {
          try {
            if ((await stat(outputPath)).size > maxOutputBytes) {
              outputTooLarge = true;
              child.kill("SIGKILL");
            }
          } catch {
            // The output does not exist yet.
          }
        }, 250)
      : undefined;
    outputMonitor?.unref?.();

    let settled = false;
    const cleanup = () => {
      clearTimeout(killTimer);
      clearInterval(outputMonitor);
      signal?.removeEventListener("abort", abort);
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    child.once("close", (code, exitSignal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outputTooLarge) {
        reject(new Error("Ghostscript output exceeded the configured limit"));
      } else if (signal?.aborted) {
        reject(new DOMException("Processing aborted", "AbortError"));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Ghostscript exited unsuccessfully (${code ?? exitSignal})`));
      }
    });
  });
}
