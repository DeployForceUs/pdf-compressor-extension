import type { PdfReadResponse, PdfRecord, PdfStoreResponse } from "../../lib/messaging";

export type SelectedPdfStoreTransport = {
  store: (record: PdfRecord) => Promise<PdfStoreResponse | { ok: false; error: string }>;
  read: (recordId: string) => Promise<PdfReadResponse>;
};

export type SelectedPdfPersistenceResult = {
  storeResponse: PdfStoreResponse;
  readBack: PdfReadResponse;
};

export async function persistSelectedPdfRecord(
  record: PdfRecord,
  transport: SelectedPdfStoreTransport,
): Promise<SelectedPdfPersistenceResult> {
  const storeResponse = await transport.store(record);
  if (!storeResponse.ok) {
    throw new Error(storeResponse.error);
  }

  const readBack = await transport.read(record.id);
  if (!readBack.record) {
    throw new Error(`Local PDF record was not returned after persistence (recordId=${record.id})`);
  }

  return {
    storeResponse,
    readBack,
  };
}
