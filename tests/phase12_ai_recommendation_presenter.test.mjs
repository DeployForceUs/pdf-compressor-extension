import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/apply-ai-lab-recommendation-presenter.mjs", import.meta.url), "utf8");

test("Recommendation presenter replaces local instant templates", () => {
  assert.match(source, /AI Lab recommendation template boundary not found/);
  assert.match(source, /Building your plan/);
  assert.doesNotMatch(source, /Estimated output/);
  assert.doesNotMatch(source, /Ready for email delivery/);
});

test("Recommendation presenter consumes only validated Planner result event", () => {
  assert.match(source, /ai-lab:planner-result/);
  assert.match(source, /plannerResultStatus === \"ready\"/);
  assert.match(source, /plannerResult\?\.response/);
});

test("Recommendation presenter keeps execution disabled until Block G", () => {
  assert.match(source, /confirm\.disabled = true/);
  assert.match(source, /ai-lab-process-button--pending-router/);
  assert.doesNotMatch(source, /api\/v1\/compress/);
  assert.doesNotMatch(source, /api\/v1\/jobs/);
});

test("Recommendation screen stays inside the existing goal panel", () => {
  assert.match(source, /document\.querySelector\(\"\.ai-lab-goal-panel\"\)/);
  assert.doesNotMatch(source, /appendChild\(document\.body/);
  assert.doesNotMatch(source, /fourth phase/i);
});

test("Recommendation workspace uses one outer vertical scroll", () => {
  assert.match(source, /ai-lab-recommendation-active/);
  assert.match(source, /overflow-y: auto !important/);
  assert.match(source, /ai-lab-recommendation-scroll-host/);
  assert.match(source, /overflow: visible !important/);
  assert.doesNotMatch(source, /\.ai-lab-recommendation\s*\{[^}]*overflow-y:\s*auto/is);
});