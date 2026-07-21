export const TARGET_WORKFLOW_SCHEMA_VERSION = "1";

export function assertTargetWorkflowPlan(plan) {
  const split = plan?.processingPlan?.split;
  if (!split || split.enabled !== true) {
    throw new Error("target_workflow_split_required");
  }
  if (split.strategy !== "by-max-size") {
    throw new Error("target_workflow_strategy_invalid");
  }
  if (!Number.isFinite(split.targetPartSizeMb) || split.targetPartSizeMb <= 0) {
    throw new Error("target_workflow_target_invalid");
  }
  if (split.outputMode !== "single-zip") {
    throw new Error("target_workflow_output_invalid");
  }
  return Object.freeze({
    schemaVersion: TARGET_WORKFLOW_SCHEMA_VERSION,
    targetPartSizeMb: split.targetPartSizeMb,
    targetBytes: Math.floor(split.targetPartSizeMb * 1024 * 1024),
    strategy: split.strategy,
    outputMode: split.outputMode,
  });
}

export function decideTargetWorkflowCompletion({ contract, actualBytes, resultKind = "compressed" }) {
  if (!contract || !Number.isFinite(contract.targetBytes) || contract.targetBytes <= 0) {
    throw new Error("target_workflow_contract_missing");
  }
  if (!Number.isFinite(actualBytes) || actualBytes < 0) {
    throw new Error("target_workflow_result_size_invalid");
  }

  if (resultKind !== "original" && actualBytes <= contract.targetBytes) {
    return Object.freeze({ action: "complete_pdf" });
  }

  return Object.freeze({
    action: "split_zip",
    request: Object.freeze({
      type: "split:local",
      strategy: Object.freeze({
        type: contract.strategy,
        maxPartSizeBytes: Math.max(1, Math.floor(contract.targetBytes * 0.95)),
      }),
      outputMode: contract.outputMode,
      compressAfter: false,
    }),
  });
}
