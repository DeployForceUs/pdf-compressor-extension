import assert from "node:assert/strict";
import test from "node:test";
import {
  patchBackgroundSource,
  patchOffscreenSource,
} from "../scripts/apply-smart-planner-runtime-route.mjs";

const backgroundFixture = `import { tracePdfSplit } from "../lib/pdf-split-trace";

export default defineBackground(() => {
  async function handle(message: BackgroundRequest): Promise<BackgroundResponse | null> {
    return null;
  }

  const backgroundMessageListener = (
    message: unknown,
  ) => {
    if (!isBackgroundRequest(message)) return undefined;
    return handle(message);
  };
});
`;

const offscreenFixture = `import { isOffscreenRequest } from "../message-routing";

async function handle(message: OffscreenRequest): Promise<OffscreenResponse | { ok: false; error: string } | null> {
  return null;
}

const offscreenMessageListener = (
  message: unknown,
) => {
  if (!isOffscreenRequest(message)) return undefined;

  return handle(message)
    .catch((error) => {
      return { ok: false, error: String(error) };
    });
};
`;

test("patches the background route without changing existing operations", () => {
  const patched = patchBackgroundSource(backgroundFixture);

  assert.match(patched, /isBackgroundSmartPlannerPrepareRequest/);
  assert.match(patched, /prepareSmartPlannerViaOffscreen/);
  assert.match(patched, /toOffscreenSmartPlannerPrepareRequest/);
  assert.match(patched, /if \(!isBackgroundRequest\(message\)\) return undefined/);
  assert.doesNotMatch(patched, /accessToken|baseUrl|selectedPdf|pdfBytes/);
});

test("patches the offscreen route through selected-PDF runtime preparation", () => {
  const patched = patchOffscreenSource(offscreenFixture);

  assert.match(patched, /isOffscreenSmartPlannerPrepareRequest/);
  assert.match(patched, /prepareSmartPlannerRuntimeRequest/);
  assert.match(patched, /readPdf\(SELECTED_PDF_RECORD_ID\)/);
  assert.match(patched, /profileContentBlind/);
  assert.match(patched, /executionAllowed: false as const/);
  assert.match(patched, /requiresUserConfirmation: true as const/);
  assert.doesNotMatch(patched, /office-processing-start|compress\(/);
});

test("is idempotent for both entrypoints", () => {
  const backgroundOnce = patchBackgroundSource(backgroundFixture);
  const offscreenOnce = patchOffscreenSource(offscreenFixture);

  assert.equal(patchBackgroundSource(backgroundOnce), backgroundOnce);
  assert.equal(patchOffscreenSource(offscreenOnce), offscreenOnce);
});
