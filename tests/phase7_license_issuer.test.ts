import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyProLicenseToken } from "../src/lib/monetization/license-token";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "phase7-license-issuer-"));
const privateKeyPath = join(fixtureDirectory, "private.pem");
const outputPath = join(fixtureDirectory, "license.token");
const passphrase = "fixture-passphrase";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

writeFileSync(privateKeyPath, privateKey.export({
  type: "pkcs8",
  format: "pem",
  cipher: "aes-256-cbc",
  passphrase,
}), { mode: 0o600 });

execFileSync(process.execPath, [
  "scripts/issue-pro-license.mjs",
  "--license-id", "fixture-license-001",
  "--private-key", privateKeyPath,
  "--output", outputPath,
  "--issued-at", "2026-07-14T12:00:00Z",
  "--passphrase-stdin",
], { cwd: process.cwd(), input: `${passphrase}\n`, stdio: ["pipe", "pipe", "pipe"] });

const token = readFileSync(outputPath, "utf8").trim();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const verification = await verifyProLicenseToken(token, publicKeyPem, {
  now: () => Date.UTC(2026, 6, 14, 12),
});

assert.equal(statSync(outputPath).mode & 0o777, 0o600);
assert.equal(verification.valid, true);
if (verification.valid) {
  assert.equal(verification.claims.sub, "fixture-license-001");
  assert.equal(verification.claims.iat, 1784030400);
  assert.equal("exp" in verification.claims, false);
  assert.equal("fingerprint" in verification.claims, false);
}

console.log("phase7 license issuer assertions passed");
