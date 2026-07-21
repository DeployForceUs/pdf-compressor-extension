import { PLANNER_RESPONSE_JSON_SCHEMA, validatePlannerRequest } from "./ai-planner-contract.mjs";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";

const SYSTEM_INSTRUCTIONS = `You are the privacy-first PDF Compute Planner.
Return only a plan matching the provided strict schema.
Use only the supplied structural document metrics, user goal, local capabilities, Office Engine capabilities, and approved capacity catalog.
Never infer or request document content, filename, text, images, previews, OCR output, personal data, or external facts.
Never invent a capacity profile. idealConfiguration and oversizedConfiguration must be exact entries from capacityCatalog.
Never recommend office_current unless officeCapabilities.availability is ready.
recommendedPreset must be present in officeCapabilities.presets.
Runtime estimates must be non-negative seconds with min <= max. Use null when there is not enough evidence.
This is recommendation-only. Do not claim that processing was started.`;

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

export class OpenAiPlannerError extends Error {
  constructor(code, statusCode = 502) {
    super(code);
    this.name = "OpenAiPlannerError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function requestPlannerResponse(
  plannerRequest,
  {
    apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_PLANNER_MODEL || DEFAULT_MODEL,
    endpoint = process.env.OPENAI_RESPONSES_ENDPOINT || DEFAULT_ENDPOINT,
    fetchImpl = globalThis.fetch,
    timeoutMs = 30_000,
  } = {},
) {
  validatePlannerRequest(plannerRequest);
  if (!apiKey) throw new OpenAiPlannerError("openai_api_key_missing", 503);
  if (typeof fetchImpl !== "function") throw new OpenAiPlannerError("fetch_unavailable", 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify(plannerRequest),
        text: {
          format: {
            type: "json_schema",
            name: "pdf_compute_planner_response",
            strict: true,
            schema: PLANNER_RESPONSE_JSON_SCHEMA,
          },
        },
        store: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OpenAiPlannerError(`openai_http_${response.status}`, response.status >= 500 ? 502 : 400);
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) throw new OpenAiPlannerError("openai_output_missing");

    try {
      return JSON.parse(outputText);
    } catch {
      throw new OpenAiPlannerError("openai_output_invalid_json");
    }
  } catch (error) {
    if (error?.name === "AbortError") throw new OpenAiPlannerError("openai_timeout", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
