import type {
  ComputeSnapshot,
  DocumentProfile,
  PlannerRequest,
  UserGoal,
} from "../../../lib/ai-orchestrator/contracts";
import {
  collectLocalCapabilities,
  type LocalCapabilityCollectorOptions,
} from "./local-capability-collector";
import {
  fetchOfficeCapabilities,
  type OfficeCapabilityClientOptions,
} from "./office-capability-client";
import { getApprovedCapacityCatalog } from "./capacity-catalog";
import { buildPlannerRequest } from "./planner-request-builder";

export interface ComputeOrchestratorOptions {
  documentProfile: DocumentProfile;
  userGoal: UserGoal;
  local?: LocalCapabilityCollectorOptions;
  office: OfficeCapabilityClientOptions;
  now?: () => Date;
}

export interface ComputeOrchestratorResult {
  computeSnapshot: ComputeSnapshot;
  plannerRequest: PlannerRequest;
}

export async function prepareComputeOrchestration(
  options: ComputeOrchestratorOptions,
): Promise<ComputeOrchestratorResult> {
  const [localCapabilities, officeCapabilities] = await Promise.all([
    collectLocalCapabilities(options.local),
    fetchOfficeCapabilities(options.office),
  ]);

  const computeSnapshot: ComputeSnapshot = {
    local: localCapabilities,
    office: officeCapabilities,
    capacityCatalog: getApprovedCapacityCatalog(),
    collectedAt: (options.now ?? (() => new Date()))().toISOString(),
  };

  return {
    computeSnapshot,
    plannerRequest: buildPlannerRequest({
      documentProfile: options.documentProfile,
      userGoal: options.userGoal,
      computeSnapshot,
    }),
  };
}
