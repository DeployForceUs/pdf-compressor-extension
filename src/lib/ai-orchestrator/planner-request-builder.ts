import type {
  ComputeSnapshot,
  DocumentProfile,
  PlannerRequest,
  UserGoal,
} from "../../../lib/ai-orchestrator/contracts";

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid_${field}`);
  }
}

function validateDocumentProfile(profile: DocumentProfile): void {
  assertFiniteNonNegative(profile.pageCount, "page_count");
  assertFiniteNonNegative(profile.fileSizeBytes, "file_size_bytes");
  assertFiniteNonNegative(profile.imageObjectCount, "image_object_count");
  assertFiniteNonNegative(profile.scannedRatio, "scanned_ratio");
  assertFiniteNonNegative(profile.textRatio, "text_ratio");
  assertFiniteNonNegative(profile.vectorRatio, "vector_ratio");
}

function validateUserGoal(goal: UserGoal): void {
  if (
    (goal.kind === "email" || goal.kind === "portal") &&
    (!Number.isFinite(goal.targetSizeMb) || goal.targetSizeMb <= 0)
  ) {
    throw new Error("invalid_target_size_mb");
  }

  if (goal.kind === "custom" && goal.requirement.trim().length === 0) {
    throw new Error("invalid_custom_requirement");
  }
}

export function buildPlannerRequest({
  documentProfile,
  userGoal,
  computeSnapshot,
}: {
  documentProfile: DocumentProfile;
  userGoal: UserGoal;
  computeSnapshot: ComputeSnapshot;
}): PlannerRequest {
  validateDocumentProfile(documentProfile);
  validateUserGoal(userGoal);

  if (computeSnapshot.capacityCatalog.length === 0) {
    throw new Error("capacity_catalog_empty");
  }

  return {
    schemaVersion: "1",
    documentProfile,
    userGoal,
    localCapabilities: computeSnapshot.local,
    officeCapabilities: computeSnapshot.office,
    capacityCatalog: computeSnapshot.capacityCatalog,
  };
}
