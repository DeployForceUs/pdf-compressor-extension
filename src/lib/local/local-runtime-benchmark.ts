import browser from "webextension-polyfill";

const STORAGE_KEY = "localRuntimeBenchmarkV2";
const BUFFER_SIZE_BYTES = 8 * 1024 * 1024;
const SAMPLE_COUNT = 5;

export type LocalRuntimeBenchmarkResult = {
  version: 2;
  measuredAt: string;
  bufferSizeBytes: number;
  sampleCount: number;
  medianDurationMs: number;
  throughputMbPerSecond: number;
  checksum: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function createSourceBuffer() {
  const source = new Uint8Array(BUFFER_SIZE_BYTES);
  for (let index = 0; index < source.length; index += 1) {
    source[index] = (index * 31 + (index >>> 8)) & 0xff;
  }
  return source;
}

function transformBuffer(source: Uint8Array, destination: Uint8Array) {
  let checksum = 0;
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index] ^ ((index * 17) & 0xff);
    destination[index] = value;
    checksum = (checksum + value) >>> 0;
  }
  return checksum;
}

export async function runLocalRuntimeBenchmark(): Promise<LocalRuntimeBenchmarkResult> {
  const source = createSourceBuffer();
  const destination = new Uint8Array(BUFFER_SIZE_BYTES);
  const durations: number[] = [];
  let checksum = 0;

  transformBuffer(source, destination);

  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const startedAt = performance.now();
    checksum ^= transformBuffer(source, destination);
    durations.push(performance.now() - startedAt);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  const medianDurationMs = median(durations);
  const throughputMbPerSecond = (BUFFER_SIZE_BYTES / (1024 * 1024)) / (medianDurationMs / 1000);
  const result: LocalRuntimeBenchmarkResult = {
    version: 2,
    measuredAt: new Date().toISOString(),
    bufferSizeBytes: BUFFER_SIZE_BYTES,
    sampleCount: SAMPLE_COUNT,
    medianDurationMs,
    throughputMbPerSecond,
    checksum,
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
    candidate.version !== 2
    || typeof candidate.measuredAt !== "string"
    || typeof candidate.bufferSizeBytes !== "number"
    || typeof candidate.sampleCount !== "number"
    || typeof candidate.medianDurationMs !== "number"
    || typeof candidate.throughputMbPerSecond !== "number"
    || typeof candidate.checksum !== "number"
  ) {
    return null;
  }

  return candidate as LocalRuntimeBenchmarkResult;
}
