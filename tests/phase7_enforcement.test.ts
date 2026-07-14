import assert from "node:assert/strict";
import { createOperationAuthorizer } from "../src/lib/monetization/enforcement";
import type { UsageDecision } from "../src/lib/monetization/limits";

function allowedUsage(operation: "compression" | "split", remaining: number): UsageDecision {
  return {
    allowed: true,
    operation,
    remaining,
    retryAfterMs: 0,
    state: {
      version: 1,
      date: "2026-07-14",
      compressionCount: operation === "compression" ? 1 : 0,
      splitCount: operation === "split" ? 1 : 0,
      fingerprint: "fingerprint",
      lastOperationAt: 1,
    },
  };
}

{
  let reserveCalls = 0;
  const authorize = createOperationAuthorizer({
    checkLicense: async () => ({
      valid: true,
      claims: {
        iss: "pdf-compressor",
        aud: "pdf-compressor-extension",
        sub: "pro-license",
        iat: 1,
        plan: "pro",
        purchase: "one-time",
        version: 1,
      },
    }),
    reserveUsage: async (operation) => {
      reserveCalls += 1;
      return allowedUsage(operation, 0);
    },
  });

  assert.deepEqual(await authorize("compression"), {
    allowed: true,
    tier: "pro",
    operation: "compression",
    remaining: null,
  });
  assert.deepEqual(await authorize("split", { proRequired: true }), {
    allowed: true,
    tier: "pro",
    operation: "split",
    remaining: null,
  });
  assert.equal(reserveCalls, 0);
}

{
  let reserveCalls = 0;
  const authorize = createOperationAuthorizer({
    checkLicense: async () => ({ valid: false, code: "NO_LICENSE" }),
    reserveUsage: async (operation) => {
      reserveCalls += 1;
      return allowedUsage(operation, 2);
    },
  });
  assert.deepEqual(await authorize("compression"), {
    allowed: true,
    tier: "free",
    operation: "compression",
    remaining: 2,
  });
  assert.deepEqual(await authorize("split", { proRequired: true }), {
    allowed: false,
    code: "PRO_REQUIRED",
    operation: "split",
    remaining: 0,
    retryAfterMs: 0,
  });
  assert.equal(reserveCalls, 1, "A rejected Pro-only request must not consume Free usage");
}

{
  const authorize = createOperationAuthorizer({
    checkLicense: async () => ({ valid: false, code: "NO_LICENSE" }),
    reserveUsage: async (operation) => ({
      ...allowedUsage(operation, 3),
      allowed: false,
      reason: "COOLDOWN_ACTIVE",
      retryAfterMs: 7_500,
    }),
  });
  assert.deepEqual(await authorize("split"), {
    allowed: false,
    code: "FREE_COOLDOWN_ACTIVE",
    operation: "split",
    remaining: 3,
    retryAfterMs: 7_500,
  });
}

{
  const authorize = createOperationAuthorizer({
    checkLicense: async () => ({ valid: false, code: "INVALID_SIGNATURE" }),
    reserveUsage: async (operation) => ({
      ...allowedUsage(operation, 0),
      allowed: false,
      reason: "DAILY_LIMIT_REACHED",
      retryAfterMs: 0,
    }),
  });
  assert.deepEqual(await authorize("compression"), {
    allowed: false,
    code: "FREE_DAILY_LIMIT_REACHED",
    operation: "compression",
    remaining: 0,
    retryAfterMs: 0,
  });
}

console.log("phase7 operation enforcement assertions passed");
