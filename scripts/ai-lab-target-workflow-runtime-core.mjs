import {
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "./ai-lab-target-workflow-contract.mjs";

export async function executeTargetWorkflowCompletion({
  plan,
  actualBytes,
  resultKind = "compressed",
  result,
  storeSelectedPdf,
  sendMessage,
  completePdf,
}) {
  if (typeof storeSelectedPdf !== "function") {
    throw new Error("target_workflow_store_dependency_missing");
  }
  if (typeof sendMessage !== "function") {
    throw new Error("target_workflow_message_dependency_missing");
  }
  if (typeof completePdf !== "function") {
    throw new Error("target_workflow_complete_dependency_missing");
  }

  const contract = assertTargetWorkflowPlan(plan);
  const decision = decideTargetWorkflowCompletion({
    contract,
    actualBytes,
    resultKind,
  });

  if (decision.action === "complete_pdf") {
    await completePdf(result);
    return Object.freeze({ action: "complete_pdf" });
  }

  await storeSelectedPdf(result);
  const response = await sendMessage(decision.request);
  if (response?.ok === false) {
    throw new Error(response.error || response.code || "split_start_rejected");
  }

  return Object.freeze({
    action: "split_zip",
    request: decision.request,
    response: response ?? null,
  });
}
