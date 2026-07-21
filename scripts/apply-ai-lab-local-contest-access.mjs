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

const visualStyle = `<style data-ai-lab-download-visuals>
.hero__icon {
  color: #ffffff !important;
  background: #ff1744 !important;
  border-color: #ff5b75 !important;
  box-shadow: 0 0 0 1px rgba(255, 23, 68, 0.34), 0 10px 26px rgba(255, 23, 68, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.34) !important;
  opacity: 1 !important;
}
.hero__icon svg,
.hero__icon svg * {
  color: #ffffff !important;
  opacity: 1 !important;
}
[data-ai-action^="download"],
.ai-lab-download-action {
  color: #041204 !important;
  background: linear-gradient(135deg, #c6ff00 0%, #39ff14 48%, #00f56a 100%) !important;
  border-color: #caff3d !important;
  box-shadow: 0 0 0 1px rgba(198, 255, 0, 0.46), 0 0 24px rgba(57, 255, 20, 0.44), 0 12px 30px rgba(0, 245, 106, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.64) !important;
  font-weight: 900 !important;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.34) !important;
}
[data-ai-action^="download"]:hover:not(:disabled),
.ai-lab-download-action:hover:not(:disabled) {
  filter: brightness(1.08) saturate(1.16);
}
</style>`;

if (!popup.includes("data-ai-lab-download-visuals")) {
  popup = popup.replace("</head>", `${visualStyle}</head>`);
}

if (!popup.includes("data-ai-lab-contest-access")) {
  popup = popup.replace(
    "</body>",
    `<script data-ai-lab-contest-access src="./${runtimeName}"></script></body>`
  );
}

await writeFile(popupPath, popup, "utf8");

console.log("AI Lab contest access, unified download visuals, and Office host permission embedded");
await import("./apply-ai-lab-wait-spinners.mjs");
await import("./verify-ai-lab-build.mjs");