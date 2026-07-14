import type { LicenseCheckResult } from "./license";
import type { UsageDecision } from "./limits";
import type { MeteredOperation } from "./policy";

export type OperationAuthorization =
  | { allowed: true; tier: "free" | "pro"; operation: MeteredOperation; remaining: number | null }
  | {
      allowed: false;
      code: "PRO_REQUIRED" | "FREE_DAILY_LIMIT_REACHED" | "FREE_COOLDOWN_ACTIVE";
      operation: MeteredOperation;
      remaining: number;
      retryAfterMs: number;
    };

export type OperationAuthorizationDependencies = {
  checkLicense: () => Promise<LicenseCheckResult>;
  reserveUsage: (operation: MeteredOperation) => Promise<UsageDecision>;
};

export function createOperationAuthorizer({
  checkLicense,
  reserveUsage,
}: OperationAuthorizationDependencies) {
  return async function authorizeOperation(
    operation: MeteredOperation,
    options: { proRequired?: boolean } = {},
  ): Promise<OperationAuthorization> {
    const license = await checkLicense();
    if (license.valid) {
      return { allowed: true, tier: "pro", operation, remaining: null };
    }

    if (options.proRequired) {
      return {
        allowed: false,
        code: "PRO_REQUIRED",
        operation,
        remaining: 0,
        retryAfterMs: 0,
      };
    }

    const usage = await reserveUsage(operation);
    if (usage.allowed) {
      return {
        allowed: true,
        tier: "free",
        operation,
        remaining: usage.remaining,
      };
    }

    return {
      allowed: false,
      code: usage.reason === "COOLDOWN_ACTIVE"
        ? "FREE_COOLDOWN_ACTIVE"
        : "FREE_DAILY_LIMIT_REACHED",
      operation,
      remaining: usage.remaining,
      retryAfterMs: usage.retryAfterMs,
    };
  };
}
