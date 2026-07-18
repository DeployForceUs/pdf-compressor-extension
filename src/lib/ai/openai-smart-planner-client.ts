import {
  createProcessingPlanSchema,
  validateProcessingPlan,
  validateProcessingPlanStructure,
  validateSmartPlannerRequest,
  type ProcessingPlan,
  type ProcessingPlanPolicy,
  type SmartPlannerRequestPolicy,
} from "./smart-planner-contract";

export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const SMART_PLANNER_MODEL = "gpt-5.6";

export const SMART_PLANNER_INSTRUCTIONS = `You are a bounded PDF processing planner, not a document reader.
Use only the supplied technical profile, engine capabilities, and structured processing goal.
Return only the strict ProcessingPlan schema.
Choose only the enumerated engines, presets, Split strategies, and retry values.
Never return command lines, code, URLs, filenames, tools, or new parameters.
Do not infer document subject matter from structural metrics.
If the inputs conflict or capability is missing, choose the safest available engine and preset.
Keep the explanation short and do not repeat the complete input profile.
No tools or external knowledge are required.`;

export type SmartPlannerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SmartPlannerApiOptions = {
  apiKey: string;
  request: unknown;
  requestPolicy: SmartPlannerRequestPolicy;
  planPolicy: ProcessingPlanPolicy;
  fetchImpl?: SmartPlannerFetch;
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
};

export type SmartPlannerApiResult =
  | {
      kind: "plan";
      plan: ProcessingPlan;
      responseId?: string;
      executionAllowed: boolean;
      policyErrors: string[];
    }
  | {
      kind: "fallback";
      action: "use_existing_local_settings";
      reason:
        | "invalid_request"
        | "network_error"
        | "rate_limited"
        | "upstream_error"
        | "incomplete_response"
        | "refusal"
        | "invalid_model_output";
      errors: string[];
    };

type OpenAIResponseBody = {
  id?: unknown;
  status?: unknown;
  error?: unknown;
  incomplete_details?: unknown;
  output?: unknown;
};

function fallback(
  reason: Extract<SmartPlannerApiResult, { kind: "fallback" }>["reason"],
  errors: string[],
): SmartPlannerApiResult {
  return {
    kind: "fallback",
    action: "use_existing_local_settings",
    reason,
    errors,
  };
}

function findOutputText(body: OpenAIResponseBody) {
  if (!Array.isArray(body.output)) return undefined;
  for (const item of body.output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      if ((part as { type?: unknown }).type === "refusal") return { refusal: true } as const;
      if (
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return { refusal: false, text: (part as { text: string }).text } as const;
      }
    }
  }
  return undefined;
}

export function createSmartPlannerResponseBody(
  request: unknown,
  requestPolicy: SmartPlannerRequestPolicy,
) {
  const validated = validateSmartPlannerRequest(request, requestPolicy);
  if (!validated.ok) return validated;

  return {
    ok: true as const,
    value: {
      model: SMART_PLANNER_MODEL,
      store: false,
      reasoning: { effort: "low" },
      instructions: SMART_PLANNER_INSTRUCTIONS,
      input: JSON.stringify(validated.value),
      tools: [],
      max_output_tokens: 1200,
      text: {
        format: {
          type: "json_schema",
          name: "processing_plan",
          strict: true,
          schema: createProcessingPlanSchema(validated.value.engineCapabilities.allowedPresets),
        },
      },
    },
  };
}

export async function requestSmartPlannerPlan(
  options: SmartPlannerApiOptions,
): Promise<SmartPlannerApiResult> {
  const body = createSmartPlannerResponseBody(options.request, options.requestPolicy);
  if (!body.ok) return fallback("invalid_request", body.errors);
  if (!options.apiKey.trim()) return fallback("upstream_error", ["OpenAI API key is not configured"]);

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      options.endpoint ?? OPENAI_RESPONSES_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body.value,
          model: options.model ?? body.value.model,
        }),
        signal: options.signal,
      },
    );
  } catch {
    return fallback("network_error", ["OpenAI request failed before a response was received"]);
  }

  if (response.status === 429) {
    return fallback("rate_limited", ["OpenAI rate limit reached"]);
  }
  if (!response.ok) {
    return fallback("upstream_error", [`OpenAI returned HTTP ${response.status}`]);
  }

  let responseBody: OpenAIResponseBody;
  try {
    responseBody = (await response.json()) as OpenAIResponseBody;
  } catch {
    return fallback("invalid_model_output", ["OpenAI response was not JSON"]);
  }

  if (responseBody.status !== "completed") {
    return fallback("incomplete_response", ["OpenAI response did not complete"]);
  }
  const output = findOutputText(responseBody);
  if (output?.refusal) return fallback("refusal", ["OpenAI refused the planning request"]);
  if (!output || !("text" in output)) {
    return fallback("invalid_model_output", ["OpenAI response contained no structured output text"]);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(output.text);
  } catch {
    return fallback("invalid_model_output", ["Structured output was not valid JSON"]);
  }

  const structure = validateProcessingPlanStructure(candidate, options.planPolicy.allowedPresets);
  if (!structure.ok) return fallback("invalid_model_output", structure.errors);

  const policy = validateProcessingPlan(structure.value, options.planPolicy);
  return {
    kind: "plan",
    plan: structure.value,
    ...(typeof responseBody.id === "string" ? { responseId: responseBody.id } : {}),
    executionAllowed: policy.executionAllowed,
    policyErrors: policy.ok ? [] : policy.errors,
  };
}
