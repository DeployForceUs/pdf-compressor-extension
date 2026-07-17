import { randomUUID } from "node:crypto";
import { createServer as createNodeServer } from "node:http";

import { createHealthResponse } from "./health-contract.mjs";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function writeJson(response, statusCode, body, includeBody = true) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    "content-length": Buffer.byteLength(serialized),
  });
  response.end(includeBody ? serialized : undefined);
}

function classifyRoute(pathname) {
  if (pathname === "/api/v1/health") return "health";
  if (pathname === "/api/v1/compress") return "compress";
  return "unknown";
}

function defaultLogger(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export function createOfficeEngineServer({ logger = defaultLogger } = {}) {
  return createNodeServer((request, response) => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    let statusCode = 500;
    let route = "invalid_url";

    response.setHeader("x-request-id", requestId);
    request.resume();

    try {
      const url = new URL(request.url ?? "/", "http://office-engine.invalid");
      route = classifyRoute(url.pathname);

      if (route === "health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          statusCode = 405;
          response.setHeader("allow", "GET, HEAD");
          writeJson(response, statusCode, { error: "method_not_allowed" });
          return;
        }

        statusCode = 200;
        writeJson(
          response,
          statusCode,
          createHealthResponse(),
          request.method !== "HEAD",
        );
        return;
      }

      if (route === "compress" && request.method === "POST") {
        statusCode = 503;
        writeJson(response, statusCode, {
          error: "processing_unavailable",
          reason: "numeric_policy_unapproved",
        });
        return;
      }

      statusCode = 404;
      writeJson(response, statusCode, { error: "not_found" });
    } catch {
      statusCode = 400;
      writeJson(response, statusCode, { error: "invalid_request" });
    } finally {
      response.once("finish", () => {
        logger({
          event: "http_request",
          requestId,
          method: request.method ?? "UNKNOWN",
          route,
          statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      });
    }
  });
}

function parsePort(value) {
  if (value === undefined) return 8787;
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
  return port;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createOfficeEngineServer();
  const port = parsePort(process.env.PORT);

  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(
      `${JSON.stringify({ event: "server_started", port, service: "office-engine" })}\n`,
    );
  });

  const shutdown = (signal) => {
    process.stdout.write(
      `${JSON.stringify({ event: "server_stopping", signal, service: "office-engine" })}\n`,
    );
    server.close(() => process.exit(0));
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
