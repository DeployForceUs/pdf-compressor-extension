export const SMART_PLANNER_SCHEMA_VERSION = 1 as const;
export const SMART_PLANNER_MAX_INSTRUCTION_LENGTH = 200;

export type SmartPlannerGoal = {
  deliveryTarget: string;
  qualityIntent: string;
  speedPreference: string;
  splitAllowed: boolean;
  instruction?: string;
};

export type SmartPlannerDocumentProfile = {
  fileSizeBytes: number;
  pageCount: number;
  imageObjectCount: number;
  scannedPageRatio: number;
  vectorPageRatio: number;
  textPageRatio: number;
  estimatedDpiBuckets: {
    under150: number;
    "150to300": number;
    over300: number;
  };
  codecCounts: {
    jpeg: number;
    jpx: number;
    other: number;
  };
  pageSizeDistributionBytes: {
    p50: number;
    p90: number;
    max: number;
  };
};

export type SmartPlannerEngineCapabilities = {
  localAvailable: boolean;
  officeAvailable: boolean;
  officeCpuCount: number;
  officeMemoryGb: number;
  allowedPresets: string[];
  maxFileSizeMb: number;
};

export type SmartPlannerRequest = {
  schemaVersion: typeof SMART_PLANNER_SCHEMA_VERSION;
  requestId: string;
  userGoal: SmartPlannerGoal;
  documentProfile: SmartPlannerDocumentProfile;
  engineCapabilities: SmartPlannerEngineCapabilities;
};

export type ProcessingPlan = {
  schemaVersion: typeof SMART_PLANNER_SCHEMA_VERSION;
  engine: "local" | "office";
  preset: string;
  quality: number;
  dpi: number;
  split: {
    enabled: boolean;
    strategy: "by-max-size";
    targetPartSizeMb: number;
  };
  retryPolicy: {
    allowed: boolean;
    maxAdditionalPasses: 0 | 1;
  };
  explanation: string;
};

export type SmartPlannerRequestPolicy = {
  deliveryTargets: readonly string[];
  qualityIntents: readonly string[];
  speedPreferences: readonly string[];
  allowInstruction?: boolean;
};

export type ApprovedNumericPolicy = {
  quality: { min: number; max: number };
  dpi: { min: number; max: number };
  targetPartSizeMb: { min: number; max: number };
};

export type ProcessingPlanPolicy = {
  allowedPresets: readonly string[];
  localAvailable: boolean;
  officeAvailable: boolean;
  splitAllowed: boolean;
  officeEntitled: boolean;
  numericPolicy?: ApprovedNumericPolicy;
};

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type ProcessingPlanValidationResult = ContractValidationResult<ProcessingPlan> & {
  executionAllowed: boolean;
};

// These values are calibrated candidates, not an approved execution policy.
// Keeping model output on this finite set prevents invented processing numbers
// while the benchmark matrix and visual review are still incomplete.
export const PROVISIONAL_PLANNER_NUMERIC_CANDIDATES = {
  quality: [65, 72, 78, 85],
  dpi: [144, 180, 220],
  targetPartSizeMb: [20],
} as const;

type JsonSchema = Record<string, unknown>;

