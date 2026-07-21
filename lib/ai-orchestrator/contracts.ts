export type GoalKind =
  | "email"
  | "portal"
  | "print"
  | "archive"
  | "reduce_size"
  | "custom";

export type CompressionIntent = "light" | "balanced" | "maximum";
export type PrintQuality = "standard" | "high";
export type ArchivePreference = "smaller_file" | "preserve_quality";

export type UserGoal =
  | {
      kind: "email";
      targetSizeMb: number;
    }
  | {
      kind: "portal";
      targetSizeMb: number;
    }
  | {
      kind: "print";
      quality: PrintQuality;
    }
  | {
      kind: "archive";
      preference: ArchivePreference;
    }
  | {
      kind: "reduce_size";
      compressionIntent: CompressionIntent;
    }
  | {
      kind: "custom";
      requirement: string;
    };

export interface DocumentProfile {
  pageCount: number;
  fileSizeBytes: number;
  imageObjectCount: number;
  scannedRatio: number;
  textRatio: number;
  vectorRatio: number;
  complexitySignals: readonly string[];
}

export type BenchmarkStatus = "missing" | "measured" | "stale" | "unavailable";

export interface LocalBenchmark {
  status: BenchmarkStatus;
  pagesPerMinute?: number;
  measuredAt?: string;
  engineVersion?: string;
}

export interface LocalCapabilities {
  available: boolean;
  logicalCores?: number;
  memoryClassGb?: number;
  wasmSupported: boolean;
  browserPlatform?: string;
  benchmark: LocalBenchmark;
}

export type OfficeAvailability = "ready" | "busy" | "unavailable";

export interface OfficeBenchmark {
  pagesPerMinute?: number;
  measuredAt?: string;
  preset?: PlannerPreset;
}

export interface OfficeCapabilities {
  availability: OfficeAvailability;
  cpuCores?: number;
  memoryMb?: number;
  engineMemoryLimitMb?: number;
  queueDepth?: number;
  maxConcurrentJobs?: number;
  ghostscriptVersion?: string;
  maxFileSizeMb?: number;
  presets: readonly PlannerPreset[];
  benchmark?: OfficeBenchmark;
  unavailableReason?: string;
}

export interface CapacityProfile {
  id: string;
  cpuCores: number;
  memoryMb: number;
  label: string;
}

export interface ComputeSnapshot {
  local: LocalCapabilities;
  office: OfficeCapabilities;
  capacityCatalog: readonly CapacityProfile[];
  collectedAt: string;
}

export interface PlannerRequest {
  schemaVersion: "1";
  documentProfile: DocumentProfile;
  userGoal: UserGoal;
  localCapabilities: LocalCapabilities;
  officeCapabilities: OfficeCapabilities;
  capacityCatalog: readonly CapacityProfile[];
}

export type RecommendedRoute = "local" | "office_current";
export type PlannerPreset = "safe" | "balanced" | "strong";
export type CapacityAssessment =
  | "recommended"
  | "sufficient"
  | "sufficient_but_slower"
  | "insufficient"
  | "unavailable"
  | "excessive";
export type PlannerConfidence = "low" | "medium" | "high";

export interface RuntimeEstimateSeconds {
  min: number;
  max: number;
}

export interface PlannerResponse {
  schemaVersion: "1";
  recommendedRoute: RecommendedRoute;
  recommendedPreset: PlannerPreset;
  currentLocalAssessment: CapacityAssessment;
  currentOfficeAssessment: CapacityAssessment;
  idealConfiguration: CapacityProfile;
  oversizedConfiguration?: CapacityProfile & {
    reason: string;
  };
  estimatedRuntime: {
    local?: RuntimeEstimateSeconds;
    officeCurrent?: RuntimeEstimateSeconds;
    idealConfiguration?: RuntimeEstimateSeconds;
  };
  explanation: string;
  confidence: PlannerConfidence;
}
