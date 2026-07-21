import type {
  BenchmarkStatus,
  LocalBenchmark,
  LocalCapabilities,
} from "../../../lib/ai-orchestrator/contracts";

export interface StoredLocalBenchmark {
  pagesPerMinute: number;
  measuredAt: string;
  engineVersion: string;
}

export interface LocalBenchmarkReader {
  read(): Promise<StoredLocalBenchmark | null>;
}

export interface NavigatorCapabilitiesSource {
  hardwareConcurrency?: number;
  platform?: string;
  userAgent?: string;
  deviceMemory?: number;
}

export interface LocalCapabilityCollectorOptions {
  benchmarkReader?: LocalBenchmarkReader;
  navigatorSource?: NavigatorCapabilitiesSource;
  currentEngineVersion?: string;
  benchmarkMaxAgeMs?: number;
  now?: () => Date;
  wasmSupported?: () => boolean;
}

const DEFAULT_BENCHMARK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

function readNavigatorSource(): NavigatorCapabilitiesSource | undefined {
  if (typeof navigator === "undefined") return undefined;

  const browserNavigator = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    hardwareConcurrency: browserNavigator.hardwareConcurrency,
    platform: browserNavigator.platform,
    userAgent: browserNavigator.userAgent,
    deviceMemory: browserNavigator.deviceMemory,
  };
}

function detectWasmSupport(): boolean {
  return (
    typeof WebAssembly === "object" &&
    typeof WebAssembly.instantiate === "function"
  );
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

function normalizeMemoryClass(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return undefined;
  }

  return value;
}

function inferBrowserPlatform(
  source: NavigatorCapabilitiesSource | undefined,
): string | undefined {
  const platform = source?.platform?.trim();
  if (platform) return platform;

  const userAgent = source?.userAgent ?? "";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ios/i.test(userAgent)) return "iOS";
  if (/linux/i.test(userAgent)) return "Linux";

  return undefined;
}

function benchmarkStatus(
  benchmark: StoredLocalBenchmark,
  currentEngineVersion: string | undefined,
  now: Date,
  benchmarkMaxAgeMs: number,
): BenchmarkStatus {
  const measuredAt = Date.parse(benchmark.measuredAt);
  if (!Number.isFinite(measuredAt)) return "stale";

  if (
    currentEngineVersion &&
    benchmark.engineVersion !== currentEngineVersion
  ) {
    return "stale";
  }

  if (now.getTime() - measuredAt > benchmarkMaxAgeMs) return "stale";

  return "measured";
}

async function collectBenchmark(
  options: LocalCapabilityCollectorOptions,
): Promise<LocalBenchmark> {
  if (!options.benchmarkReader) return { status: "missing" };

  try {
    const stored = await options.benchmarkReader.read();
    if (!stored) return { status: "missing" };

    const status = benchmarkStatus(
      stored,
      options.currentEngineVersion,
      (options.now ?? (() => new Date()))(),
      options.benchmarkMaxAgeMs ?? DEFAULT_BENCHMARK_MAX_AGE_MS,
    );

    return {
      status,
      pagesPerMinute:
        Number.isFinite(stored.pagesPerMinute) && stored.pagesPerMinute > 0
          ? stored.pagesPerMinute
          : undefined,
      measuredAt: stored.measuredAt,
      engineVersion: stored.engineVersion,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function collectLocalCapabilities(
  options: LocalCapabilityCollectorOptions = {},
): Promise<LocalCapabilities> {
  const source = options.navigatorSource ?? readNavigatorSource();
  const wasmSupported = (options.wasmSupported ?? detectWasmSupport)();
  const benchmark = await collectBenchmark(options);

  return {
    available: wasmSupported,
    logicalCores: normalizePositiveInteger(source?.hardwareConcurrency),
    memoryClassGb: normalizeMemoryClass(source?.deviceMemory),
    wasmSupported,
    browserPlatform: inferBrowserPlatform(source),
    benchmark,
  };
}
