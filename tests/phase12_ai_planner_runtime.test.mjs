import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/add-ai-lab-planner-runtime.mjs", import.meta.url), "utf8");

test("AI Lab runtime calls only the recommendation planner endpoint", () => {
  assert.match(source, /\/api\/v1\/ai\/plan/);
  assert.match(source, /method: "POST"/);
  assert.doesNotMatch(source, /\/api\/v1\/compress/);
  assert.doesNotMatch(source, /\/api\/v1\/jobs/);
});

test("AI Lab runtime sends only the prepared PlannerRequest", () => {
  assert.match(source, /JSON\.stringify\(orchestration\.plannerRequest\)/);
  assert.doesNotMatch(source, /FormData/);
  assert.doesNotMatch(source, /FileReader/);
  assert.doesNotMatch(source, /arrayBuffer\(/);
});

test("AI Lab runtime exposes planner output only through debug state", () => {
  assert.match(source, /__AI_LAB_LAST_PLANNER_RESULT__/);
  assert.match(source, /__AI_LAB_LAST_ORCHESTRATION__/);
  assert.match(source, /ai-lab:planner-result/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.doesNotMatch(source, /textContent\s*=/);
  assert.doesNotMatch(source, /appendChild\(/);
});

test("AI Lab runtime has deterministic network and timeout fallback", () => {
  assert.match(source, /planner_timeout/);
  assert.match(source, /planner_network_error/);
  assert.match(source, /planner_http_/);
  assert.match(source, /status: "fallback"/);
});
