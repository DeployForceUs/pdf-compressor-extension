import { timingSafeEqual, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";

import { handleSmartPlannerGatewayRequest } from "../src/lib/ai/smart-planner-gateway";

const DEFAULT_PORT = 8790;
const DEFAULT_MAX_REQUEST_BYTES = 32_768;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT_REQUESTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_OPENAI_MODEL = "gpt-5.6";

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readSecretFile(name: string) {
  const path = process.env[name];
  if (!path) throw new Error(`${name} is required`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) throw new Error(`${name} points to an empty secret`);
  return value;
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function createFixedWindowRateLimiter(limit: number, windowMs: number) {
  let windowStartedAt = Date.now();
  let used = 0;

  return () => {
    const now = Date.now();
    if (now - windowStartedAt >= windowMs) {
      windowStartedAt = now;
      used = 0;
    }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": bytes.byteLength,
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(bytes);
}

async function readBoundedBody(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += bytes.byteLength;
    if (received > maxBytes) return undefined;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function toHeaders(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function forwardWebResponse(
  source: Response,
  target: ServerResponse,
  requestId: string,
) {
  const headers: Record<string, string> = { "x-request-id": requestId };
  source.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const body = Buffer.from(await source.arrayBuffer());
  headers["content-length"] = String(body.byteLength);
  target.writeHead(source.status, headers);
  target.end(body);
}

const port = readPositiveInteger("PORT", DEFAULT_PORT);
const maxRequestBytes = readPositiveInteger(
  "PLANNER_MAX_REQUEST_BYTES",
  DEFAULT_MAX_REQUEST_BYTES,
);
const timeoutMs = readPositiveInteger("PLANNER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
const rateLimitRequests = readPositiveInteger(
  "PLANNER_RATE_LIMIT_REQUESTS",
  DEFAULT_RATE_LIMIT_REQUESTS,
);
const rateLimitWindowSeconds = readPositiveInteger(
  "PLANNER_RATE_LIMIT_WINDOW_SECONDS",
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
);
const apiKey = readSecretFile("OPENAI_API_KEY_FILE");
const judgeAccessToken = readSecretFile("JUDGE_ACCESS_TOKEN_FILE");
const openAiModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
const consumeRateLimit = createFixedWindowRateLimiter(
  rateLimitRequests,
  rateLimitWindowSeconds * 1000,
);

const server = createServer(async (request, response) => {
  const startedAt = performance.now();
  const requestId = randomUUID();
  let route = "unknown";
  let statusCode = 500;

  try {
    const url = new URL(request.url ?? "/", "http://planner.internal");

    if (url.pathname === "/api/v1/health") {
      route = "health";
      if (request.method !== "GET" && request.method !== "HEAD") {
        statusCode = 405;
        response.setHeader("allow", "GET, HEAD");
        writeJson(response, statusCode, { error: "method_not_allowed" });
        return;
      }
      statusCode = 200;
      writeJson(response, statusCode, {
        status: "healthy",
        readiness: "ready",
        service: "smart-planner-gateway",
        model: openAiModel,
      });
      return;
    }

    if (url.pathname !== "/api/v1/plans") {
      statusCode = 404;
      writeJson(response, statusCode, { error: "not_found" });
      return;
    }

    route = "plans";
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
      request.resume();
      statusCode = 413;
      writeJson(response, statusCode, { error: "request_too_large" });
      return;
    }

    const body = await readBoundedBody(request, maxRequestBytes);
    if (body === undefined) {
      statusCode = 413;
      writeJson(response, statusCode, { error: "request_too_large" });
      return;
    }

    const webRequest = new Request(`http://planner.internal${url.pathname}`, {
      method: request.method,
      headers: toHeaders(request),
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body }),
    });
    const webResponse = await handleSmartPlannerGatewayRequest(webRequest, {
      apiKey,
      model: openAiModel,
      requestPolicy: {
        deliveryTargets: ["email_20mb"],
        qualityIntents: ["print"],
        speedPreferences: ["balanced"],
      },
      planPolicy: {
        allowedPresets: ["balanced"],
        localAvailable: true,
        officeAvailable: false,
        splitAllowed: true,
        officeEntitled: false,
      },
      maxRequestBytes,
      timeoutMs,
      authorize: (candidate) => {
        const authorization = candidate.headers.get("authorization") ?? "";
        const prefix = "Bearer ";
        return authorization.startsWith(prefix) &&
          secureEqual(authorization.slice(prefix.length), judgeAccessToken);
      },
      consumeRateLimit,
    });
    statusCode = webResponse.status;
    await forwardWebResponse(webResponse, response, requestId);
  } catch {
    statusCode = 500;
    if (!response.headersSent) {
      writeJson(response, statusCode, { error: "internal_error" });
    } else {
      response.destroy();
    }
  } finally {
    process.stdout.write(`${JSON.stringify({
      event: "http_request",
      requestId,
      route,
      method: request.method ?? "UNKNOWN",
      statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    })}\n`);
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`${JSON.stringify({
    event: "server_started",
    service: "smart-planner-gateway",
    port,
    maxRequestBytes,
    timeoutMs,
    rateLimitRequests,
    rateLimitWindowSeconds,
  })}\n`);
});

function shutdown(signal: string) {
  process.stdout.write(`${JSON.stringify({
    event: "server_stopping",
    service: "smart-planner-gateway",
    signal,
  })}\n`);
  server.close(() => process.exit(0));
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
