import { readFileSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";

const MEBIBYTE = 1024 * 1024;
const CGROUP_V2_CPU_MAX = "/sys/fs/cgroup/cpu.max";
const CGROUP_V2_MEMORY_MAX = "/sys/fs/cgroup/memory.max";
const CGROUP_V1_CPU_QUOTA = "/sys/fs/cgroup/cpu/cpu.cfs_quota_us";
const CGROUP_V1_CPU_PERIOD = "/sys/fs/cgroup/cpu/cpu.cfs_period_us";
const CGROUP_V1_MEMORY_LIMIT = "/sys/fs/cgroup/memory/memory.limit_in_bytes";

function readOptional(path, readTextFile) {
  try {
    return readTextFile(path).trim();
  } catch {
    return null;
  }
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readCpuQuota(readTextFile) {
  const cpuMax = readOptional(CGROUP_V2_CPU_MAX, readTextFile);
  if (cpuMax) {
    const [quotaValue, periodValue] = cpuMax.split(/\s+/, 2);
    if (quotaValue !== "max") {
      const quota = positiveNumber(quotaValue);
      const period = positiveNumber(periodValue);
      if (quota !== null && period !== null) return quota / period;
    }
  }

  const quota = positiveNumber(readOptional(CGROUP_V1_CPU_QUOTA, readTextFile));
  const period = positiveNumber(readOptional(CGROUP_V1_CPU_PERIOD, readTextFile));
  return quota !== null && period !== null ? quota / period : null;
}

function readMemoryLimit(readTextFile) {
  for (const path of [CGROUP_V2_MEMORY_MAX, CGROUP_V1_MEMORY_LIMIT]) {
    const raw = readOptional(path, readTextFile);
    if (!raw || raw === "max") continue;
    const limit = positiveNumber(raw);
    if (limit !== null) return limit;
  }
  return null;
}

export function detectRuntimeCapabilities({
  hostCpuCount = availableParallelism(),
  hostMemoryBytes = totalmem(),
  readTextFile = (path) => readFileSync(path, "utf8"),
} = {}) {
  const normalizedHostCpu = positiveNumber(hostCpuCount) ?? 1;
  const normalizedHostMemory = positiveNumber(hostMemoryBytes) ?? MEBIBYTE;
  const cgroupCpu = readCpuQuota(readTextFile);
  const cgroupMemory = readMemoryLimit(readTextFile);

  // Health reports the actual fractional quota when present. The Planner
  // adapter separately rounds down because its current contract uses integers.
  const effectiveCpuCount = Number(
    Math.min(normalizedHostCpu, cgroupCpu ?? normalizedHostCpu).toFixed(3),
  );
  const effectiveMemoryMb = Math.max(
    1,
    Math.floor(Math.min(normalizedHostMemory, cgroupMemory ?? normalizedHostMemory) / MEBIBYTE),
  );

  return {
    effectiveCpuCount,
    effectiveMemoryMb,
    measurement: "effective_runtime_limits",
    performanceCalibration: "not_calibrated",
  };
}
