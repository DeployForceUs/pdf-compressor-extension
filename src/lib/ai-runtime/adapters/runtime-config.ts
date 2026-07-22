export type ExecutionRoute = "local" | "office_current";

export interface AiRuntimeConfig {
  readonly plannerEndpoint: string;
  readonly officeEndpoint: string | null;
}

export interface CreateAiRuntimeConfigInput {
  readonly plannerEndpoint: string;
  readonly officeEndpoint?: string | null;
}

function normalizeHttpEndpoint(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field}_required`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${field}_invalid_url`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${field}_invalid_protocol`);
  }

  return url.toString().replace(/\/$/, "");
}

export function createAiRuntimeConfig(input: CreateAiRuntimeConfigInput): AiRuntimeConfig {
  const plannerEndpoint = normalizeHttpEndpoint(input.plannerEndpoint, "plannerEndpoint");
  const officeEndpoint = input.officeEndpoint == null || !input.officeEndpoint.trim()
    ? null
    : normalizeHttpEndpoint(input.officeEndpoint, "officeEndpoint");

  return Object.freeze({ plannerEndpoint, officeEndpoint });
}

export function resolveExecutionEndpoint(config: AiRuntimeConfig, route: ExecutionRoute): string | null {
  return route === "local" ? null : config.officeEndpoint;
}
