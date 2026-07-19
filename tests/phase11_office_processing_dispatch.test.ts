import assert from "node:assert/strict";
import test from "node:test";

import { dispatchOfficeProcessing } from "../src/lib/office/office-processing-dispatch";

test("acknowledges Office processing without holding the runtime message channel", async () => {
  let finish!: () => void;
  let completed = false;
  const processing = new Promise<void>((resolve) => {
    finish = resolve;
  }).then(() => {
    completed = true;
  });

  const response = dispatchOfficeProcessing(() => processing, () => undefined);

  assert.deepEqual(response, {
    ok: true,
    accepted: true,
    details: "Office Engine processing started in the offscreen document",
  });
  assert.equal(completed, false);

  finish();
  await processing;
  assert.equal(completed, true);
});

test("reports an unexpected detached failure without rejecting the start response", async () => {
  let captured: unknown;
  const response = dispatchOfficeProcessing(
    async () => {
      throw new Error("detached failure");
    },
    (error) => {
      captured = error;
    },
  );

  assert.equal(response.accepted, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(String(captured), /detached failure/);
});
