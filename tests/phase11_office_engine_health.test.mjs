import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createOfficeEngineServer } from "../engine/server.mjs";

async function withServer(run, options = {}) {
  const logs = [];
  const server = createOfficeEngineServer({
    logger: (record) => logs.push(record),
    processorVersion: "10.0-test",
    ...options,
  });
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

test("health exposes ready bounded capabilities without secret state", async () => {
  await withServer(async (baseUrl, logs) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");

    assert.deepEqual(await response.json(), {
      status: "healthy",
      readiness: "ready",
      apiVersion: "1.0",
      serviceVersion: "0.2.0",
      engine: {
        kind: "office",
        processor: "ghostscript",
        processorVersion: "10.0-test",
        processingAvailable: true,
      },
      capabilities: {
        allowedPresets: ["balanced"],
        jobCreation: true,
        jobStatus: true,
        resultDownload: true,
        cancellation: true,
      },
      limits: {
        maxFileSizeMb: 1024,
        processingTimeoutSeconds: 300,
        retentionMinutes: 15,
        maxConcurrentJobs: 1,
      },
    });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].route, "health");
    assert.equal(JSON.stringify(logs).includes("OPENAI_API_KEY"), false);
  });
});

test("compression creates an asynchronous bounded job", async () => {
  const manager = {
    async createJob(_stream, options) {
      assert.equal(options.contentType, "application/pdf");
      return { jobId: "00000000-0000-4000-8000-000000000001", status: "queued" };
    },
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/compress`, {
      method: "POST",
      headers: { "content-type": "application/pdf" },
      body: "%PDF-1.7 synthetic fixture",
    });

    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      jobId: "00000000-0000-4000-8000-000000000001",
      status: "queued",
    });
  }, { manager });
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
