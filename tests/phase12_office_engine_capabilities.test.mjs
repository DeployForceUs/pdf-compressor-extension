import assert from "node:assert/strict";
import test from "node:test";

import { createCapabilitiesResponse } from "../engine/capabilities-contract.mjs";

const runtime = {
  effectiveCpuCount: 4,
  effectiveMemoryMb: 8192,
  measurement: "effective_runtime_limits",
  performanceCalibration: "not_calibrated",
};

test("reports ready Office Engine capabilities", () => {
  const response = createCapabilitiesResponse({
    processorVersion: "10.00.0",
    runtimeCapabilities: runtime,
    queueDepth: 0,
    activeJobs: 0,
  });

  assert.equal(response.schemaVersion, "1");
  assert.equal(response.availability, "ready");
  assert.equal(response.cpuCores, 4);
  assert.equal(response.memoryMb, 8192);
  assert.equal(response.queueDepth, 0);
  assert.equal(response.activeJobs, 0);
  assert.deepEqual(response.presets, ["balanced"]);
  assert.equal(response.ghostscriptVersion, "10.00.0");
  assert.equal(response.performanceCalibration, "not_calibrated");
});

test("reports busy when concurrency is saturated", () => {
  const response = createCapabilitiesResponse({
    processorVersion: "10.00.0",
    runtimeCapabilities: runtime,
    queueDepth: 2,
    activeJobs: 1,
  });

  assert.equal(response.availability, "busy");
  assert.equal(response.queueDepth, 2);
  assert.equal(response.activeJobs, 1);
});

test("reports unavailable when Ghostscript is missing", () => {
  const response = createCapabilitiesResponse({
    processorVersion: null,
    runtimeCapabilities: runtime,
  });

  assert.equal(response.availability, "unavailable");
  assert.deepEqual(response.presets, []);
  assert.equal(response.unavailableReason, "processor_unavailable");
});

test("includes a validated benchmark when calibration exists", () => {
  const response = createCapabilitiesResponse({
    processorVersion: "10.00.0",
    runtimeCapabilities: runtime,
    benchmark: {
      pagesPerMinute: 31.5,
      measuredAt: "2026-07-21T12:00:00.000Z",
      preset: "balanced",
    },
  });

  assert.equal(response.performanceCalibration, "calibrated");
  assert.deepEqual(response.benchmark, {
    pagesPerMinute: 31.5,
    measuredAt: "2026-07-21T12:00:00.000Z",
    preset: "balanced",
  });
});
