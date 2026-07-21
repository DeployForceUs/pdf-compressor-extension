import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtimePath = path.resolve(".output/chrome-mv3-ai-lab/ai-lab-pdf-link.js");
let source = await readFile(runtimePath, "utf8");

const oldFunction = `  async function requestOriginPermission(url) {
    const permissions = globalThis.chrome?.permissions;
    if (!permissions?.request) return true;
    const origin = new URL(url).origin + "/*";
    return await permissions.request({ origins: [origin] });
  }`;

const newFunction = `  async function requestOriginPermission(url) {
    const permissions = globalThis.chrome?.permissions;
    if (!permissions?.request) return true;

    const parsed = new URL(url);
    const origins = [parsed.origin + "/*"];
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "drive.google.com" || hostname === "www.drive.google.com") {
      origins.push("https://drive.usercontent.google.com/*");
    }

    return await permissions.request({ origins: [...new Set(origins)] });
  }`;

if (source.includes(oldFunction)) {
  source = source.replace(oldFunction, newFunction);
  await writeFile(runtimePath, source, "utf8");
}

const verified = await readFile(runtimePath, "utf8");
if (!verified.includes('origins.push("https://drive.usercontent.google.com/*")')) {
  throw new Error("AI Lab Google Drive redirect permission fix was not applied");
}

console.log("AI Lab Google Drive redirect permission verified");
