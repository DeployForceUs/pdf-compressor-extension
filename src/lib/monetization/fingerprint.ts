export type FingerprintSource = {
  extensionId: string;
  userAgent: string;
  language: string;
  colorDepth: number;
  screenWidth: number;
  screenHeight: number;
  timezoneOffset: number;
};

function encodeHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashFingerprintSource(
  source: FingerprintSource,
  subtle: SubtleCrypto = crypto.subtle,
) {
  const canonical = [
    source.extensionId,
    source.userAgent,
    source.language,
    String(source.colorDepth),
    String(source.screenWidth),
    String(source.screenHeight),
    String(source.timezoneOffset),
  ].join("|");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return encodeHex(new Uint8Array(digest));
}

export function readBrowserFingerprintSource(): FingerprintSource {
  const extensionId = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { id?: string } };
  }).chrome?.runtime?.id;

  return {
    extensionId: extensionId ?? "unknown-extension",
    userAgent: globalThis.navigator?.userAgent ?? "unknown-user-agent",
    language: globalThis.navigator?.language ?? "unknown-language",
    colorDepth: globalThis.screen?.colorDepth ?? 0,
    screenWidth: globalThis.screen?.width ?? 0,
    screenHeight: globalThis.screen?.height ?? 0,
    timezoneOffset: new Date().getTimezoneOffset(),
  };
}

export function generateFingerprint() {
  return hashFingerprintSource(readBrowserFingerprintSource());
}
