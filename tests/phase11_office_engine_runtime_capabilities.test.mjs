import assert from "node:assert/strict";
import test from "node:test";

import { detectRuntimeCapabilities } from "../engine/runtime-capabilities.mjs";

function reader(files) {
  return (path) => {
    if (!(path in files)) throw new Error("missing fixture path");
    return files[path];
  };
}

test("effective capacity uses lower cgroup limits instead of host totals", () => {
  const runtime = detectRuntimeCapabilities({
    hostCpuCount: 4,
    hostMemoryBytes: 8 * 1024 ** 3,
    readTextFile: reader({
      "/sys/fs/cgroup/cpu.max": "100000 100000\n",
      "/sys/fs/cgroup/memory.max": `${1536 * 1024 ** 2}\n`,
    }),
  });

  assert.deepEqual(runtime, {
    effectiveCpuCount: 1,
    effectiveMemoryMb: 1536,
    measurement: "effective_runtime_limits",
    performanceCalibration: "not_calibrated",
  });
});

test("effective capacity never exceeds a smaller resized host", () => {
  const runtime = detectRuntimeCapabilities({
    hostCpuCount: 1,
    hostMemoryBytes: 2 * 1024 ** 3,
    readTextFile: reader({
      "/sys/fs/cgroup/cpu.max": "300000 100000\n",
      "/sys/fs/cgroup/memory.max": `${5 * 1024 ** 3}\n`,
    }),
  });

  assert.equal(runtime.effectiveCpuCount, 1);
  assert.equal(runtime.effectiveMemoryMb, 2048);
  assert.equal(runtime.performanceCalibration, "not_calibrated");
});

test("host capacity is the fallback when cgroup files are unavailable", () => {
  const runtime = detectRuntimeCapabilities({
    hostCpuCount: 2,
    hostMemoryBytes: 4 * 1024 ** 3,
    readTextFile: () => {
      throw new Error("cgroup unavailable");
    },
  });

  assert.equal(runtime.effectiveCpuCount, 2);
  assert.equal(runtime.effectiveMemoryMb, 4096);
});

test("health preserves a fractional CPU quota instead of overstating it", () => {
  const runtime = detectRuntimeCapabilities({
    hostCpuCount: 4,
    hostMemoryBytes: 8 * 1024 ** 3,
    readTextFile: reader({
      "/sys/fs/cgroup/cpu.max": "50000 100000\n",
      "/sys/fs/cgroup/memory.max": `${1024 ** 3}\n`,
    }),
  });

  assert.equal(runtime.effectiveCpuCount, 0.5);
  assert.equal(runtime.effectiveMemoryMb, 1024);
});
