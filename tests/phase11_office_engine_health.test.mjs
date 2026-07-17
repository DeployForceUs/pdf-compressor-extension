import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createOfficeEngineServer } from "../engine/server.mjs";

async function withServer(run) {
  const logs = [];
  const server = createOfficeEngineServer({ logger: (record) => logs.push(record) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`, logs);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health exposes explicit blocked capabilities without secret state", async () => {
  await withServer(async (baseUrl, logs) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");

    assert.deepEqual(await response.json(), {
      status: "healthy",
      readiness: "blocked",
      apiVersion: "1.0",
      serviceVersion: "0.1.0",
      engine: {
        kind: "office",
        processor: null,
        processorVersion: null,
        processingAvailable: false,
        disabledReason: "numeric_policy_unapproved",
      },
      capabilities: {
        allowedPresets: [],
        jobCreation: false,
        jobStatus: false,
        resultDownload: false,
        cancellation: false,
      },
      limits: {
        maxFileSizeMb: null,
        processingTimeoutSeconds: null,
        retentionMinutes: null,
      },
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].route, "health");
    assert.equal(JSON.stringify(logs).includes("OPENAI_API_KEY"), false);
  });
});

test("compression remains closed until numeric policy is approved", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/compress`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: "%PDF-1.7 synthetic fixture",
    });

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "processing_unavailable",
      reason: "numeric_policy_unapproved",
    });
  });
});

test("logs classify unknown routes without recording URL content", async () => {
  await withServer(async (baseUrl, logs) => {
    const marker = "never-log-this-document-name.pdf";
    const response = await fetch(`${baseUrl}/${marker}?token=secret`);
    assert.equal(response.status, 404);

    await new Promise((resolve) => setImmediate(resolve));
    const serialized = JSON.stringify(logs);
    assert.equal(serialized.includes(marker), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(logs[0].route, "unknown");
  });
});
