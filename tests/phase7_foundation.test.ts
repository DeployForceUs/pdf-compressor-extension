import assert from "node:assert/strict";
import { hashFingerprintSource } from "../src/lib/monetization/fingerprint";
import {
  createUsageLimitService,
  type DailyUsageState,
  type UsageStorage,
} from "../src/lib/monetization/limits";
import { STAGE_7_MVP_POLICY } from "../src/lib/monetization/policy";

function createMemoryStorage(): UsageStorage & { read: () => DailyUsageState | null } {
  let state: DailyUsageState | null = null;
  return {
    get: async () => structuredClone(state),
    set: async (_key, value) => {
      state = structuredClone(value);
    },
    read: () => structuredClone(state),
  };
}

{
  assert.equal(STAGE_7_MVP_POLICY.proPriceUsd, 29);
  assert.equal(STAGE_7_MVP_POLICY.dailyCompressionLimit, 3);
  assert.equal(STAGE_7_MVP_POLICY.dailySplitLimit, 10);
  assert.equal(STAGE_7_MVP_POLICY.operationCooldownMs, 10_000);
  assert.equal(STAGE_7_MVP_POLICY.licenseBinding, "none");
  assert.equal(STAGE_7_MVP_POLICY.licenseServerRequired, false);
}

{
  const source = {
    extensionId: "extension-id",
    userAgent: "browser",
    language: "en-US",
    colorDepth: 24,
    screenWidth: 1920,
    screenHeight: 1080,
    timezoneOffset: 0,
  };
  const first = await hashFingerprintSource(source);
  const second = await hashFingerprintSource(source);
  const changed = await hashFingerprintSource({ ...source, extensionId: "other-extension" });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, changed);
}

{
  const storage = createMemoryStorage();
  let timestamp = Date.UTC(2026, 6, 14, 12);
  const service = createUsageLimitService({
    storage,
    getFingerprint: async () => "fingerprint",
    now: () => timestamp,
  });

  const first = await service.reserve("compression");
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(storage.read()?.fingerprint, "fingerprint");

  const cooldown = await service.reserve("split");
  assert.equal(cooldown.allowed, false);
  if (!cooldown.allowed) {
    assert.equal(cooldown.reason, "COOLDOWN_ACTIVE");
    assert.equal(cooldown.retryAfterMs, 10_000);
  }

  timestamp += 10_000;
  assert.equal((await service.reserve("compression")).allowed, true);
  timestamp += 10_000;
  const third = await service.reserve("compression");
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  timestamp += 10_000;
  const exhausted = await service.reserve("compression");
  assert.equal(exhausted.allowed, false);
  if (!exhausted.allowed) {
    assert.equal(exhausted.reason, "DAILY_LIMIT_REACHED");
  }

  const split = await service.reserve("split");
  assert.equal(split.allowed, true);
  assert.equal(split.remaining, 9);

  timestamp = Date.UTC(2026, 6, 15, 0);
  const nextDay = await service.reserve("compression");
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.remaining, 2);
  assert.equal(nextDay.state.date, "2026-07-15");
}

{
  const storage = createMemoryStorage();
  const service = createUsageLimitService({
    storage,
    getFingerprint: async () => "fingerprint",
    now: () => Date.UTC(2026, 6, 14, 12),
  });
  const decisions = await Promise.all([
    service.reserve("compression"),
    service.reserve("split"),
  ]);
  assert.equal(decisions.filter((decision) => decision.allowed).length, 1);
  assert.equal(decisions.filter((decision) => !decision.allowed).length, 1);
}

console.log("phase7 monetization foundation assertions passed");
