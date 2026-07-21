import type { CapacityProfile } from "../../../lib/ai-orchestrator/contracts";

export const APPROVED_CAPACITY_CATALOG = Object.freeze([
  {
    id: "small",
    cpuCores: 2,
    memoryMb: 4_096,
    label: "2 vCPU · 4 GB RAM",
  },
  {
    id: "medium",
    cpuCores: 4,
    memoryMb: 8_192,
    label: "4 vCPU · 8 GB RAM",
  },
  {
    id: "large",
    cpuCores: 8,
    memoryMb: 16_384,
    label: "8 vCPU · 16 GB RAM",
  },
] satisfies readonly CapacityProfile[]);

export function getApprovedCapacityCatalog(): readonly CapacityProfile[] {
  return APPROVED_CAPACITY_CATALOG;
}
