import { timingSafeEqual, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createServer,
  request as createUpstreamRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { performance } from "node:perf_hooks";

import { handleSmartPlannerGatewayRequest } from "../src/lib/ai/smart-planner-gateway";
import {
  APPROVED_BALANCED_NUMERIC_POLICY,
  type SmartPlannerEngineCapabilities,
} from "../src/lib/ai/smart-planner-contract";
import {
  createPlannerCapabilitiesFromOfficeHealth,
  parseOfficeEngineHealth,
} from "../src/lib/office/office-engine-client";

const DEFAULT_PORT = 8790;
const DEFAULT_MAX_REQUEST_BYTES = 32_768;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RATE_LIMIT_REQUESTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_OPENAI_MODEL = "gpt-5.6";
const DEFAULT_OFFICE_ENGINE_URL = "http://office-engine:8787";
const DEFAULT_OFFICE_PROXY_TIMEOUT_MS = 310_000;
const DEFAULT_OFFICE_HEALTH_TIMEOUT_MS = 3_000;
const OFFICE_ROUTE = /^\/api\/v1\/office\/(health|compress|jobs\/([0-9a-f-]+)(?:\/(result|cancel))?)$/i;

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

function readBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be true or false`);
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

function hasJudgeAuthorization(request: IncomingMessage, token: string) {
  const authorization = request.headers.authorization ?? "";
  const prefix = "Bearer ";
  return authorization.startsWith(prefix) &&
    secureEqual(authorization.slice(prefix.length), token);
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

function classifyOfficeProxyRequest(pathname: string, method: string | undefined) {
  const match = OFFICE_ROUTE.exec(pathname);
  if (!match) return null;

  const resource = match[1].toLowerCase();
  if (resource === "health") {
    return method === "GET" || method === "HEAD"
      ? { route: "office_health", upstreamPath: "/api/v1/health" }
      : { route: "office_health", allowed: "GET, HEAD" };
  }
  if (resource === "compress") {
    return method === "POST"
      ? { route: "office_compress", upstreamPath: "/api/v1/compress" }
      : { route: "office_compress", allowed: "POST" };
  }

  const jobId = match[2];
  const action = match[3]?.toLowerCase();
  if (action === "cancel") {
    return method === "POST"
      ? { route: "office_job_cancel", upstreamPath: `/api/v1/jobs/${jobId}/cancel` }
      : { route: "office_job_cancel", allowed: "POST" };
  }
  const suffix = action === "result" ? "/result" : "";
  return method === "GET" || method === "HEAD"
    ? {
        route: action === "result" ? "office_job_result" : "office_job_status",
        upstreamPath: `/api/v1/jobs/${jobId}${suffix}`,
      }
    : {
        route: action === "result" ? "office_job_result" : "office_job_status",
        allowed: "GET, HEAD",
      };
}

function proxyOfficeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  upstreamBaseUrl: URL,
  upstreamPath: string,
  timeout: number,
  requestId: string,
) {
  return new Promise<number>((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (typeof request.headers["content-type"] === "string") {
      headers["content-type"] = request.headers["content-type"];
    }
    if (typeof request.headers["content-length"] === "string") {
      headers["content-length"] = request.headers["content-length"];
    }

    const upstream = createUpstreamRequest(new URL(upstreamPath, upstreamBaseUrl), {
      method: request.method,
      headers,
      timeout,
    }, (upstreamResponse) => {
      const responseHeaders: Record<string, string> = {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-request-id": requestId,
      };
      for (const name of ["content-type", "content-length", "content-disposition", "x-result-kind"]) {
        const value = upstreamResponse.headers[name];
        if (typeof value === "string") responseHeaders[name] = value;
      }
      const status = upstreamResponse.statusCode ?? 502;
      response.writeHead(status, responseHeaders);
      upstreamResponse.on("error", reject);
      upstreamResponse.on("end", () => resolve(status));
      upstreamResponse.pipe(response);
    });

    upstream.on("timeout", () => upstream.destroy(new Error("office_engine_timeout")));
    upstream.on("error", reject);
    request.on("aborted", () => upstream.destroy(new Error("client_aborted")));
    request.pipe(upstream);
  });
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
const officeEngineEnabled = readBoolean("OFFICE_ENGINE_ENABLED", false);
const officeEngineUrl = new URL(process.env.OFFICE_ENGINE_URL?.trim() || DEFAULT_OFFICE_ENGINE_URL);
if (officeEngineUrl.protocol !== "http:") {
  throw new Error("OFFICE_ENGINE_URL must use http inside the private Docker network");
}
const officeProxyTimeoutMs = readPositiveInteger(
  "OFFICE_PROXY_TIMEOUT_MS",
  DEFAULT_OFFICE_PROXY_TIMEOUT_MS,
);

const unavailableOfficeCapabilities: SmartPlannerEngineCapabilities = {
  localAvailable: true,
  officeAvailable: false,
  officeCpuCount: 0,
  officeMemoryGb: 0,
  allowedPresets: ["balanced"],
  maxFileSizeMb: 1024,
};

async function resolveTrustedEngineCapabilities() {
  if (!officeEngineEnabled) return unavailableOfficeCapabilities;

  const timeout = AbortSignal.timeout(DEFAULT_OFFICE_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/api/v1/health", officeEngineUrl), {
      cache: "no-store",
      signal: timeout,
    });
    if (!response.ok) return unavailableOfficeCapabilities;
    const health = parseOfficeEngineHealth(await response.json());
    return createPlannerCapabilitiesFromOfficeHealth(health);
  } catch {
    return unavailableOfficeCapabilities;
  }
}
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
        officeEngineEnabled,
      });
      return;
    }

    const officeRequest = classifyOfficeProxyRequest(url.pathname, request.method);
    if (officeRequest) {
      route = officeRequest.route;
      if (!hasJudgeAuthorization(request, judgeAccessToken)) {
        request.resume();
        statusCode = 401;
        writeJson(response, statusCode, { error: "unauthorized" });
        return;
      }
      if (!officeEngineEnabled) {
        request.resume();
        statusCode = 503;
        writeJson(response, statusCode, { error: "office_engine_unavailable" });
        return;
      }
      if (!("upstreamPath" in officeRequest)) {
        request.resume();
        statusCode = 405;
        response.setHeader("allow", officeRequest.allowed);
        writeJson(response, statusCode, { error: "method_not_allowed" });
        return;
      }
      if (
        officeRequest.route === "office_compress" &&
        request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/pdf"
      ) {
        request.resume();
        statusCode = 415;
        writeJson(response, statusCode, { error: "unsupported_media_type" });
        return;
      }
      try {
        statusCode = await proxyOfficeRequest(
          request,
          response,
          officeEngineUrl,
          officeRequest.upstreamPath,
          officeProxyTimeoutMs,
          requestId,
        );
      } catch {
        statusCode = 502;
        if (!response.headersSent) {
          writeJson(response, statusCode, { error: "office_engine_unavailable" });
        } else {
          response.destroy();
        }
      }
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
        officeAvailable: officeEngineEnabled,
        splitAllowed: true,
        officeEntitled: officeEngineEnabled,
        numericPolicy: APPROVED_BALANCED_NUMERIC_POLICY,
      },
      maxRequestBytes,
      timeoutMs,
      authorize: (candidate) => {
        const authorization = candidate.headers.get("authorization") ?? "";
        const prefix = "Bearer ";
        return authorization.startsWith(prefix) && secureEqual(authorization.slice(prefix.length), judgeAccessToken);
      },
      consumeRateLimit,
      resolveEngineCapabilities: resolveTrustedEngineCapabilities,
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
