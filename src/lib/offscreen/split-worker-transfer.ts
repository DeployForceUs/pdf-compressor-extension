import { transfer } from "comlink";
import type { SplitArchiveOutcome } from "../pdf/split-archive";

export type SplitWorkerReturnPayload = SplitArchiveOutcome;
export type SplitWorkerReturnPlan = {
  payload: SplitWorkerReturnPayload;
  transferables: ArrayBuffer[];
};

function collectSplitTransferables(outcome: SplitArchiveOutcome) {
  const transferables = new Set<ArrayBuffer>();

  if (outcome.zipBytes) {
    transferables.add(outcome.zipBytes);
  }

  for (const artifact of outcome.artifacts) {
    transferables.add(artifact.data);
  }

  return [...transferables];
}

export function planSplitWorkerReturn(outcome: SplitArchiveOutcome): SplitWorkerReturnPlan {
  const transferables = collectSplitTransferables(outcome);

  if (transferables.length <= 1) {
    return {
      payload: outcome,
      transferables,
    };
  }

  return {
    payload: outcome,
    transferables: [],
  };
}

export function getSplitWorkerTransferables(outcome: SplitArchiveOutcome) {
  return collectSplitTransferables(outcome);
}

export function transferSplitWorkerReturn(outcome: SplitArchiveOutcome): SplitWorkerReturnPayload {
  const plan = planSplitWorkerReturn(outcome);
  return plan.transferables.length > 0 ? transfer(plan.payload, plan.transferables) : plan.payload;
}