const REQUEST_KEYS = [
  "schemaVersion",
  "requestId",
  "userGoal",
  "documentProfile",
  "engineCapabilities",
] as const;
const GOAL_KEYS = [
  "deliveryTarget",
  "qualityIntent",
  "speedPreference",
  "splitAllowed",
  "instruction",
] as const;
const PROFILE_KEYS = [
  "fileSizeBytes",
  "pageCount",
  "imageObjectCount",
  "scannedPageRatio",
  "vectorPageRatio",
  "textPageRatio",
  "estimatedDpiBuckets",
  "codecCounts",
  "pageSizeDistributionBytes",
] as const;
const DPI_BUCKET_KEYS = ["under150", "150to300", "over300"] as const;
const CODEC_KEYS = ["jpeg", "jpx", "other"] as const;
const PAGE_SIZE_KEYS = ["p50", "p90", "max"] as const;
const CAPABILITY_KEYS = [
  "localAvailable",
  "officeAvailable",
  "officeCpuCount",
  "officeMemoryGb",
  "allowedPresets",
  "maxFileSizeMb",
] as const;
const PLAN_KEYS = [
  "schemaVersion",
  "engine",
  "preset",
  "quality",
  "dpi",
  "split",
  "retryPolicy",
  "explanation",
] as const;
const SPLIT_KEYS = ["enabled", "strategy", "targetPartSizeMb"] as const;
const RETRY_KEYS = ["allowed", "maxAdditionalPasses"] as const;
const ALLOWLISTED_REQUEST_KEYS = new Set<string>([
  ...REQUEST_KEYS,
  ...GOAL_KEYS,
  ...PROFILE_KEYS,
  ...DPI_BUCKET_KEYS,
  ...CODEC_KEYS,
  ...PAGE_SIZE_KEYS,
  ...CAPABILITY_KEYS,
]);

const FORBIDDEN_KEY_PARTS = [
  "pdf",
  "byte",
  "buffer",
  "blob",
  "base64",
  "dataurl",
  "image",
  "preview",
  "ocr",
  "text",
  "content",
  "table",
  "summary",
  "filename",
  "filepath",
  "path",
  "title",
  "author",
  "subject",
  "keyword",
  "metadata",
  "hash",
  "documentid",
  "email",
  "license",
  "token",
  "fingerprint",
  "account",
  "identity",
  "location",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBinaryValue(value: unknown) {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob)
  );
}

function scanForbiddenPayload(value: unknown, path: string, errors: string[]) {
  if (isBinaryValue(value)) {
    errors.push(`${path}: binary values are forbidden`);
    return;
  }

  if (typeof value === "string" && /^data:/i.test(value.trim())) {
    errors.push(`${path}: data URLs are forbidden`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenPayload(item, `${path}[${index}]`, errors));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (
      !ALLOWLISTED_REQUEST_KEYS.has(key) &&
      FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))
    ) {
      errors.push(`${path}.${key}: forbidden field name`);
    }
    scanForbiddenPayload(nested, `${path}.${key}`, errors);
  }
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}.${key}: unknown field`);
    }
  }
}

function expectRecord(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return undefined;
  }
  return value;
}

function expectBoolean(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "boolean") {
    errors.push(`${path}: expected boolean`);
  }
}

function expectFiniteNumber(
  value: unknown,
  path: string,
  errors: string[],
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path}: expected finite number`);
    return false;
  }
  return true;
}

function expectNonNegativeInteger(value: unknown, path: string, errors: string[]) {
  if (!expectFiniteNumber(value, path, errors)) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    errors.push(`${path}: expected non-negative safe integer`);
  }
}

function expectPositiveInteger(value: unknown, path: string, errors: string[]) {
  if (!expectFiniteNumber(value, path, errors)) return;
  if (!Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${path}: expected positive safe integer`);
  }
}

function expectRatio(value: unknown, path: string, errors: string[]) {
  if (!expectFiniteNumber(value, path, errors)) return;
  if ((value as number) < 0 || (value as number) > 1) {
    errors.push(`${path}: expected ratio from 0 to 1`);
  }
}

function expectEnum(
  value: unknown,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path}: expected one of ${allowed.join(", ")}`);
  }
}

function objectSchema(properties: Record<string, JsonSchema>, required = Object.keys(properties)) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  } satisfies JsonSchema;
}

