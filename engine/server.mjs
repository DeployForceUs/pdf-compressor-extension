import { randomUUID } from "node:crypto";
import { createServer as createNodeServer } from "node:http";

import { detectGhostscriptVersion } from "./ghostscript-processor.mjs";
import { createHealthResponse } from "./health-contract.mjs";
import { EngineRequestError, OfficeEngineJobManager } from "./job-manager.mjs";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};
const JOB_ROUTE = /^\/api\/v1\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/(result|cancel))?$/i;

function writeJson(response, statusCode, body, includeBody = true) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    "content-length": Buffer.byteLength(serialized),
  });
  response.end(includeBody ? serialized : undefined);
}

function classifyRoute(pathname) {
  if (pathname === "/api/v1/health") return { name: "health" };
  if (pathname === "/api/v1/compress") return { name: "compress" };
  const match = JOB_ROUTE.exec(pathname);
  if (!match) return { name: "unknown" };
  return {
    name: match[2] === "result" ? "job_result" : match[2] === "cancel" ? "job_cancel" : "job_status",
    jobId: match[1],
  };
}

function contentLength(request) {
  const value = request.headers["content-length"];
  if (value === undefined) return null;
  if (!/^\d+$/.test(value)) throw new EngineRequestError(400, "invalid_content_length");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new EngineRequestError(400, "invalid_content_length");
  return parsed;
}

function defaultLogger(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export function createOfficeEngineServer({
  logger = defaultLogger,
  manager = new OfficeEngineJobManager(),
  processorVersion = detectGhostscriptVersion(),
} = {}) {
  return createNodeServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    let statusCode = 500;
    let routeName = "invalid_url";

    response.setHeader("x-request-id", requestId);
    response.once("finish", () => {
      logger({
        event: "http_request",
        requestId,
        method: request.method ?? "UNKNOWN",
        route: routeName,
        statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });

    try {
      const url = new URL(request.url ?? "/", "http://office-engine.invalid");
      const route = classifyRoute(url.pathname);
      routeName = route.name;

      if (route.name === "health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          statusCode = 405;
          response.setHeader("allow", "GET, HEAD");
          writeJson(response, statusCode, { error: "method_not_allowed" });
          return;
        }
        statusCode = 200;
        writeJson(response, statusCode, createHealthResponse({ processorVersion }), request.method !== "HEAD");
        return;
      }

      if (route.name === "compress") {
        if (request.method !== "POST") throw new EngineRequestError(405, "method_not_allowed");
        if (!processorVersion) throw new EngineRequestError(503, "processor_unavailable");
        const job = await manager.createJob(request, {
          contentType: request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase(),
          contentLength: contentLength(request),
        });
        statusCode = 202;
        writeJson(response, statusCode, job);
        return;
      }

      if (route.name === "job_status") {
        if (request.method !== "GET" && request.method !== "HEAD") throw new EngineRequestError(405, "method_not_allowed");
        const job = manager.getJob(route.jobId);
        if (!job) throw new EngineRequestError(404, "job_not_found");
        statusCode = 200;
        writeJson(response, statusCode, job, request.method !== "HEAD");
        return;
      }

      if (route.name === "job_result") {
        if (request.method !== "GET" && request.method !== "HEAD") throw new EngineRequestError(405, "method_not_allowed");
        const result = manager.getResult(route.jobId);
        statusCode = 200;
        response.writeHead(statusCode, {
          "cache-control": "no-store",
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="result.pdf"',
          "content-length": result.bytes,
          "x-content-type-options": "nosniff",
          "x-result-kind": result.kind,
        });
        if (request.method === "HEAD") response.end();
        else result.stream.on("error", () => response.destroy()).pipe(response);
        return;
      }

      if (route.name === "job_cancel") {
        if (request.method !== "POST") throw new EngineRequestError(405, "method_not_allowed");
        const job = await manager.cancel(route.jobId);
        statusCode = 200;
        writeJson(response, statusCode, job);
        return;
      }

      statusCode = 404;
      request.resume();
      writeJson(response, statusCode, { error: "not_found" });
    } catch (error) {
      request.resume();
      statusCode = error instanceof EngineRequestError ? error.statusCode : 400;
      writeJson(response, statusCode, {
        error: error instanceof EngineRequestError ? error.code : "invalid_request",
      });
    }
  });
}

function parsePort(value) {
  if (value === undefined) return 8787;
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
  return port;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new OfficeEngineJobManager();
  await manager.initialize();
  const processorVersion = detectGhostscriptVersion();
  const server = createOfficeEngineServer({ manager, processorVersion });
  const port = parsePort(process.env.PORT);

  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`${JSON.stringify({ event: "server_started", port, service: "office-engine", processorVersion })}\n`);
  });

  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`${JSON.stringify({ event: "server_stopping", signal, service: "office-engine" })}\n`);
    server.close(async () => {
      await manager.dispose();
      process.exit(0);
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
