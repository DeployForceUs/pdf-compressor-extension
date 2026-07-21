import type { SmartPlannerApiResult } from "./smart-planner-api-client";
import type { SmartPlannerRequest } from "./smart-planner-contract";
import {
  requestSmartPlannerRecommendation,
  type SmartPlannerRecommendationResult,
} from "./smart-planner-recommendation";

export type SmartPlannerPlanClient = {
  createPlan(request: SmartPlannerRequest, signal?: AbortSignal): Promise<SmartPlannerApiResult>;
};

export async function requestSmartPlannerRecommendationWithClient(
  request: SmartPlannerRequest,
  client: SmartPlannerPlanClient,
  signal?: AbortSignal,
): Promise<SmartPlannerRecommendationResult> {
  return requestSmartPlannerRecommendation(request, async () => {
    const response = await client.createPlan(request, signal);
    if (response.kind !== "plan") {
      throw new Error(response.reason || "Smart Planner returned a fallback");
    }
    return response.plan;
  });
}
