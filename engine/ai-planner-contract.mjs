const ALLOWED_ROUTES = new Set(["local", "office_current"]);
const ALLOWED_PRESETS = new Set(["safe", "balanced", "strong"]);
const ALLOWED_ASSESSMENTS = new Set([
  "recommended",
  "sufficient",
  "sufficient_but_slower",
  "insufficient",
  "unavailable",
  "excessive",
]);
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);

export const PLANNER_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "recommendedRoute",
    "recommendedPreset",
    "currentLocalAssessment",
    "currentOfficeAssessment",
    "idealConfiguration",
    "oversizedConfiguration",
    "estimatedRuntime",
    "explanation",
    "confidence",
  ],
  properties: {
    schemaVersion: { type: "string", const: "1" },
    recommendedRoute: { type: "string", enum: ["local", "office_current"] },
    recommendedPreset: { type: "string", enum: ["safe", "balanced", "strong"] },
    currentLocalAssessment: {
      type: "string",
      enum: ["recommended", "sufficient", "sufficient_but_slower", "insufficient", "unavailable", "excessive"],
    },
    currentOfficeAssessment: {
      type: "string",
      enum: ["recommended", "sufficient", "sufficient_but_slower", "insufficient", "unavailable", "excessive"],
    },
    idealConfiguration: { $ref: "#/$defs/capacityProfile" },
    oversizedConfiguration: {
      anyOf: [
        { type: "null" },
        {
          allOf: [
            { $ref: "#/$defs/capacityProfile" },
            {
              type: "object",
              required: ["reason"],
              properties: { reason: { type: "string", minLength: 1, maxLength: 600 } },
            },
          ],
        },
      ],
    },
    estimatedRuntime: {
      type: "object",
      additionalProperties: false,
      required: ["local", "officeCurrent", "idealConfiguration"],
      properties: {
        local: { anyOf: [{ type: "null" }, { $ref: "#/$defs/runtimeEstimate" }] },
        officeCurrent: { anyOf: [{ type: "null" }, { $ref: "#/$defs/runtimeEstimate" }] },
        idealConfiguration: { anyOf: [{ type: "null" }, { $ref: "#/$defs/runtimeEstimate" }] },
      },
    },
    explanation: { type: "string", minLength: 1, maxLength: 1200 },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  $defs: {
    capacityProfile: {
      type: "object",
      additionalProperties: false,
      required: ["id", "cpuCores", "memoryMb", "label"],
      properties: {
        id: { type: "string", minLength: 1 },
        cpuCores: { type: "integer", minimum: 0 },
        memoryMb: { type: "integer", minimum: 0 },
        label: { type: "string", minLength: 1 },
      },
    },
    runtimeEstimate: {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: {
        min: { type: "number", minimum: 0 },
        max: { type: "number", minimum: 0 },
      },
    },
  },
});

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertFiniteNonNegative(value, path) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${path}_invalid`);
}

function assertCapacityProfile(value, path) {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    throw new Error(`${path}_invalid`);
  }
  assertFiniteNonNegative(value.cpuCores, `${path}_cpuCores`);
  assertFiniteNonNegative(value.memoryMb, `${path}_memoryMb`);
}

function assertRuntimeEstimate(value, path) {
  if (value === null || value === undefined) return;
  if (!isObject(value)) throw new Error(`${path}_invalid`);
  assertFiniteNonNegative(value.min, `${path}_min`);
  assertFiniteNonNegative(value.max, `${path}_max`);
  if (value.min > value.max) throw new Error(`${path}_unordered`);
}

function sameCapacity(left, right) {
  return left.id === right.id && left.cpuCores === right.cpuCores && left.memoryMb === right.memoryMb && left.label === right.label;
}

export function validatePlannerRequest(value) {
  if (!isObject(value) || value.schemaVersion !== "1") throw new Error("planner_request_invalid");
  if (!isObject(value.documentProfile) || !isObject(value.userGoal)) throw new Error("planner_request_invalid");
  if (!isObject(value.localCapabilities) || !isObject(value.officeCapabilities)) throw new Error("planner_request_invalid");
  if (!Array.isArray(value.capacityCatalog) || value.capacityCatalog.length === 0) throw new Error("planner_request_invalid");

  const profile = value.documentProfile;
  for (const [key, metric] of Object.entries({
    pageCount: profile.pageCount,
    fileSizeBytes: profile.fileSizeBytes,
    imageObjectCount: profile.imageObjectCount,
    scannedRatio: profile.scannedRatio,
    textRatio: profile.textRatio,
    vectorRatio: profile.vectorRatio,
  })) assertFiniteNonNegative(metric, `documentProfile_${key}`);
  if (!Array.isArray(profile.complexitySignals) || profile.complexitySignals.some((item) => typeof item !== "string")) {
    throw new Error("documentProfile_complexitySignals_invalid");
  }

  for (const capacity of value.capacityCatalog) assertCapacityProfile(capacity, "capacityCatalog");
  return value;
}

export function validatePlannerResponse(response, request) {
  validatePlannerRequest(request);
  if (!isObject(response) || response.schemaVersion !== "1") throw new Error("planner_response_invalid");
  if (!ALLOWED_ROUTES.has(response.recommendedRoute)) throw new Error("recommendedRoute_invalid");
  if (!ALLOWED_PRESETS.has(response.recommendedPreset)) throw new Error("recommendedPreset_invalid");
  if (!ALLOWED_ASSESSMENTS.has(response.currentLocalAssessment)) throw new Error("currentLocalAssessment_invalid");
  if (!ALLOWED_ASSESSMENTS.has(response.currentOfficeAssessment)) throw new Error("currentOfficeAssessment_invalid");
  if (!ALLOWED_CONFIDENCE.has(response.confidence)) throw new Error("confidence_invalid");
  if (typeof response.explanation !== "string" || response.explanation.trim().length === 0) throw new Error("explanation_invalid");

  if (response.recommendedRoute === "office_current" && request.officeCapabilities.availability !== "ready") {
    throw new Error("office_route_unavailable");
  }
  if (!request.officeCapabilities.presets.includes(response.recommendedPreset)) {
    throw new Error("recommendedPreset_not_available");
  }

  assertCapacityProfile(response.idealConfiguration, "idealConfiguration");
  const approvedIdeal = request.capacityCatalog.find((item) => item.id === response.idealConfiguration.id);
  if (!approvedIdeal || !sameCapacity(approvedIdeal, response.idealConfiguration)) throw new Error("idealConfiguration_not_approved");

  if (response.oversizedConfiguration !== null && response.oversizedConfiguration !== undefined) {
    assertCapacityProfile(response.oversizedConfiguration, "oversizedConfiguration");
    if (typeof response.oversizedConfiguration.reason !== "string" || response.oversizedConfiguration.reason.trim().length === 0) {
      throw new Error("oversizedConfiguration_reason_invalid");
    }
    const approvedOversized = request.capacityCatalog.find((item) => item.id === response.oversizedConfiguration.id);
    if (!approvedOversized || !sameCapacity(approvedOversized, response.oversizedConfiguration)) {
      throw new Error("oversizedConfiguration_not_approved");
    }
  }

  if (!isObject(response.estimatedRuntime)) throw new Error("estimatedRuntime_invalid");
  assertRuntimeEstimate(response.estimatedRuntime.local, "estimatedRuntime_local");
  assertRuntimeEstimate(response.estimatedRuntime.officeCurrent, "estimatedRuntime_officeCurrent");
  assertRuntimeEstimate(response.estimatedRuntime.idealConfiguration, "estimatedRuntime_idealConfiguration");

  return {
    ...response,
    oversizedConfiguration: response.oversizedConfiguration ?? undefined,
    estimatedRuntime: {
      local: response.estimatedRuntime.local ?? undefined,
      officeCurrent: response.estimatedRuntime.officeCurrent ?? undefined,
      idealConfiguration: response.estimatedRuntime.idealConfiguration ?? undefined,
    },
  };
}

export function createDeterministicPlannerFallback(request, reason = "planner_unavailable") {
  validatePlannerRequest(request);
  const officeReady = request.officeCapabilities.availability === "ready";
  const preferredPreset = request.officeCapabilities.presets.includes("balanced")
    ? "balanced"
    : request.officeCapabilities.presets[0] ?? "safe";
  const ideal = request.capacityCatalog[Math.min(1, request.capacityCatalog.length - 1)];
  const oversized = request.capacityCatalog.find((item) => item.cpuCores > ideal.cpuCores && item.memoryMb > ideal.memoryMb);

  return {
    schemaVersion: "1",
    recommendedRoute: officeReady ? "office_current" : "local",
    recommendedPreset: preferredPreset,
    currentLocalAssessment: request.localCapabilities.available ? "sufficient_but_slower" : "unavailable",
    currentOfficeAssessment: officeReady ? "recommended" : "unavailable",
    idealConfiguration: ideal,
    oversizedConfiguration: oversized ? { ...oversized, reason: "Additional headroom beyond the deterministic fallback recommendation." } : undefined,
    estimatedRuntime: {},
    explanation: `AI Planner fallback used: ${reason}. No processing was started.`,
    confidence: "low",
  };
}
