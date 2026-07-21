import type { PdfRecord } from "../messaging";
import type { ContentBlindProfilerRequest, ContentBlindProfilerResult } from "./content-blind-pdf-profiler";
import type {
  SmartPlannerEngineCapabilities,
  SmartPlannerGoal,
  SmartPlannerRequest,
} from "./smart-planner-contract";
import { SMART_PLANNER_SCHEMA_VERSION } from "./smart-planner-contract";

export type SmartPlannerProfiler = (
  request: ContentBlindProfilerRequest,
  isCancelled: () => boolean | Promise<boolean>,
) => Promise<ContentBlindProfilerResult>;

export type PrepareSmartPlannerRequestInput = {
  selectedPdf: PdfRecord;
  mupdfRuntimeUrl: string;
  requestId: string;
  userGoal: SmartPlannerGoal;
  engineCapabilities: SmartPlannerEngineCapabilities;
};

export type SmartPlannerRequestPreparation =
  | {
      status: "ready";
      request: SmartPlannerRequest;
      executionAllowed: false;
      requiresUserConfirmation: true;
    }
  | {
      status: "blocked";
      reason: "incomplete_document_profile";
      unavailableMetrics: ContentBlindProfilerResult["unavailableMetrics"];
      derivedMetrics: ContentBlindProfilerResult["derivedMetrics"];
      executionAllowed: false;
      requiresUserConfirmation: true;
    };

function copyGoal(goal: SmartPlannerGoal): SmartPlannerGoal {
  return {
    deliveryTarget: goal.deliveryTarget,
    qualityIntent: goal.qualityIntent,
    speedPreference: goal.speedPreference,
    splitAllowed: goal.splitAllowed,
    ...(goal.instruction === undefined ? {} : { instruction: goal.instruction }),
  };
}

function copyCapabilities(capabilities: SmartPlannerEngineCapabilities): SmartPlannerEngineCapabilities {
  return {
    localAvailable: capabilities.localAvailable,
    officeAvailable: capabilities.officeAvailable,
    officeCpuCount: capabilities.officeCpuCount,
    officeMemoryGb: capabilities.officeMemoryGb,
    allowedPresets: [...capabilities.allowedPresets],
    maxFileSizeMb: capabilities.maxFileSizeMb,
  };
}

export async function prepareSmartPlannerRequestForSelectedPdf(
  input: PrepareSmartPlannerRequestInput,
  profilePdf: SmartPlannerProfiler,
  isCancelled: () => boolean | Promise<boolean> = () => false,
): Promise<SmartPlannerRequestPreparation> {
  const profilerResult = await profilePdf(
    {
      input: Uint8Array.from(input.selectedPdf.data).buffer,
      mupdfRuntimeUrl: input.mupdfRuntimeUrl,
    },
    isCancelled,
  );

  if (profilerResult.status === "incomplete") {
    return {
      status: "blocked",
      reason: "incomplete_document_profile",
      unavailableMetrics: [...profilerResult.unavailableMetrics],
      derivedMetrics: {
        fileSizeBytes: profilerResult.derivedMetrics.fileSizeBytes,
        pageCount: profilerResult.derivedMetrics.pageCount,
        imageObjectCount: profilerResult.derivedMetrics.imageObjectCount,
        codecCounts: { ...profilerResult.derivedMetrics.codecCounts },
        pageImageStreamSizeDistributionBytes: {
          ...profilerResult.derivedMetrics.pageImageStreamSizeDistributionBytes,
        },
      },
      executionAllowed: false,
      requiresUserConfirmation: true,
    };
  }

  const request: SmartPlannerRequest = {
    schemaVersion: SMART_PLANNER_SCHEMA_VERSION,
    requestId: input.requestId,
    userGoal: copyGoal(input.userGoal),
    documentProfile: profilerResult.documentProfile,
    engineCapabilities: copyCapabilities(input.engineCapabilities),
  };

  return {
    status: "ready",
    request,
    executionAllowed: false,
    requiresUserConfirmation: true,
  };
}
