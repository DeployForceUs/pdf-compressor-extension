#!/usr/bin/env node

import { createPrivateKey, createSign } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const TOKEN_PROFILE = Object.freeze({
  algorithm: "ES256",
  issuer: "pdf-compressor",
  audience: "pdf-compressor-extension",
  plan: "pro",
  purchase: "one-time",
  version: 1,
});

function usage() {
  return `Usage:
  npm run license:issue -- --license-id <id> [--private-key <path>] [--output <path>]

Options:
  --license-id       Stable non-personal license identifier (required)
  --private-key      Encrypted P-256 private key PEM
                     Default: ~/.pdf-compressor-license/pro-license-private.pem
  --output           Token file; created with mode 600
                     Default: ~/.pdf-compressor-license/tokens/<license-id>.token
  --issued-at        ISO timestamp or Unix seconds; defaults to now
  --passphrase-stdin Read the private-key passphrase from stdin (automation only)
  --help             Show this help
`;
}

function parseArguments(argv) {
  const result = { passphraseStdin: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") result.help = true;
    else if (argument === "--passphrase-stdin") result.passphraseStdin = true;
    else if (["--license-id", "--private-key", "--output", "--issued-at"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      result[argument.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase())] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function issuedAtSeconds(value) {
  const seconds = !value
    ? Math.floor(Date.now() / 1000)
    : /^\d+$/.test(value)
      ? Number(value)
      : Math.floor(Date.parse(value) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error("--issued-at must be ISO time or Unix seconds");
  }
  return seconds;
}

async function readHiddenPassphrase(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive passphrase entry requires a TTY; use --passphrase-stdin for automation");
  }

  process.stderr.write(prompt);
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolvePromise, reject) => {
      let passphrase = "";
      const onData = (input) => {
        for (const character of input) {
          if (character === "\u0003") {
            process.stdin.off("data", onData);
            reject(new Error("Cancelled"));
            return;
          }
          if (character === "\r" || character === "\n") {
            process.stdin.off("data", onData);
            process.stderr.write("\n");
            resolvePromise(passphrase);
            return;
          }
          if (character === "\u007f" || character === "\b") {
            passphrase = passphrase.slice(0, -1);
          } else {
            passphrase += character;
          }
        }
      };
      process.stdin.on("data", onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

async function readPassphrase(fromStdin) {
  if (!fromStdin) return readHiddenPassphrase("Private key passphrase: ");
  let passphrase = "";
  for await (const chunk of process.stdin) passphrase += chunk;
  return passphrase.replace(/[\r\n]+$/, "");
}

function safeTokenFilename(licenseId) {
  return licenseId.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.licenseId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(args.licenseId)) {
    throw new Error("--license-id must be 3-128 safe characters and must not contain customer PII");
  }

  const privateKeyPath = resolve(args.privateKey ?? join(homedir(), ".pdf-compressor-license", "pro-license-private.pem"));
  const outputPath = resolve(args.output ?? join(homedir(), ".pdf-compressor-license", "tokens", `${safeTokenFilename(args.licenseId)}.token`));
  const passphrase = await readPassphrase(args.passphraseStdin);
  if (!passphrase) throw new Error("Private key passphrase is required");

  const privateKeyPem = await readFile(privateKeyPath, "utf8");
  const privateKey = createPrivateKey({ key: privateKeyPem, passphrase });
  if (privateKey.asymmetricKeyType !== "ec" || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("Private key must be an EC P-256 key");
  }

  const claims = {
    iss: TOKEN_PROFILE.issuer,
    aud: TOKEN_PROFILE.audience,
    sub: args.licenseId,
    iat: issuedAtSeconds(args.issuedAt),
    plan: TOKEN_PROFILE.plan,
    purchase: TOKEN_PROFILE.purchase,
    version: TOKEN_PROFILE.version,
  };
  const header = { alg: TOKEN_PROFILE.algorithm, typ: "JWT" };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  if (signature.byteLength !== 64) throw new Error("Unexpected ES256 signature length");
  const token = `${signingInput}.${base64Url(signature)}`;

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(outputPath), 0o700);
  await writeFile(outputPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(outputPath, 0o600);
  process.stdout.write(`License token created: ${outputPath}\nLicense ID: ${claims.sub}\nIssued at: ${new Date(claims.iat * 1000).toISOString()}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`License issuance failed: ${message}\n`);
  process.exitCode = 1;
});
