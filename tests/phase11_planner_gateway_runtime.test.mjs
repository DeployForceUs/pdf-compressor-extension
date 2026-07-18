import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { build } from "../gateway/node_modules/esbuild/lib/main.js";

async function startGateway() {
  const directory = await mkdtemp(join(tmpdir(), "planner-gateway-test-"));
  const bundle = join(directory, "server.mjs");
  const openAiSecret = join(directory, "openai");
  const judgeSecret = join(directory, "judge");
  await writeFile(openAiSecret, "test-openai-key-not-real\n", { mode: 0o600 });
  await writeFile(judgeSecret, "test-judge-token-1234567890\n", { mode: 0o600 });
  await build({
    entryPoints: [resolve("gateway/server.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundle,
  });

  const child = spawn(process.execPath, [bundle], {
    env: {
      ...process.env,
      PORT: "18790",
      OPENAI_API_KEY_FILE: openAiSecret,
      JUDGE_ACCESS_TOKEN_FILE: judgeSecret,
      OPENAI_MODEL: "gpt-5-mini",
      OFFICE_ENGINE_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const deadline = Date.now() + 5_000;
  while (!output.includes('"event":"server_started"')) {
    if (child.exitCode !== null) throw new Error(`Gateway exited early: ${output}`);
    if (Date.now() >= deadline) throw new Error(`Gateway did not start: ${output}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }

  return {
    output: () => output,
    stop: async () => {
      child.kill("SIGTERM");
      await once(child, "exit");
    },
  };
}

test("bundled Planner Gateway starts, protects plans, and logs no secrets", async () => {
  const gateway = await startGateway();
  try {
    const health = await fetch("http://127.0.0.1:18790/api/v1/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: "healthy",
      readiness: "ready",
      service: "smart-planner-gateway",
      model: "gpt-5-mini",
      officeEngineEnabled: true,
    });

    const unauthorized = await fetch("http://127.0.0.1:18790/api/v1/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(unauthorized.status, 401);

    const invalidButAuthorized = await fetch("http://127.0.0.1:18790/api/v1/plans", {
      method: "POST",
      headers: {
        authorization: "Bearer test-judge-token-1234567890",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(invalidButAuthorized.status, 200);
    assert.deepEqual(await invalidButAuthorized.json(), {
      kind: "fallback",
      action: "use_existing_local_settings",
      reason: "invalid_request",
    });

    const logs = gateway.output();
    assert.equal(logs.includes("test-openai-key-not-real"), false);
    assert.equal(logs.includes("test-judge-token-1234567890"), false);
  } finally {
    await gateway.stop();
  }
});
