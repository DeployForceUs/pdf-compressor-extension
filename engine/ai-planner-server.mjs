import { createServer } from "node:http";

import { createPlannerRecommendation } from "./ai-planner-service.mjs";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};
const MAX_REQUEST_BYTES = 256 * 1024;

function writeJson(response, statusCode, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    "content-length": Buffer.byteLength(serialized),
  });
  response.end(serialized);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw Object.assign(new Error("request_too_large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { statusCode: 400 });
  }
}

export function createAiPlannerServer({ planner = createPlannerRecommendation } = {}) {
  return createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "POST, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://ai-planner.invalid");
    if (url.pathname !== "/api/v1/ai/plan") {
      request.resume();
      writeJson(response, 404, { error: "not_found" });
      return;
    }
    if (request.method !== "POST") {
      request.resume();
      response.setHeader("allow", "POST");
      writeJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    if (request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      request.resume();
      writeJson(response, 415, { error: "unsupported_media_type" });
      return;
    }

    try {
      const plannerRequest = await readJson(request);
      const result = await planner(plannerRequest);
      writeJson(response, 200, result);
    } catch (error) {
      writeJson(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
        error: typeof error?.message === "string" ? error.message : "invalid_request",
      });
    }
  });
}

function parsePort(value) {
  if (value === undefined) return 8791;
  if (!/^\d+$/.test(value)) throw new Error("AI_PLANNER_PORT must be an integer");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("AI_PLANNER_PORT must be between 1 and 65535");
  return port;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parsePort(process.env.AI_PLANNER_PORT);
  const server = createAiPlannerServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`${JSON.stringify({ event: "server_started", service: "ai-planner", port })}\n`);
  });
}
