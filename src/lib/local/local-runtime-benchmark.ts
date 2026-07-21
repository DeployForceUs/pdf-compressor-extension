import browser from "webextension-polyfill";

const STORAGE_KEY = "localRuntimeBenchmarkV1";
const TARGET_DURATION_MS = 300;

export type LocalRuntimeBenchmarkTier = "slow" | "moderate" | "fast";

export type LocalRuntimeBenchmarkResult = {
  version: 1;
  measuredAt: string;
  durationMs: number;
  iterations: number;
  operationsPerMs: number;
  tier: LocalRuntimeBenchmarkTier;
};

function classify(operationsPerMs: number): LocalRuntimeBenchmarkTier {
  if (operationsPerMs >= 35_000) return "fast";
  if (operationsPerMs >= 15_000) return "moderate";
  return "slow";
}

function runWorkload(iterations: number) {
  let value = 0x12345678;
  for (let index = 0; index < iterations; index += 1) {
    value = Math.imul(value ^ index, 1664525) + 1013904223;
    value ^= value >>> 13;
  }
  return value;
}

export async function runLocalRuntimeBenchmark(): Promise<LocalRuntimeBenchmarkResult> {
  let iterations = 1_000_000;
  let durationMs = 0;

  do {
    const startedAt = performance.now();
    runWorkload(iterations);
    durationMs = performance.now() - startedAt;
    if (durationMs < TARGET_DURATION_MS) iterations *= 2;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } while (durationMs < TARGET_DURATION_MS);

  const operationsPerMs = iterations / durationMs;
  const result: LocalRuntimeBenchmarkResult = {
    version: 1,
    measuredAt: new Date().toISOString(),
    durationMs,
    iterations,
    operationsPerMs,
    tier: classify(operationsPerMs),
  };

  await browser.storage.local.set({ [STORAGE_KEY]: result });
  return result;
}

export async function readLocalRuntimeBenchmark(): Promise<LocalRuntimeBenchmarkResult | null> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<LocalRuntimeBenchmarkResult>;
  if (
    candidate.version !== 1
    || typeof candidate.measuredAt !== "string"
    || typeof candidate.durationMs !== "number"
    || typeof candidate.iterations !== "number"
    || typeof candidate.operationsPerMs !== "number"
    || !["slow", "moderate", "fast"].includes(candidate.tier ?? "")
  ) {
    return null;
  }

  return candidate as LocalRuntimeBenchmarkResult;
}