export function createSmartPlannerRequestSchema(policy: SmartPlannerRequestPolicy): JsonSchema {
  const goalProperties: Record<string, JsonSchema> = {
    deliveryTarget: { type: "string", enum: [...policy.deliveryTargets] },
    qualityIntent: { type: "string", enum: [...policy.qualityIntents] },
    speedPreference: { type: "string", enum: [...policy.speedPreferences] },
    splitAllowed: { type: "boolean" },
  };
  if (policy.allowInstruction) {
    goalProperties.instruction = {
      type: "string",
      maxLength: SMART_PLANNER_MAX_INSTRUCTION_LENGTH,
    };
  }

  return objectSchema({
    schemaVersion: { type: "integer", const: SMART_PLANNER_SCHEMA_VERSION },
    requestId: {
      type: "string",
      minLength: 16,
      maxLength: 128,
      pattern: "^[A-Za-z0-9_-]+$",
    },
    userGoal: objectSchema(
      goalProperties,
      ["deliveryTarget", "qualityIntent", "speedPreference", "splitAllowed"],
    ),
    documentProfile: objectSchema({
      fileSizeBytes: { type: "integer", minimum: 0 },
      pageCount: { type: "integer", minimum: 1 },
      imageObjectCount: { type: "integer", minimum: 0 },
      scannedPageRatio: { type: "number", minimum: 0, maximum: 1 },
      vectorPageRatio: { type: "number", minimum: 0, maximum: 1 },
      textPageRatio: { type: "number", minimum: 0, maximum: 1 },
      estimatedDpiBuckets: objectSchema({
        under150: { type: "number", minimum: 0, maximum: 1 },
        "150to300": { type: "number", minimum: 0, maximum: 1 },
        over300: { type: "number", minimum: 0, maximum: 1 },
      }),
      codecCounts: objectSchema({
        jpeg: { type: "integer", minimum: 0 },
        jpx: { type: "integer", minimum: 0 },
        other: { type: "integer", minimum: 0 },
      }),
      pageSizeDistributionBytes: objectSchema({
        p50: { type: "integer", minimum: 0 },
        p90: { type: "integer", minimum: 0 },
        max: { type: "integer", minimum: 0 },
      }),
    }),
    engineCapabilities: objectSchema({
      localAvailable: { type: "boolean" },
      officeAvailable: { type: "boolean" },
      officeCpuCount: { type: "integer", minimum: 0 },
      officeMemoryGb: { type: "number", minimum: 0 },
      allowedPresets: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        uniqueItems: true,
      },
      maxFileSizeMb: { type: "number", exclusiveMinimum: 0 },
    }),
  });
}

export function createProcessingPlanSchema(allowedPresets: readonly string[]): JsonSchema {
  return objectSchema({
    schemaVersion: { type: "integer", const: SMART_PLANNER_SCHEMA_VERSION },
    engine: { type: "string", enum: ["local", "office"] },
    preset: { type: "string", enum: [...allowedPresets] },
    quality: { type: "integer", enum: [...PROVISIONAL_PLANNER_NUMERIC_CANDIDATES.quality] },
    dpi: { type: "integer", enum: [...PROVISIONAL_PLANNER_NUMERIC_CANDIDATES.dpi] },
    split: objectSchema({
      enabled: { type: "boolean" },
      strategy: { type: "string", enum: ["by-max-size"] },
      targetPartSizeMb: {
        type: "integer",
        enum: [...PROVISIONAL_PLANNER_NUMERIC_CANDIDATES.targetPartSizeMb],
      },
    }),
    retryPolicy: objectSchema({
      allowed: { type: "boolean" },
      maxAdditionalPasses: { type: "integer", enum: [0, 1] },
    }),
    explanation: { type: "string", minLength: 1, maxLength: 400 },
  });
}

