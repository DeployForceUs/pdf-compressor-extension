import type { PdfRecord } from "../messaging";
import type { ContentBlindProfilerRequest, ContentBlindProfilerResult } from "./content-blind-pdf-profiler";
import {
  prepareSmartPlannerRequestForSelectedPdf,
  type SmartPlannerRequestPreparation,
} from "./smart-planner-request-preparation";
import type {
  SmartPlannerEngineCapabilities,
  SmartPlannerGoal,
} from "./smart-planner-contract";

export type SmartPlannerRuntimePreparationInput = {
  requestId: string;
  userGoal: SmartPlannerGoal;
  engineCapabilities: SmartPlannerEngineCapabilities;
  mupdfRuntimeUrl: string;
};

export type SmartPlannerRuntimePreparationDependencies = {
  readSelectedPdf: () => Promise<PdfRecord | null>;
  profilePdf: (
    request: ContentBlindProfilerRequest,
    isCancelled: () => boolean | Promise<boolean>,
  ) => Promise<ContentBlindProfilerResult>;
  isCancelled?: () => boolean | Promise<boolean>;
};

export type SmartPlannerRuntimePreparationResponse =
  | {
      ok: true;
      preparation: SmartPlannerRequestPreparation;
      executionAllowed: false;
      requiresUserConfirmation: true;
    }
  | {
      ok: false;
      error: "NO_SELECTED_PDF" | "CANCELLED";
      message: string;
      executionAllowed: false;
      requiresUserConfirmation: true;
    };

async function cancelled(check: () => boolean | Promise<boolean>) {
  return Boolean(await check());
}

export async function prepareSmartPlannerRuntimeRequest(
  input: SmartPlannerRuntimePreparationInput,
  dependencies: SmartPlannerRuntimePreparationDependencies,
): Promise<SmartPlannerRuntimePreparationResponse> {
  const isCancelled = dependencies.isCancelled ?? (() => false);

  if (await cancelled(isCancelled)) {
    return {
      ok: false,
      error: "CANCELLED",
      message: "Smart Planner preparation was cancelled",
      executionAllowed: false,
      requiresUserConfirmation: true,
    };
  }

  const selectedPdf = await dependencies.readSelectedPdf();
  if (!selectedPdf) {
    return {
      ok: false,
      error: "NO_SELECTED_PDF",
      message: "No selected PDF record is available",
      executionAllowed: false,
      requiresUserConfirmation: true,
    };
  }

  if (await cancelled(isCancelled)) {
    return {
      ok: false,
      error: "CANCELLED",
      message: "Smart Planner preparation was cancelled",
      executionAllowed: false,
      requiresUserConfirmation: true,
    };
  }

  const preparation = await prepareSmartPlannerRequestForSelectedPdf(
    {
      selectedPdf,
      mupdfRuntimeUrl: input.mupdfRuntimeUrl,
      requestId: input.requestId,
      userGoal: input.userGoal,
      engineCapabilities: input.engineCapabilities,
    },
    dependencies.profilePdf,
    isCancelled,
  );

  return {
    ok: true,
    preparation,
    executionAllowed: false,
    requiresUserConfirmation: true,
  };
}
