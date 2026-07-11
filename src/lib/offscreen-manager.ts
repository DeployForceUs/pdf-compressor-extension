import browser from "webextension-polyfill";

const OFFSCREEN_URL = browser.runtime.getURL("offscreen.html");
const OFFSCREEN_REASON = "BLOBS";

export async function ensureOffscreenDocument() {
  const offscreen = (browser as typeof browser & { offscreen?: OffscreenAPI }).offscreen;
  if (!offscreen) {
    return { supported: false, created: false };
  }

  const existing = await hasOffscreenDocument();
  if (existing) {
    return { supported: true, created: false };
  }

  await offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [OFFSCREEN_REASON],
    justification: "Provide local IndexedDB-backed smoke tests for Phase 1",
  });

  return { supported: true, created: true };
}

export async function closeOffscreenDocument() {
  const offscreen = (browser as typeof browser & { offscreen?: OffscreenAPI }).offscreen;
  if (!offscreen) {
    return { supported: false, closed: false };
  }

  const existing = await hasOffscreenDocument();
  if (!existing) {
    return { supported: true, closed: false };
  }

  await offscreen.closeDocument();
  return { supported: true, closed: true };
}

export async function hasOffscreenDocument() {
  const offscreen = (browser as typeof browser & { offscreen?: OffscreenAPI }).offscreen;
  if (!offscreen || !offscreen.hasDocument) {
    return false;
  }

  return offscreen.hasDocument();
}