export function validateSmartPlannerRequest(
  input: unknown,
  policy: SmartPlannerRequestPolicy,
): ContractValidationResult<SmartPlannerRequest> {
  const errors: string[] = [];
  scanForbiddenPayload(input, "$", errors);
  const request = expectRecord(input, "$", errors);
  if (!request) return { ok: false, errors };

  rejectUnknownKeys(request, REQUEST_KEYS, "$", errors);
  if (request.schemaVersion !== SMART_PLANNER_SCHEMA_VERSION) {
    errors.push("$.schemaVersion: unsupported schema version");
  }
  if (
    typeof request.requestId !== "string" ||
    request.requestId.length < 16 ||
    request.requestId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(request.requestId)
  ) {
    errors.push("$.requestId: expected a 16-128 character ephemeral identifier");
  }

  const goal = expectRecord(request.userGoal, "$.userGoal", errors);
  if (goal) {
    rejectUnknownKeys(
      goal,
      policy.allowInstruction ? GOAL_KEYS : GOAL_KEYS.filter((key) => key !== "instruction"),
      "$.userGoal",
      errors,
    );
    expectEnum(goal.deliveryTarget, policy.deliveryTargets, "$.userGoal.deliveryTarget", errors);
    expectEnum(goal.qualityIntent, policy.qualityIntents, "$.userGoal.qualityIntent", errors);
    expectEnum(goal.speedPreference, policy.speedPreferences, "$.userGoal.speedPreference", errors);
    expectBoolean(goal.splitAllowed, "$.userGoal.splitAllowed", errors);
    if ("instruction" in goal) {
      if (!policy.allowInstruction) {
        errors.push("$.userGoal.instruction: free text is disabled by policy");
      } else if (
        typeof goal.instruction !== "string" ||
        goal.instruction.length > SMART_PLANNER_MAX_INSTRUCTION_LENGTH ||
        /[\u0000-\u001F\u007F]/.test(goal.instruction)
      ) {
        errors.push("$.userGoal.instruction: expected at most 200 printable characters");
      }
    }
  }

  const profile = expectRecord(request.documentProfile, "$.documentProfile", errors);
  if (profile) {
    rejectUnknownKeys(profile, PROFILE_KEYS, "$.documentProfile", errors);
    expectNonNegativeInteger(profile.fileSizeBytes, "$.documentProfile.fileSizeBytes", errors);
    expectPositiveInteger(profile.pageCount, "$.documentProfile.pageCount", errors);
    expectNonNegativeInteger(profile.imageObjectCount, "$.documentProfile.imageObjectCount", errors);
    expectRatio(profile.scannedPageRatio, "$.documentProfile.scannedPageRatio", errors);
    expectRatio(profile.vectorPageRatio, "$.documentProfile.vectorPageRatio", errors);
    expectRatio(profile.textPageRatio, "$.documentProfile.textPageRatio", errors);

    const buckets = expectRecord(
      profile.estimatedDpiBuckets,
      "$.documentProfile.estimatedDpiBuckets",
      errors,
    );
    if (buckets) {
      rejectUnknownKeys(buckets, DPI_BUCKET_KEYS, "$.documentProfile.estimatedDpiBuckets", errors);
      expectRatio(buckets.under150, "$.documentProfile.estimatedDpiBuckets.under150", errors);
      expectRatio(buckets["150to300"], "$.documentProfile.estimatedDpiBuckets.150to300", errors);
      expectRatio(buckets.over300, "$.documentProfile.estimatedDpiBuckets.over300", errors);
    }

    const codecs = expectRecord(profile.codecCounts, "$.documentProfile.codecCounts", errors);
    if (codecs) {
      rejectUnknownKeys(codecs, CODEC_KEYS, "$.documentProfile.codecCounts", errors);
      for (const key of CODEC_KEYS) {
        expectNonNegativeInteger(codecs[key], `$.documentProfile.codecCounts.${key}`, errors);
      }
    }

    const pageSizes = expectRecord(
      profile.pageSizeDistributionBytes,
      "$.documentProfile.pageSizeDistributionBytes",
      errors,
    );
    if (pageSizes) {
      rejectUnknownKeys(
        pageSizes,
        PAGE_SIZE_KEYS,
        "$.documentProfile.pageSizeDistributionBytes",
        errors,
      );
      for (const key of PAGE_SIZE_KEYS) {
        expectNonNegativeInteger(
          pageSizes[key],
          `$.documentProfile.pageSizeDistributionBytes.${key}`,
          errors,
        );
      }
    }
  }

  const capabilities = expectRecord(
    request.engineCapabilities,
    "$.engineCapabilities",
    errors,
  );
  if (capabilities) {
    rejectUnknownKeys(capabilities, CAPABILITY_KEYS, "$.engineCapabilities", errors);
    expectBoolean(capabilities.localAvailable, "$.engineCapabilities.localAvailable", errors);
    expectBoolean(capabilities.officeAvailable, "$.engineCapabilities.officeAvailable", errors);
    expectNonNegativeInteger(
      capabilities.officeCpuCount,
      "$.engineCapabilities.officeCpuCount",
      errors,
    );
    if (expectFiniteNumber(capabilities.officeMemoryGb, "$.engineCapabilities.officeMemoryGb", errors)) {
      if ((capabilities.officeMemoryGb as number) < 0) {
        errors.push("$.engineCapabilities.officeMemoryGb: expected non-negative number");
      }
    }
    if (
      !Array.isArray(capabilities.allowedPresets) ||
      capabilities.allowedPresets.length === 0 ||
      capabilities.allowedPresets.some((value) => typeof value !== "string" || value.length === 0)
    ) {
      errors.push("$.engineCapabilities.allowedPresets: expected non-empty string array");
    }
    if (expectFiniteNumber(capabilities.maxFileSizeMb, "$.engineCapabilities.maxFileSizeMb", errors)) {
      if ((capabilities.maxFileSizeMb as number) <= 0) {
        errors.push("$.engineCapabilities.maxFileSizeMb: expected positive number");
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  const valid = input as SmartPlannerRequest;
  return {
    ok: true,
    value: {
      schemaVersion: valid.schemaVersion,
      requestId: valid.requestId,
      userGoal: {
        deliveryTarget: valid.userGoal.deliveryTarget,
        qualityIntent: valid.userGoal.qualityIntent,
        speedPreference: valid.userGoal.speedPreference,
        splitAllowed: valid.userGoal.splitAllowed,
        ...(valid.userGoal.instruction === undefined
          ? {}
          : { instruction: valid.userGoal.instruction }),
      },
      documentProfile: {
        fileSizeBytes: valid.documentProfile.fileSizeBytes,
        pageCount: valid.documentProfile.pageCount,
        imageObjectCount: valid.documentProfile.imageObjectCount,
        scannedPageRatio: valid.documentProfile.scannedPageRatio,
        vectorPageRatio: valid.documentProfile.vectorPageRatio,
        textPageRatio: valid.documentProfile.textPageRatio,
        estimatedDpiBuckets: { ...valid.documentProfile.estimatedDpiBuckets },
        codecCounts: { ...valid.documentProfile.codecCounts },
        pageSizeDistributionBytes: { ...valid.documentProfile.pageSizeDistributionBytes },
      },
      engineCapabilities: {
        localAvailable: valid.engineCapabilities.localAvailable,
        officeAvailable: valid.engineCapabilities.officeAvailable,
        officeCpuCount: valid.engineCapabilities.officeCpuCount,
        officeMemoryGb: valid.engineCapabilities.officeMemoryGb,
        allowedPresets: [...valid.engineCapabilities.allowedPresets],
        maxFileSizeMb: valid.engineCapabilities.maxFileSizeMb,
      },
    },
  };
}

function validateNumericRange(
  value: number,
  bounds: { min: number; max: number },
  path: string,
  errors: string[],
) {
  if (value < bounds.min || value > bounds.max) {
    errors.push(`${path}: outside approved range ${bounds.min}-${bounds.max}`);
  }
}

export function validateProcessingPlan(
  input: unknown,
  policy: ProcessingPlanPolicy,
): ProcessingPlanValidationResult {
  const errors: string[] = [];
  const plan = expectRecord(input, "$", errors);
  if (!plan) return { ok: false, errors, executionAllowed: false };
  rejectUnknownKeys(plan, PLAN_KEYS, "$", errors);

  if (plan.schemaVersion !== SMART_PLANNER_SCHEMA_VERSION) {
    errors.push("$.schemaVersion: unsupported schema version");
  }
  expectEnum(plan.engine, ["local", "office"], "$.engine", errors);
  expectEnum(plan.preset, policy.allowedPresets, "$.preset", errors);
  if (!Number.isSafeInteger(plan.quality)) errors.push("$.quality: expected safe integer");
  if (!Number.isSafeInteger(plan.dpi)) errors.push("$.dpi: expected safe integer");
  if (plan.engine === "local" && !policy.localAvailable) {
    errors.push("$.engine: Local Engine is unavailable");
  }
  if (plan.engine === "office" && !policy.officeAvailable) {
    errors.push("$.engine: Office Engine is unavailable");
  }
  if (plan.engine === "office" && !policy.officeEntitled) {
    errors.push("$.engine: Office Engine is not permitted by the active entitlement");
  }

  const split = expectRecord(plan.split, "$.split", errors);
  if (split) {
    rejectUnknownKeys(split, SPLIT_KEYS, "$.split", errors);
    expectBoolean(split.enabled, "$.split.enabled", errors);
    expectEnum(split.strategy, ["by-max-size"], "$.split.strategy", errors);
    if (!Number.isSafeInteger(split.targetPartSizeMb)) {
      errors.push("$.split.targetPartSizeMb: expected safe integer");
    }
    if (split.enabled === true && !policy.splitAllowed) {
      errors.push("$.split.enabled: Split is forbidden by the user goal");
    }
  }

  const retry = expectRecord(plan.retryPolicy, "$.retryPolicy", errors);
  if (retry) {
    rejectUnknownKeys(retry, RETRY_KEYS, "$.retryPolicy", errors);
    expectBoolean(retry.allowed, "$.retryPolicy.allowed", errors);
    if (retry.maxAdditionalPasses !== 0 && retry.maxAdditionalPasses !== 1) {
      errors.push("$.retryPolicy.maxAdditionalPasses: expected 0 or 1");
    }
    if (retry.allowed === false && retry.maxAdditionalPasses !== 0) {
      errors.push("$.retryPolicy: disabled retry must have zero additional passes");
    }
  }

  if (
    typeof plan.explanation !== "string" ||
    plan.explanation.length === 0 ||
    plan.explanation.length > 400 ||
    /[\u0000-\u001F\u007F]/.test(plan.explanation)
  ) {
    errors.push("$.explanation: expected 1-400 printable characters");
  }

  if (!policy.numericPolicy) {
    errors.push("$: AI-generated numeric values are blocked until numeric policy is approved");
  } else if (
    typeof plan.quality === "number" &&
    typeof plan.dpi === "number" &&
    split &&
    typeof split.targetPartSizeMb === "number"
  ) {
    validateNumericRange(plan.quality, policy.numericPolicy.quality, "$.quality", errors);
    validateNumericRange(plan.dpi, policy.numericPolicy.dpi, "$.dpi", errors);
    validateNumericRange(
      split.targetPartSizeMb,
      policy.numericPolicy.targetPartSizeMb,
      "$.split.targetPartSizeMb",
      errors,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors: [...new Set(errors)], executionAllowed: false };
  }
  return { ok: true, value: input as ProcessingPlan, executionAllowed: true };
}

export function validateProcessingPlanStructure(
  input: unknown,
  allowedPresets: readonly string[],
): ContractValidationResult<ProcessingPlan> {
  const structuralResult = validateProcessingPlan(input, {
    allowedPresets,
    localAvailable: true,
    officeAvailable: true,
    splitAllowed: true,
    officeEntitled: true,
    numericPolicy: {
      quality: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
      dpi: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
      targetPartSizeMb: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
    },
  });
  if (!structuralResult.ok) {
    return { ok: false, errors: structuralResult.errors };
  }
  return { ok: true, value: structuralResult.value };
}
