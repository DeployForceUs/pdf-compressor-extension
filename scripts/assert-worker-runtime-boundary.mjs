import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const assetsDirectory = new URL("../.output/chrome-mv3/assets/", import.meta.url);
const workerFiles = (await readdir(assetsDirectory)).filter(
  (fileName) => fileName.startsWith("worker-") && fileName.endsWith(".js"),
);

if (workerFiles.length !== 1) {
  throw new Error(`Expected exactly one generated Worker asset, found ${workerFiles.length}`);
}

const workerPath = join(assetsDirectory.pathname, workerFiles[0]);
const workerSource = await readFile(workerPath, "utf8");
const forbiddenGuard = "This script should only be loaded in a browser extension.";

if (workerSource.includes(forbiddenGuard)) {
  throw new Error("Generated Worker asset contains the webextension-polyfill extension-page guard");
}

if (!workerSource.includes("worker-entry")) {
  throw new Error("Generated Worker asset is missing the PDF Split worker-entry trace boundary");
}

console.log(`Worker runtime boundary is browser-safe: ${workerFiles[0]}`);
