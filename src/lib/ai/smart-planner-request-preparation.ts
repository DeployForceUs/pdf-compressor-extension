import type { PdfRecord } from "../messaging";
import type { ContentBlindProfilerRequest, ContentBlindProfilerResult } from "./content-blind-pdf-profiler";
import type { SmartPlannerEngineCapabilities, SmartPlannerGoal } from "./smart-planner-contract";

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

export type SmartPlannerRequestPreparation = {
  status: "blocked";
  reason: "incomplete_document_profile";
  unavailableMetrics: ContentBlindProfilerResult["unavailableMetrics"];
  derivedMetrics: ContentBlindProfilerResult["derivedMetrics"];
  executionAllowed: false;
  requiresUserConfirmation: true;
};

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
