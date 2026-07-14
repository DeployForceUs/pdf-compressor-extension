export const STAGE_7_MVP_POLICY = Object.freeze({
  proPriceUsd: 29,
  dailyCompressionLimit: 3,
  dailySplitLimit: 10,
  operationCooldownMs: 10_000,
  licenseModel: "perpetual-one-time" as const,
  licenseBinding: "none" as const,
  licenseServerRequired: false,
  offlineGracePeriodMs: 0,
});

export type MeteredOperation = "compression" | "split";

export function getDailyLimit(operation: MeteredOperation) {
  return operation === "compression"
    ? STAGE_7_MVP_POLICY.dailyCompressionLimit
    : STAGE_7_MVP_POLICY.dailySplitLimit;
}
