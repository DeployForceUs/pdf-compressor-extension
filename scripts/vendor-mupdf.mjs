import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDir = path.resolve(rootDir, "node_modules/mupdf/dist");
const targetDir = path.resolve(rootDir, "public/vendor/mupdf");

const files = ["mupdf.js", "mupdf-wasm.js", "mupdf-wasm.wasm"];

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await copyFile(path.resolve(sourceDir, file), path.resolve(targetDir, file));
}
