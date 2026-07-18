import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoint = process.argv[2] ?? "http://127.0.0.1:8790/api/v1/plans";
const fixturePath = resolve(
  process.argv[3] ?? "fixtures/planner/content-free-request.json",
);
const tokenPath = resolve(
  process.env.JUDGE_ACCESS_TOKEN_SECRET_PATH ??
    "/etc/pdf-office-engine/secrets/judge_access_token",
);

const [body, token] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(tokenPath, "utf8"),
]);

const startedAt = performance.now();
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token.trim()}`,
    "content-type": "application/json",
  },
  body,
});
const responseText = await response.text();

process.stdout.write(`${JSON.stringify({
  status: response.status,
  durationMs: Math.round(performance.now() - startedAt),
  requestId: response.headers.get("x-request-id"),
  response: JSON.parse(responseText),
}, null, 2)}\n`);

if (!response.ok) process.exitCode = 1;
