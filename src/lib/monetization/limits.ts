import { generateFingerprint } from "./fingerprint";
import {
  STAGE_7_MVP_POLICY,
  getDailyLimit,
  type MeteredOperation,
} from "./policy";

export const DAILY_USAGE_STORAGE_KEY = "stage7:daily-usage";

export type DailyUsageState = {
  version: 1;
  date: string;
  compressionCount: number;
  splitCount: number;
  fingerprint: string;
  lastOperationAt: number | null;
};

export type UsageStorage = {
  get: (key: string) => Promise<DailyUsageState | null>;
  set: (key: string, value: DailyUsageState) => Promise<void>;
};

export type UsageDecision =
  | {
      allowed: true;
      operation: MeteredOperation;
      remaining: number;
      retryAfterMs: 0;
      state: DailyUsageState;
    }
  | {
      allowed: false;
      operation: MeteredOperation;
      remaining: number;
      retryAfterMs: number;
      reason: "DAILY_LIMIT_REACHED" | "COOLDOWN_ACTIVE";
      state: DailyUsageState;
    };

export type UsageLimitServiceDependencies = {
  storage: UsageStorage;
  getFingerprint?: () => Promise<string>;
  now?: () => number;
};

function utcDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function countFor(state: DailyUsageState, operation: MeteredOperation) {
  return operation === "compression" ? state.compressionCount : state.splitCount;
}

function increment(state: DailyUsageState, operation: MeteredOperation): DailyUsageState {
  return operation === "compression"
    ? { ...state, compressionCount: state.compressionCount + 1 }
    : { ...state, splitCount: state.splitCount + 1 };
}

export function createUsageLimitService({
  storage,
  getFingerprint = generateFingerprint,
  now = Date.now,
}: UsageLimitServiceDependencies) {
  let queue: Promise<void> = Promise.resolve();

  async function loadState(timestamp: number) {
    const today = utcDate(timestamp);
    const stored = await storage.get(DAILY_USAGE_STORAGE_KEY);
    if (stored?.version === 1 && stored.date === today) {
      return stored;
    }

    const state: DailyUsageState = {
      version: 1,
      date: today,
      compressionCount: 0,
      splitCount: 0,
      fingerprint: await getFingerprint(),
      lastOperationAt: null,
    };
    await storage.set(DAILY_USAGE_STORAGE_KEY, state);
    return state;
  }

  function exclusive<T>(operation: () => Promise<T>) {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function inspect(operation: MeteredOperation): Promise<UsageDecision> {
    const timestamp = now();
    const state = await loadState(timestamp);
    const limit = getDailyLimit(operation);
    const remaining = Math.max(0, limit - countFor(state, operation));

    if (remaining === 0) {
      return {
        allowed: false,
        operation,
        remaining,
        retryAfterMs: 0,
        reason: "DAILY_LIMIT_REACHED",
        state,
      };
    }

    const elapsed = state.lastOperationAt === null
      ? STAGE_7_MVP_POLICY.operationCooldownMs
      : timestamp - state.lastOperationAt;
    const retryAfterMs = Math.max(0, STAGE_7_MVP_POLICY.operationCooldownMs - elapsed);
    if (retryAfterMs > 0) {
      return {
        allowed: false,
        operation,
        remaining,
        retryAfterMs,
        reason: "COOLDOWN_ACTIVE",
        state,
      };
    }

    return {
      allowed: true,
      operation,
      remaining,
      retryAfterMs: 0,
      state,
    };
  }

  return {
    inspect: (operation: MeteredOperation) => exclusive(() => inspect(operation)),
    reserve: (operation: MeteredOperation) => exclusive(async (): Promise<UsageDecision> => {
      const decision = await inspect(operation);
      if (!decision.allowed) {
        return decision;
      }

      const timestamp = now();
      const state = {
        ...increment(decision.state, operation),
        lastOperationAt: timestamp,
      };
      await storage.set(DAILY_USAGE_STORAGE_KEY, state);
      return {
        allowed: true,
        operation,
        remaining: Math.max(0, getDailyLimit(operation) - countFor(state, operation)),
        retryAfterMs: 0,
        state,
      };
    }),
  };
}
