import type { LocalCapabilities } from "../../../lib/ai-orchestrator/contracts";
import {
  collectLocalCapabilities,
  type LocalCapabilityCollectorOptions,
} from "./local-capability-collector";

export interface LocalCapabilityPreflightResult {
  ok: boolean;
  capabilities: LocalCapabilities;
  warnings: readonly string[];
}

export async function runLocalCapabilityPreflight(
  options: LocalCapabilityCollectorOptions = {},
): Promise<LocalCapabilityPreflightResult> {
  const capabilities = await collectLocalCapabilities(options);
  const warnings: string[] = [];

  if (!capabilities.wasmSupported) {
    warnings.push("WebAssembly is unavailable on this device.");
  }

  if (capabilities.logicalCores === undefined) {
    warnings.push("Logical CPU count is unavailable in this browser.");
  }

  if (capabilities.memoryClassGb === undefined) {
    warnings.push("Browser memory class is unavailable.");
  }

  if (capabilities.benchmark.status === "missing") {
    warnings.push("No saved local benchmark is available.");
  } else if (capabilities.benchmark.status === "stale") {
    warnings.push("The saved local benchmark requires recalibration.");
  } else if (capabilities.benchmark.status === "unavailable") {
    warnings.push("The saved local benchmark could not be read.");
  }

  const result: LocalCapabilityPreflightResult = {
    ok: capabilities.available,
    capabilities,
    warnings,
  };

  console.debug("AI Lab local capability preflight", result);
  return result;
}
