import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const popupPath = path.join(outputDir, "popup.html");
const manifestPath = path.join(outputDir, "manifest.json");
const officeHostPermission = "https://pdf-66-55-75-239.sslip.io/*";
const runtimeName = "ai-lab-contest-access.js";
const runtimePath = path.join(outputDir, runtimeName);

const secretDir = path.join(os.homedir(), ".pdf-compressor-license");
const proToken = (
  await readFile(path.join(secretDir, "ai-lab-pro-license.token"), "utf8")
).trim();

const officeToken = (
  await readFile(path.join(secretDir, "ai-lab-office-access-token"), "utf8")
).trim();

const officeSettings = {
  baseUrl: "https://pdf-66-55-75-239.sslip.io",
  accessToken: officeToken,
};

if (!proToken || !officeToken) {
  throw new Error("AI Lab contest tokens are missing or empty");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.host_permissions = [
  ...new Set([
    ...(manifest.host_permissions ?? []),
    officeHostPermission,
  ]),
];
await writeFile(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const runtime = `(() => {
  const officeSettings = ${JSON.stringify(officeSettings)};
  const proToken = ${JSON.stringify(proToken)};

  async function provision() {
    await chrome.storage.local.set({
      "office-engine-connection-v1": officeSettings
    });

    const current = await chrome.runtime.sendMessage({
      type: "license:check"
    }).catch(() => null);

    if (!current?.isPro) {
      const activated = await chrome.runtime.sendMessage({
        type: "license:activate",
        token: proToken
      });

      if (!activated?.ok || !activated?.isPro) {
        throw new Error("Automatic Pro activation failed");
      }
    }

    document.documentElement.dataset.aiLabAccessReady = "true";
  }

  provision().catch((error) => {
    document.documentElement.dataset.aiLabAccessReady = "false";
    console.error(
      "[AI Lab] Contest access provisioning failed",
      error instanceof Error ? error.message : "unknown error"
    );
  });
})();
`;

await writeFile(runtimePath, runtime, {
  encoding: "utf8",
  mode: 0o600,
});

let popup = await readFile(popupPath, "utf8");

if (!popup.includes("data-ai-lab-contest-access")) {
  popup = popup.replace(
    "</body>",
    `<script data-ai-lab-contest-access src="./${runtimeName}"></script></body>`
  );

  await writeFile(popupPath, popup, "utf8");
}

console.log("AI Lab contest access and Office host permission embedded");
