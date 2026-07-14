export const PRO_LICENSE_TOKEN_PROFILE = Object.freeze({
  algorithm: "ES256" as const,
  issuer: "pdf-compressor",
  audience: "pdf-compressor-extension",
  plan: "pro" as const,
  purchase: "one-time" as const,
  version: 1 as const,
});

export type ProLicenseClaims = {
  iss: typeof PRO_LICENSE_TOKEN_PROFILE.issuer;
  aud: typeof PRO_LICENSE_TOKEN_PROFILE.audience;
  sub: string;
  iat: number;
  plan: typeof PRO_LICENSE_TOKEN_PROFILE.plan;
  purchase: typeof PRO_LICENSE_TOKEN_PROFILE.purchase;
  version: typeof PRO_LICENSE_TOKEN_PROFILE.version;
};

export type LicenseTokenErrorCode =
  | "MALFORMED_TOKEN"
  | "UNSUPPORTED_ALGORITHM"
  | "INVALID_PUBLIC_KEY"
  | "INVALID_SIGNATURE"
  | "INVALID_CLAIMS"
  | "NOT_YET_VALID";

export type LicenseTokenVerification =
  | { valid: true; claims: ProLicenseClaims }
  | { valid: false; code: LicenseTokenErrorCode };

export type VerifyLicenseTokenDependencies = {
  subtle?: SubtleCrypto;
  now?: () => number;
};

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url value");
  }

  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function decodeJson(value: string): Record<string, unknown> {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(value));
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JWT segment must be an object");
  }
  return parsed as Record<string, unknown>;
}

function decodePublicKeyPem(publicKeyPem: string) {
  const match = publicKeyPem.trim().match(
    /^-----BEGIN PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PUBLIC KEY-----$/,
  );
  if (!match) {
    throw new Error("Public key must be SPKI PEM");
  }
  const decoded = atob(match[1].replace(/\s/g, ""));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function hasForbiddenBindingClaim(payload: Record<string, unknown>) {
  return ["fingerprint", "deviceId", "device_id", "chromeRuntimeId", "chrome_runtime_id"]
    .some((claim) => claim in payload);
}

function validateClaims(payload: Record<string, unknown>, nowSeconds: number): LicenseTokenVerification {
  if ("exp" in payload || hasForbiddenBindingClaim(payload)) {
    return { valid: false, code: "INVALID_CLAIMS" };
  }
  if ("nbf" in payload) {
    if (!Number.isInteger(payload.nbf)) {
      return { valid: false, code: "INVALID_CLAIMS" };
    }
    if ((payload.nbf as number) > nowSeconds) {
      return { valid: false, code: "NOT_YET_VALID" };
    }
  }
  if (
    payload.iss !== PRO_LICENSE_TOKEN_PROFILE.issuer
    || payload.aud !== PRO_LICENSE_TOKEN_PROFILE.audience
    || typeof payload.sub !== "string"
    || payload.sub.trim().length === 0
    || payload.sub.length > 128
    || !Number.isInteger(payload.iat)
    || (payload.iat as number) > nowSeconds + 300
    || payload.plan !== PRO_LICENSE_TOKEN_PROFILE.plan
    || payload.purchase !== PRO_LICENSE_TOKEN_PROFILE.purchase
    || payload.version !== PRO_LICENSE_TOKEN_PROFILE.version
  ) {
    return { valid: false, code: "INVALID_CLAIMS" };
  }

  return { valid: true, claims: payload as ProLicenseClaims };
}

export async function verifyProLicenseToken(
  token: string,
  publicKeyPem: string,
  { subtle = crypto.subtle, now = Date.now }: VerifyLicenseTokenDependencies = {},
): Promise<LicenseTokenVerification> {
  const normalizedToken = token.trim();
  if (normalizedToken.length > 8_192) {
    return { valid: false, code: "MALFORMED_TOKEN" };
  }
  const segments = normalizedToken.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    return { valid: false, code: "MALFORMED_TOKEN" };
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    header = decodeJson(segments[0]);
    payload = decodeJson(segments[1]);
    signature = decodeBase64Url(segments[2]);
  } catch {
    return { valid: false, code: "MALFORMED_TOKEN" };
  }

  if (header.alg !== PRO_LICENSE_TOKEN_PROFILE.algorithm || (header.typ !== undefined && header.typ !== "JWT")) {
    return { valid: false, code: "UNSUPPORTED_ALGORITHM" };
  }
  if (signature.byteLength !== 64) {
    return { valid: false, code: "MALFORMED_TOKEN" };
  }

  let publicKey: CryptoKey;
  try {
    publicKey = await subtle.importKey(
      "spki",
      decodePublicKeyPem(publicKeyPem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch {
    return { valid: false, code: "INVALID_PUBLIC_KEY" };
  }

  try {
    const verified = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      Uint8Array.from(signature).buffer,
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
    if (!verified) {
      return { valid: false, code: "INVALID_SIGNATURE" };
    }
  } catch {
    return { valid: false, code: "INVALID_SIGNATURE" };
  }

  return validateClaims(payload, Math.floor(now() / 1000));
}
