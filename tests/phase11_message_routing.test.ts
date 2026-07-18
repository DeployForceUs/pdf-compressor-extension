import assert from "node:assert/strict";
import test from "node:test";
import { isBackgroundRequest, isOffscreenRequest } from "../src/lib/message-routing";

test("routes PDF persistence exclusively to the offscreen document", () => {
  const message = { type: "pdf:store", record: {} };

  assert.equal(isOffscreenRequest(message), true);
  assert.equal(isBackgroundRequest(message), false);
});

test("routes popup commands exclusively to the background worker", () => {
  const message = { type: "background:office-processing-start" };

  assert.equal(isBackgroundRequest(message), true);
  assert.equal(isOffscreenRequest(message), false);
});

test("does not claim progress broadcasts or unknown messages", () => {
  for (const message of [{ type: "office:progress" }, { type: "unknown" }, null]) {
    assert.equal(isBackgroundRequest(message), false);
    assert.equal(isOffscreenRequest(message), false);
  }
});
