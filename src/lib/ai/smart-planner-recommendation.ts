import {
  APPROVED_BALANCED_NUMERIC_POLICY,
  createProcessingPlanSchema,
  type ProcessingPlan,
  type SmartPlannerRequest,
  type SmartPlannerRequestPolicy,
  validateProcessingPlan,
  validateSmartPlannerRequest,
} from "./smart-planner-contract";

export const SMART_PLANNER_REQUEST_POLICY = {
  deliveryTargets: ["email_20mb"],
  qualityIntents: ["print"],
  speedPreferences: ["balanced"],
  allowInstruction: false,
} as const satisfies SmartPlannerRequestPolicy;

const LARGE_SCANNED_OFFICE_MIN_BYTES = 100 * 1024 * 1024;
const LARGE_SCANNED_OFFICE_MIN_RATIO = 0.8;

export type SmartPlannerGatewayRequest = {
  request: SmartPlannerRequest;
  responseSchema: Record<string, unknown>;
};

export type SmartPlannerGateway = (
  input: SmartPlannerGatewayRequest,
) => Promise<unknown>;

export type SmartPlannerRecommendationResult =
  | {
      status: "ready";
      plan: ProcessingPlan;
      executionAllowed: false;
      requiresUserConfirmation: true;
    }
  | {
      status: "blocked";
      reason: "invalid_request" | "gateway_error" | "invalid_plan";
      errors: readonly string[];
      executionAllowed: false;
      requiresUserConfirmation: true;
    };

function blocked(
  reason: Extract<SmartPlannerRecommendationResult, { status: "blocked" }>["reason"],
  errors: readonly string[],
): SmartPlannerRecommendationResult {
  return {
    status: "blocked",
    reason,
    errors: [...errors],
    executionAllowed: false,
    requiresUserConfirmation: true,
  };
}

function requiresOfficeForLargeScannedDocument(request: SmartPlannerRequest) {
  const { documentProfile, engineCapabilities } = request;
  const fileSizeMb = documentProfile.fileSizeBytes / (1024 * 1024);

  return engineCapabilities.officeAvailable
    && engineCapabilities.officeCpuCount > 0
    && engineCapabilities.officeMemoryGb > 0
    && fileSizeMb <= engineCapabilities.maxFileSizeMb
    && documentProfile.fileSizeBytes >= LARGE_SCANNED_OFFICE_MIN_BYTES
    && documentProfile.scannedPageRatio >= LARGE_SCANNED_OFFICE_MIN_RATIO;
}

function applyDeterministicEngineRouting(
  request: SmartPlannerRequest,
  plan: ProcessingPlan,
): ProcessingPlan {
  if (!requiresOfficeForLargeScannedDocument(request) || plan.engine === "office") {
    return plan;
  }

  return {
    ...plan,
    engine: "office",
    explanation: `${plan.explanation} Office Engine is required because this is a large, predominantly scanned document and a healthy controlled server is available.`,
  };
}

export async function requestSmartPlannerRecommendation(
  request: SmartPlannerRequest,
  gateway: SmartPlannerGateway,
): Promise<SmartPlannerRecommendationResult> {
  const validatedRequest = validateSmartPlannerRequest(request, SMART_PLANNER_REQUEST_POLICY);
  if (!validatedRequest.ok) {
    return blocked("invalid_request", validatedRequest.errors);
  }

  let rawPlan: unknown;
  try {
    rawPlan = await gateway({
      request: validatedRequest.value,
      responseSchema: createProcessingPlanSchema(validatedRequest.value.engineCapabilities.allowedPresets),
    });
  } catch (error) {
    return blocked("gateway_error", [
      error instanceof Error ? error.message : "Smart Planner gateway request failed",
    ]);
  }

  const validatedPlan = validateProcessingPlan(rawPlan, {
    allowedPresets: validatedRequest.value.engineCapabilities.allowedPresets,
    localAvailable: validatedRequest.value.engineCapabilities.localAvailable,
    officeAvailable: validatedRequest.value.engineCapabilities.officeAvailable,
    splitAllowed: validatedRequest.value.userGoal.splitAllowed,
    officeEntitled: validatedRequest.value.engineCapabilities.officeAvailable,
    numericPolicy: APPROVED_BALANCED_NUMERIC_POLICY,
  });

  if (!validatedPlan.ok) {
    return blocked("invalid_plan", validatedPlan.errors);
  }

  return {
    status: "ready",
    plan: applyDeterministicEngineRouting(validatedRequest.value, validatedPlan.value),
    executionAllowed: false,
    requiresUserConfirmation: true,
  };
}
