import type { SmartPlannerDocumentProfile } from "../ai/smart-planner-contract";
import type { DocumentProfile } from "../../../lib/ai-orchestrator/contracts";

function pushSignal(signals: string[], condition: boolean, signal: string) {
  if (condition) signals.push(signal);
}

export function adaptSmartPlannerDocumentProfile(
  profile: SmartPlannerDocumentProfile,
): DocumentProfile {
  const complexitySignals: string[] = [];

  pushSignal(complexitySignals, profile.pageCount >= 200, "large_page_count");
  pushSignal(complexitySignals, profile.fileSizeBytes >= 100 * 1024 * 1024, "large_file_size");
  pushSignal(complexitySignals, profile.imageObjectCount >= profile.pageCount * 2, "image_dense");
  pushSignal(complexitySignals, profile.scannedPageRatio >= 0.75, "scan_dominant");
  pushSignal(complexitySignals, profile.textPageRatio >= 0.75, "text_dominant");
  pushSignal(complexitySignals, profile.vectorPageRatio >= 0.5, "vector_heavy");
  pushSignal(complexitySignals, profile.estimatedDpiBuckets.over300 >= 0.5, "high_dpi_images");
  pushSignal(complexitySignals, profile.codecCounts.jpx > 0, "contains_jpx_images");
  pushSignal(
    complexitySignals,
    profile.pageSizeDistributionBytes.p90 >= 5 * 1024 * 1024,
    "large_page_streams",
  );

  if (complexitySignals.length === 0) complexitySignals.push("standard_complexity");

  return {
    pageCount: profile.pageCount,
    fileSizeBytes: profile.fileSizeBytes,
    imageObjectCount: profile.imageObjectCount,
    scannedRatio: profile.scannedPageRatio,
    textRatio: profile.textPageRatio,
    vectorRatio: profile.vectorPageRatio,
    complexitySignals,
  };
}
