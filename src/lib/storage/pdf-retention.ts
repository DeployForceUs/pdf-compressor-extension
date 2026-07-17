import { cleanupExpiredCompressionResults } from "./pdf-compression-db";
import { cleanupExpiredPdfRecords } from "./pdf-records-db";
import { cleanupExpiredSplitResults } from "./pdf-split-bundles-db";

export const PDF_RETENTION_MS = 24 * 60 * 60 * 1000;
export const PDF_RETENTION_ALARM_NAME = "pdf-binary-retention-cleanup";
export const PDF_RETENTION_ALARM_PERIOD_MINUTES = 60;

export type PdfRetentionCleanupResult = {
  cutoff: number;
  sourceRecordsDeleted: number;
  compressionResultsDeleted: number;
  splitBundlesDeleted: number;
};

export async function cleanupExpiredPdfData(now = Date.now()): Promise<PdfRetentionCleanupResult> {
  const cutoff = now - PDF_RETENTION_MS;
  const [sourceRecordsDeleted, compressionResultsDeleted, splitBundlesDeleted] = await Promise.all([
    cleanupExpiredPdfRecords(cutoff, now),
    cleanupExpiredCompressionResults(cutoff),
    cleanupExpiredSplitResults(cutoff),
  ]);

  return {
    cutoff,
    sourceRecordsDeleted,
    compressionResultsDeleted,
    splitBundlesDeleted,
  };
}
