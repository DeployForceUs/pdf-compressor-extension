import type {
  DocumentProfile,
  PlannerRequest,
  UserGoal,
} from "../../../lib/ai-orchestrator/contracts";
import { prepareComputeOrchestration } from "./compute-orchestrator";

const DOCUMENT_PROFILE: DocumentProfile = {
  pageCount: 220,
  fileSizeBytes: 5_500_000,
  imageObjectCount: 220,
  scannedRatio: 0.9,
  textRatio: 0.1,
  vectorRatio: 0,
  complexitySignals: ["image_heavy", "large_page_count"],
};

const ALL_GOALS: readonly UserGoal[] = [
  { kind: "email", targetSizeMb: 20 },
  { kind: "portal", targetSizeMb: 50 },
  { kind: "print", quality: "high" },
  { kind: "archive", preference: "preserve_quality" },
  { kind: "reduce_size", compressionIntent: "balanced" },
  { kind: "custom", requirement: "Keep diagrams readable" },
];

function officeResponse(): Response {
  return new Response(
    JSON.stringify({
      schemaVersion: "1",
      availability: "ready",
      cpuCores: 4,
      memoryMb: 16_384,
      engineMemoryLimitMb: 16_384,
      queueDepth: 0,
      activeJobs: 0,
      maxConcurrentJobs: 1,
      ghostscriptVersion: "10.05.1",
      maxFileSizeMb: 1_024,
      presets: ["balanced"],
      runtimeMeasurement: "effective_runtime_limits",
      performanceCalibration: "not_calibrated",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

export async function runComputeOrchestratorPreflight(): Promise<
  readonly PlannerRequest[]
> {
  const requests: PlannerRequest[] = [];

  for (const userGoal of ALL_GOALS) {
    const result = await prepareComputeOrchestration({
      documentProfile: DOCUMENT_PROFILE,
      userGoal,
      local: {
        navigatorSource: {
          hardwareConcurrency: 8,
          deviceMemory: 8,
          platform: "MacIntel",
        },
        wasmSupported: () => true,
        benchmarkReader: {
          async read() {
            return null;
          },
        },
      },
      office: {
        baseUrl: "https://office-engine.invalid",
        fetchImpl: async () => officeResponse(),
      },
      now: () => new Date("2026-07-21T16:00:00.000Z"),
    });

    if (result.computeSnapshot.local.logicalCores !== 8) {
      throw new Error("local_capabilities_missing");
    }

    if (result.computeSnapshot.office.availability !== "ready") {
      throw new Error("office_capabilities_missing");
    }

    if (result.computeSnapshot.capacityCatalog.length !== 3) {
      throw new Error("capacity_catalog_missing");
    }

    if (result.plannerRequest.userGoal.kind !== userGoal.kind) {
      throw new Error("goal_not_preserved");
    }

    requests.push(result.plannerRequest);
  }

  if (new Set(requests.map((request) => request.userGoal.kind)).size !== 6) {
    throw new Error("not_all_goal_branches_covered");
  }

  return requests;
}
