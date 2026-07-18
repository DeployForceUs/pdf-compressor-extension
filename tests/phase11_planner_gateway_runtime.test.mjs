import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
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
      OFFICE_ENGINE_URL: "http://127.0.0.1:18787",
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

async function startFakeOfficeEngine() {
  const requests = [];
  const jobId = "123e4567-e89b-42d3-a456-426614174000";
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body: Buffer.concat(chunks),
    });
    if (request.url === "/api/v1/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "healthy", readiness: "ready" }));
      return;
    }
    if (request.url === "/api/v1/compress") {
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId, status: "queued", progress: 0 }));
      return;
    }
    if (request.url === `/api/v1/jobs/${jobId}`) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId, status: "completed", progress: 100 }));
      return;
    }
    if (request.url === `/api/v1/jobs/${jobId}/result`) {
      const pdf = Buffer.from("%PDF-test-result");
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-length": String(pdf.byteLength),
        "x-result-kind": "compressed",
      });
      response.end(pdf);
      return;
    }
    if (request.url === `/api/v1/jobs/${jobId}/cancel`) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobId, status: "cancelled", progress: 0 }));
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(18787, "127.0.0.1");
  await once(server, "listening");
  return {
    requests,
    stop: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

test("bundled Planner Gateway starts, protects plans, and logs no secrets", async () => {
  const office = await startFakeOfficeEngine();
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

    const unauthorizedOffice = await fetch("http://127.0.0.1:18790/api/v1/office/health");
    assert.equal(unauthorizedOffice.status, 401);

    const authorization = { authorization: "Bearer test-judge-token-1234567890" };
    const officeHealth = await fetch("http://127.0.0.1:18790/api/v1/office/health", {
      headers: authorization,
    });
    assert.equal(officeHealth.status, 200);
    assert.deepEqual(await officeHealth.json(), { status: "healthy", readiness: "ready" });

    const input = Buffer.from("%PDF-test-input");
    const createJob = await fetch("http://127.0.0.1:18790/api/v1/office/compress", {
      method: "POST",
      headers: { ...authorization, "content-type": "application/pdf" },
      body: input,
    });
    assert.equal(createJob.status, 202);
    const { jobId } = await createJob.json();

    const status = await fetch(`http://127.0.0.1:18790/api/v1/office/jobs/${jobId}`, {
      headers: authorization,
    });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).status, "completed");

    const result = await fetch(`http://127.0.0.1:18790/api/v1/office/jobs/${jobId}/result`, {
      headers: authorization,
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("x-result-kind"), "compressed");
    assert.equal(Buffer.from(await result.arrayBuffer()).toString(), "%PDF-test-result");

    const cancel = await fetch(`http://127.0.0.1:18790/api/v1/office/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: authorization,
    });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).status, "cancelled");

    assert.equal(office.requests.some((entry) => entry.authorization !== undefined), false);
    assert.equal(office.requests.find((entry) => entry.url === "/api/v1/compress").body.equals(input), true);

    const logs = gateway.output();
    assert.equal(logs.includes("test-openai-key-not-real"), false);
    assert.equal(logs.includes("test-judge-token-1234567890"), false);
  } finally {
    await gateway.stop();
    await office.stop();
  }
});
