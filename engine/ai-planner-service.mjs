import {
  createDeterministicPlannerFallback,
  validatePlannerRequest,
  validatePlannerResponse,
} from "./ai-planner-contract.mjs";
import { requestPlannerResponse } from "./openai-planner-client.mjs";

export async function createPlannerRecommendation(
  plannerRequest,
  {
    requestModel = requestPlannerResponse,
    fallbackOnError = true,
  } = {},
) {
  validatePlannerRequest(plannerRequest);

  try {
    const modelResponse = await requestModel(plannerRequest);
    return {
      status: "ready",
      source: "openai",
      response: validatePlannerResponse(modelResponse, plannerRequest),
    };
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : typeof error?.message === "string" ? error.message : "planner_error";
    if (!fallbackOnError) throw error;
    return {
      status: "fallback",
      source: "deterministic",
      error: code,
      response: createDeterministicPlannerFallback(plannerRequest, code),
    };
  }
}
