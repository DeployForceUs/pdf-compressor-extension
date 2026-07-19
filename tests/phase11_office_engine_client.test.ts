import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfficeEngineClient,
  createPlannerCapabilitiesFromOfficeHealth,
  OfficeEngineClientError,
} from "../src/lib/office/office-engine-client";

const health = {
  status: "healthy",
  readiness: "ready",
  apiVersion: "1.0",
  serviceVersion: "0.3.0",
  engine: { kind: "office", processor: "ghostscript", processorVersion: "10", processingAvailable: true },
  capabilities: {
    allowedPresets: ["balanced"],
    jobCreation: true,
    jobStatus: true,
    resultDownload: true,
    cancellation: true,
  },
  limits: { maxFileSizeMb: 1024, processingTimeoutSeconds: 300, retentionMinutes: 15, maxConcurrentJobs: 1 },
  runtime: {
    effectiveCpuCount: 1,
    effectiveMemoryMb: 1536,
    measurement: "effective_runtime_limits",
    performanceCalibration: "not_calibrated",
  },
};

test("maps trusted live health into content-blind Planner capabilities", () => {
  assert.deepEqual(createPlannerCapabilitiesFromOfficeHealth(health), {
    localAvailable: true,
    officeAvailable: true,
    officeCpuCount: 1,
    officeMemoryGb: 1.5,
    allowedPresets: ["balanced"],
    maxFileSizeMb: 1024,
  });

  const legacyHealth = { ...health, runtime: undefined };
  assert.equal(createPlannerCapabilitiesFromOfficeHealth(legacyHealth).officeAvailable, false);

  const fractionalCpuHealth = {
    ...health,
    runtime: { ...health.runtime, effectiveCpuCount: 0.5 },
  };
  assert.deepEqual(createPlannerCapabilitiesFromOfficeHealth(fractionalCpuHealth), {
    localAvailable: true,
    officeAvailable: false,
    officeCpuCount: 0,
    officeMemoryGb: 1.5,
    allowedPresets: ["balanced"],
    maxFileSizeMb: 1024,
  });
});

test("uses only the authenticated Gateway Office surface", async () => {
  const seen: Request[] = [];
  const client = createOfficeEngineClient({
    baseUrl: "https://pdf.example.test/",
    accessToken: "judge-secret",
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      if (request.url.endsWith("/health")) return Response.json(health);
      if (request.url.endsWith("/compress")) {
        return Response.json({ jobId: "job", status: "queued", progress: 0, preset: "balanced", createdAt: "now" }, { status: 202 });
      }
      if (request.url.endsWith("/result")) {
        return new Response("%PDF-result", { headers: { "content-type": "application/pdf", "x-result-kind": "compressed" } });
      }
      if (request.url.endsWith("/cancel")) {
        return Response.json({ jobId: "job", status: "cancelled", progress: 0, preset: "balanced", createdAt: "now" });
      }
      return Response.json({ jobId: "job", status: "completed", progress: 100, preset: "balanced", createdAt: "now" });
    },
  });

  await client.health();
  await client.createJob(new Blob(["%PDF-input"], { type: "application/pdf" }));
  await client.getJob("job");
  await client.downloadResult("job");
  await client.cancelJob("job");

  assert.deepEqual(seen.map((request) => new URL(request.url).pathname), [
    "/api/v1/office/health",
    "/api/v1/office/compress",
    "/api/v1/office/jobs/job",
    "/api/v1/office/jobs/job/result",
    "/api/v1/office/jobs/job/cancel",
  ]);
  assert.equal(seen.every((request) => request.headers.get("authorization") === "Bearer judge-secret"), true);
});

test("requires HTTPS except for explicit loopback development", () => {
  assert.throws(
    () => createOfficeEngineClient({ baseUrl: "http://pdf.example.test", accessToken: "token" }),
    (error: unknown) => error instanceof OfficeEngineClientError && error.code === "secure_server_url_required",
  );
  assert.doesNotThrow(() => createOfficeEngineClient({ baseUrl: "http://127.0.0.1:8790", accessToken: "token" }));
});

test("does not expose upstream response bodies in errors", async () => {
  const client = createOfficeEngineClient({
    baseUrl: "https://pdf.example.test",
    accessToken: "token",
    fetchImpl: async () => Response.json({ error: "unauthorized", secretDetail: "must-not-surface" }, { status: 401 }),
  });
  await assert.rejects(
    client.health(),
    (error: unknown) => error instanceof OfficeEngineClientError && error.code === "unauthorized" && !error.message.includes("must-not-surface"),
  );
});

test("rejects malformed runtime capacity instead of showing or planning with it", async () => {
  const client = createOfficeEngineClient({
    baseUrl: "https://pdf.example.test",
    accessToken: "token",
    fetchImpl: async () => Response.json({
      ...health,
      runtime: { ...health.runtime, effectiveCpuCount: 0 },
    }),
  });
  await assert.rejects(
    client.health(),
    (error: unknown) => error instanceof OfficeEngineClientError && error.code === "invalid_health_response",
  );
});
