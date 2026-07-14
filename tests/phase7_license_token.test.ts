import assert from "node:assert/strict";
import {
  PRO_LICENSE_TOKEN_PROFILE,
  verifyProLicenseToken,
  type ProLicenseClaims,
} from "../src/lib/monetization/license-token";
import {
  createLicenseService,
  type StoredProLicense,
} from "../src/lib/monetization/license";
import {
  PRO_LICENSE_PUBLIC_KEY_PEM,
  PRO_LICENSE_PUBLIC_KEY_SHA256,
} from "../src/lib/monetization/license-public-key";

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJson(value: unknown) {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function toPem(bytes: ArrayBuffer) {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

async function createFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKeyPem = toPem(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const now = Date.UTC(2026, 6, 14, 12);
  const claims: ProLicenseClaims = {
    iss: PRO_LICENSE_TOKEN_PROFILE.issuer,
    aud: PRO_LICENSE_TOKEN_PROFILE.audience,
    sub: "license-001",
    iat: Math.floor(now / 1000),
    plan: "pro",
    purchase: "one-time",
    version: 1,
  };

  async function sign(payload: Record<string, unknown> = claims, header: Record<string, unknown> = { alg: "ES256", typ: "JWT" }) {
    const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
  }

  return { publicKeyPem, now, claims, sign };
}

const fixture = await createFixture();

{
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(PRO_LICENSE_PUBLIC_KEY_PEM),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(hex, PRO_LICENSE_PUBLIC_KEY_SHA256);

  const fixtureToken = await fixture.sign();
  const wrongKey = await verifyProLicenseToken(fixtureToken, PRO_LICENSE_PUBLIC_KEY_PEM, { now: () => fixture.now });
  assert.deepEqual(wrongKey, { valid: false, code: "INVALID_SIGNATURE" });
}

{
  const token = await fixture.sign();
  const verification = await verifyProLicenseToken(token, fixture.publicKeyPem, { now: () => fixture.now });
  assert.equal(verification.valid, true);
  if (verification.valid) {
    assert.deepEqual(verification.claims, fixture.claims);
    assert.equal("exp" in verification.claims, false);
    assert.equal("fingerprint" in verification.claims, false);
  }

  const [header, payload, signature] = token.split(".");
  const tamperedSignature = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  const tampered = `${header}.${payload}.${tamperedSignature}`;
  assert.deepEqual(
    await verifyProLicenseToken(tampered, fixture.publicKeyPem, { now: () => fixture.now }),
    { valid: false, code: "INVALID_SIGNATURE" },
  );
}

{
  const wrongAlgorithm = await fixture.sign(fixture.claims, { alg: "HS256", typ: "JWT" });
  assert.deepEqual(
    await verifyProLicenseToken(wrongAlgorithm, fixture.publicKeyPem, { now: () => fixture.now }),
    { valid: false, code: "UNSUPPORTED_ALGORITHM" },
  );

  const expiring = await fixture.sign({ ...fixture.claims, exp: Math.floor(fixture.now / 1000) + 3600 });
  assert.deepEqual(
    await verifyProLicenseToken(expiring, fixture.publicKeyPem, { now: () => fixture.now }),
    { valid: false, code: "INVALID_CLAIMS" },
  );

  const deviceBound = await fixture.sign({ ...fixture.claims, fingerprint: "forbidden" });
  assert.deepEqual(
    await verifyProLicenseToken(deviceBound, fixture.publicKeyPem, { now: () => fixture.now }),
    { valid: false, code: "INVALID_CLAIMS" },
  );
}

{
  let stored: StoredProLicense | null = null;
  const storage = {
    get: async () => structuredClone(stored),
    set: async (_key: string, value: StoredProLicense) => {
      stored = structuredClone(value);
    },
    remove: async () => {
      stored = null;
    },
  };
  const service = createLicenseService({
    storage,
    publicKeyPem: fixture.publicKeyPem,
    now: () => fixture.now,
  });
  const token = await fixture.sign();
  assert.deepEqual(await service.check(), { valid: false, code: "NO_LICENSE" });
  assert.equal((await service.activate(token)).valid, true);
  assert.equal(stored?.claims.sub, "license-001");
  assert.equal((await service.check()).valid, true);
  await service.revoke();
  assert.equal(stored, null);
}

console.log("phase7 ES256 perpetual license assertions passed");
