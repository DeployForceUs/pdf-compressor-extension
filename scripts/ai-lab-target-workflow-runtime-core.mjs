import {
  assertTargetWorkflowPlan,
  decideTargetWorkflowCompletion,
} from "./ai-lab-target-workflow-contract.mjs";

export function claimCompressedResultHandoff({ resultMetadata, persistedRecord }) {
  if (!resultMetadata || typeof resultMetadata !== "object") {
    throw new Error("compressed_result_metadata_missing");
  }
  if (typeof resultMetadata.id !== "string" || !resultMetadata.id) {
    throw new Error("compressed_result_record_id_missing");
  }
  if (!persistedRecord || typeof persistedRecord !== "object") {
    throw new Error("compressed_result_persisted_record_missing");
  }
  if (persistedRecord.id !== resultMetadata.id) {
    throw new Error("compressed_result_record_mismatch");
  }

  const data = persistedRecord.data;
  const byteLength = data?.byteLength ?? data?.length;
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error("compressed_result_bytes_reference_missing");
  }

  return Object.freeze({
    owner: "target-workflow-coordinator",
    recordId: persistedRecord.id,
    sourceRecordId: persistedRecord.sourceRecordId ?? resultMetadata.sourceRecordId ?? null,
    byteLength,
    metadata: Object.freeze({ ...resultMetadata }),
  });
}

export async function executeTargetWorkflowCompletion({
  plan,
  actualBytes,
  resultKind = "compressed",
  result,
  readPersistedResult,
  storeSelectedPdf,
  sendMessage,
  completePdf,
}) {
  if (typeof readPersistedResult !== "function") {
    throw new Error("target_workflow_read_dependency_missing");
  }
  if (typeof storeSelectedPdf !== "function") {
    throw new Error("target_workflow_store_dependency_missing");
  }
  if (typeof sendMessage !== "function") {
    throw new Error("target_workflow_message_dependency_missing");
  }
  if (typeof completePdf !== "function") {
    throw new Error("target_workflow_complete_dependency_missing");
  }

  const persistedRecord = await readPersistedResult(result?.id);
  const ownership = claimCompressedResultHandoff({
    resultMetadata: result,
    persistedRecord,
  });

  const contract = assertTargetWorkflowPlan(plan);
  const decision = decideTargetWorkflowCompletion({
    contract,
    actualBytes: Number.isFinite(actualBytes) ? actualBytes : ownership.byteLength,
    resultKind,
  });

  if (decision.action === "complete_pdf") {
    await completePdf(result, ownership);
    return Object.freeze({ action: "complete_pdf", ownership });
  }

  await storeSelectedPdf(persistedRecord, ownership);
  const response = await sendMessage(decision.request, ownership);
  if (response?.ok === false) {
    throw new Error(response.error || response.code || "split_start_rejected");
  }

  return Object.freeze({
    action: "split_zip",
    request: decision.request,
    response: response ?? null,
    ownership,
  });
}
