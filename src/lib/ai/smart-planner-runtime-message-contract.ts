import type { SmartPlannerEngineCapabilities, SmartPlannerGoal } from "./smart-planner-contract";
import type { SmartPlannerRuntimePreparationResponse } from "./smart-planner-runtime-preparation";

export const SMART_PLANNER_BACKGROUND_PREPARE = "background:smart-planner-prepare" as const;
export const SMART_PLANNER_OFFSCREEN_PREPARE = "offscreen:smart-planner-prepare" as const;

export type SmartPlannerPreparePayload = {
  requestId: string;
  userGoal: SmartPlannerGoal;
  engineCapabilities: SmartPlannerEngineCapabilities;
};

export type BackgroundSmartPlannerPrepareRequest = SmartPlannerPreparePayload & {
  type: typeof SMART_PLANNER_BACKGROUND_PREPARE;
};

export type OffscreenSmartPlannerPrepareRequest = SmartPlannerPreparePayload & {
  type: typeof SMART_PLANNER_OFFSCREEN_PREPARE;
};

export type SmartPlannerPrepareResponse = SmartPlannerRuntimePreparationResponse;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isGoal(value: unknown): value is SmartPlannerGoal {
  if (!isObject(value)) return false;
  return typeof value.deliveryTarget === "string"
    && typeof value.qualityIntent === "string"
    && typeof value.speedPreference === "string"
    && typeof value.splitAllowed === "boolean"
    && (value.instruction === undefined || typeof value.instruction === "string");
}

function isCapabilities(value: unknown): value is SmartPlannerEngineCapabilities {
  if (!isObject(value)) return false;
  return typeof value.localAvailable === "boolean"
    && typeof value.officeAvailable === "boolean"
    && isFiniteNonNegative(value.officeCpuCount)
    && isFiniteNonNegative(value.officeMemoryGb)
    && Array.isArray(value.allowedPresets)
    && value.allowedPresets.every((preset) => typeof preset === "string")
    && isFiniteNonNegative(value.maxFileSizeMb);
}

function isPreparePayload(value: unknown): value is SmartPlannerPreparePayload {
  if (!isObject(value)) return false;
  return typeof value.requestId === "string"
    && value.requestId.length > 0
    && isGoal(value.userGoal)
    && isCapabilities(value.engineCapabilities);
}

export function isBackgroundSmartPlannerPrepareRequest(
  value: unknown,
): value is BackgroundSmartPlannerPrepareRequest {
  return isObject(value)
    && value.type === SMART_PLANNER_BACKGROUND_PREPARE
    && isPreparePayload(value);
}

export function isOffscreenSmartPlannerPrepareRequest(
  value: unknown,
): value is OffscreenSmartPlannerPrepareRequest {
  return isObject(value)
    && value.type === SMART_PLANNER_OFFSCREEN_PREPARE
    && isPreparePayload(value);
}

export function toOffscreenSmartPlannerPrepareRequest(
  request: BackgroundSmartPlannerPrepareRequest,
): OffscreenSmartPlannerPrepareRequest {
  return {
    type: SMART_PLANNER_OFFSCREEN_PREPARE,
    requestId: request.requestId,
    userGoal: {
      deliveryTarget: request.userGoal.deliveryTarget,
      qualityIntent: request.userGoal.qualityIntent,
      speedPreference: request.userGoal.speedPreference,
      splitAllowed: request.userGoal.splitAllowed,
      ...(request.userGoal.instruction === undefined ? {} : { instruction: request.userGoal.instruction }),
    },
    engineCapabilities: {
      localAvailable: request.engineCapabilities.localAvailable,
      officeAvailable: request.engineCapabilities.officeAvailable,
      officeCpuCount: request.engineCapabilities.officeCpuCount,
      officeMemoryGb: request.engineCapabilities.officeMemoryGb,
      allowedPresets: [...request.engineCapabilities.allowedPresets],
      maxFileSizeMb: request.engineCapabilities.maxFileSizeMb,
    },
  };
}
