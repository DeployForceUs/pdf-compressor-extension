import assert from "node:assert/strict";
import test from "node:test";

import { SourcePlannerClient } from "../src/lib/ai-runtime/adapters/planner-client.js";
import {
  createAiRuntimeConfig,
  resolveExecutionEndpoint,
} from "../src/lib/ai-runtime/adapters/runtime-config.js";

const plannerUrl = "https://planner.example.com/api";
const officeUrl = "https://office.example.com/engine";

test("requires an explicit planner endpoint and never invents localhost", () => {
  assert.throws(() => createAiRuntimeConfig({ plannerEndpoint: "" }), /plannerEndpoint_required/);
  const config = createAiRuntimeConfig({ plannerEndpoint: plannerUrl });
  assert.equal(config.plannerEndpoint, plannerUrl);
  assert.equal(config.officeEndpoint, null);
  assert.equal(config.plannerEndpoint.includes("localhost"), false);
});

test("keeps planner and Office endpoints independently configurable", () => {
  const config = createAiRuntimeConfig({ plannerEndpoint: plannerUrl, officeEndpoint: officeUrl });
  assert.equal(config.plannerEndpoint, plannerUrl);
  assert.equal(config.officeEndpoint, officeUrl);
  assert.equal(resolveExecutionEndpoint(config, "local"), null);
  assert.equal(resolveExecutionEndpoint(config, "office_current"), officeUrl);
});

test("allows localhost only when explicitly selected by configuration", () => {
  const config = createAiRuntimeConfig({
    plannerEndpoint: "http://localhost:8787",
    officeEndpoint: "http://127.0.0.1:8790",
  });
  assert.equal(config.plannerEndpoint, "http://localhost:8787");
  assert.equal(config.officeEndpoint, "http://127.0.0.1:8790");
});

test("source planner reaches a local compression plan through configured endpoint", async () => {
  const calls: string[] = [];
  const client = new SourcePlannerClient(
    createAiRuntimeConfig({ plannerEndpoint: plannerUrl }),
    async (url) => {
      calls.push(url);
      return { ok: true, status: 200, async json() { return { route: "local", preset: "safe" }; } };
    },
  );

  const result = await client.createPlan({ executionId: "execution-local", targetBytes: 1024 });
  assert.deepEqual(calls, [`${plannerUrl}/plan`]);
  assert.deepEqual(result, {
    plan: { route: "local", preset: "safe", source: "planner" },
    failure: null,
  });
});

test("source planner accepts Office route only with independent Office endpoint", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 200,
    async json() { return { route: "office_current", preset: "strong" }; },
  });

  const configured = new SourcePlannerClient(
    createAiRuntimeConfig({ plannerEndpoint: plannerUrl, officeEndpoint: officeUrl }),
    fetcher,
  );
  const accepted = await configured.createPlan({ executionId: "execution-office", targetBytes: 2048 });
  assert.deepEqual(accepted, {
    plan: { route: "office_current", preset: "strong", source: "planner" },
    failure: null,
  });

  const missing = new SourcePlannerClient(createAiRuntimeConfig({ plannerEndpoint: plannerUrl }), fetcher);
  const rejected = await missing.createPlan({ executionId: "execution-office", targetBytes: 2048 });
  assert.equal(rejected.plan.route, "local");
  assert.equal(rejected.plan.source, "deterministic_fallback");
  assert.equal(rejected.failure?.code, "office_endpoint_missing");
});

test("network, HTTP and schema failures produce typed deterministic fallback", async () => {
  const config = createAiRuntimeConfig({ plannerEndpoint: plannerUrl, officeEndpoint: officeUrl });

  const network = await new SourcePlannerClient(config, async () => { throw new Error("offline"); })
    .createPlan({ executionId: "network", targetBytes: 1 });
  assert.equal(network.failure?.code, "planner_network_failed");

  const http = await new SourcePlannerClient(config, async () => ({
    ok: false,
    status: 503,
    async json() { return {}; },
  })).createPlan({ executionId: "http", targetBytes: 1 });
  assert.equal(http.failure?.code, "planner_http_failed");

  const schema = await new SourcePlannerClient(config, async () => ({
    ok: true,
    status: 200,
    async json() { return { route: "unknown", preset: "magic" }; },
  })).createPlan({ executionId: "schema", targetBytes: 1 });
  assert.equal(schema.failure?.code, "planner_response_invalid");

  for (const result of [network, http, schema]) {
    assert.deepEqual(result.plan, {
      route: "local",
      preset: "balanced",
      source: "deterministic_fallback",
    });
  }
});
