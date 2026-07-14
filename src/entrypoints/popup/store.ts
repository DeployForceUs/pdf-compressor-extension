import { create } from "zustand";
import type {
  CompressionEngineStatus,
  CompressionStage,
  CompressionStatus,
  SplitArtifactDescriptor,
  SplitProgressStage,
  SplitOutputMode,
  SplitWarning,
} from "../../lib/messaging";
import { SPLIT_OUTPUT_MODE_DEFAULT } from "../../lib/messaging";
import type { SplitStrategy } from "../../lib/pdf/split-strategies";
import { SELECTED_PDF_RECORD_ID } from "../../lib/pdf-records";

export { SELECTED_PDF_RECORD_ID };

export type PanelStatus = "idle" | "validating" | "ready" | "error";

export type DiagnosticSnapshot = {
  checked: boolean;
  durationMs: number | null;
  error: string;
};

export type StorageSummary = {
  savedBytes: number;
  readBytes: number;
  compareEqual: boolean;
  deleteOk: boolean;
  missingRecordVerified: boolean;
};

export type SelectedPdfSnapshot = {
  status: PanelStatus;
  selected: boolean;
  fileName: string | null;
  fileSize: number;
  pageCount: number | null;
  mimeType: string | null;
  recordId: string | null;
  storedByteLength: number | null;
  readBackByteLength: number | null;
  error: string;
};

export type CompressionSnapshot = {
  status: CompressionStatus;
  engineStatus: CompressionEngineStatus;
  progress: number;
  stage: CompressionStage | "idle";
  error: string;
  recordId: string | null;
  fileName: string | null;
  originalSize: number | null;
  compressedSize: number | null;
  savedBytes: number | null;
  savedPercent: number | null;
  pageCount: number | null;
  resultAvailable: boolean;
};

export type SplitStatus = "idle" | "loading" | "running" | "cancelling" | "complete" | "cancelled" | "error";

export type SplitSnapshot = {
  status: SplitStatus;
  progress: number;
  stage: SplitProgressStage | "idle";
  error: string;
  recordId: string | null;
  outputMode: SplitOutputMode;
  currentPart: number | null;
  partsCount: number | null;
  progressMessage: string;
  sourceByteSize: number | null;
  compressedCandidateByteSize: number | null;
  selectedByteSize: number | null;
  fallbackUsed: boolean | null;
  zipBlobId: string | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  originalSize: number | null;
  totalPartsSize: number | null;
  artifacts: SplitArtifactDescriptor[];
  strategy: SplitStrategy["type"];
  pagesPerPart: string;
  maxPartSizeMb: string;
  manualRanges: string;
  compressAfter: boolean;
  compressAfterRequested: boolean;
  originalSplitPartsSize: number | null;
  finalPartsSize: number | null;
  compressedPartsCount: number | null;
  fallbackPartsCount: number | null;
  totalBytesSaved: number | null;
  warnings: SplitWarning[];
  resultAvailable: boolean;
};

export type PopupStoreState = {
  pdf: SelectedPdfSnapshot;
  compression: CompressionSnapshot;
  split: SplitSnapshot;
  background: DiagnosticSnapshot;
  offscreen: DiagnosticSnapshot;
  storage: DiagnosticSnapshot & {
    summary: StorageSummary | null;
  };
  diagnosticsOpen: boolean;
  dragActive: boolean;
  setPdf: (next: Partial<SelectedPdfSnapshot>) => void;
  resetPdf: () => void;
  setCompression: (next: Partial<CompressionSnapshot>) => void;
  resetCompression: () => void;
  setSplit: (next: Partial<SplitSnapshot>) => void;
  resetSplit: () => void;
  setBackground: (next: Partial<DiagnosticSnapshot>) => void;
  setOffscreen: (next: Partial<DiagnosticSnapshot>) => void;
  setStorage: (next: Partial<PopupStoreState["storage"]>) => void;
  setDiagnosticsOpen: (diagnosticsOpen: boolean) => void;
  setDragActive: (dragActive: boolean) => void;
};

function asSplitArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

const initialPdf: SelectedPdfSnapshot = {
  status: "idle",
  selected: false,
  fileName: null,
  fileSize: 0,
  pageCount: null,
  mimeType: null,
  recordId: null,
  storedByteLength: null,
  readBackByteLength: null,
  error: "",
};

const initialCompression: CompressionSnapshot = {
  status: "idle",
  engineStatus: "loading",
  progress: 0,
  stage: "idle",
  error: "",
  recordId: null,
  fileName: null,
  originalSize: null,
  compressedSize: null,
  savedBytes: null,
  savedPercent: null,
  pageCount: null,
  resultAvailable: false,
};

const initialSplit: SplitSnapshot = {
  status: "idle",
  progress: 0,
  stage: "idle",
  error: "",
  recordId: null,
  outputMode: SPLIT_OUTPUT_MODE_DEFAULT,
  currentPart: null,
  partsCount: null,
  progressMessage: "",
  sourceByteSize: null,
  compressedCandidateByteSize: null,
  selectedByteSize: null,
  fallbackUsed: null,
  zipBlobId: null,
  fileName: null,
  mimeType: null,
  size: null,
  originalSize: null,
  totalPartsSize: null,
  artifacts: [],
  strategy: "by-pages",
  pagesPerPart: "20",
  maxPartSizeMb: "10",
  manualRanges: "",
  compressAfter: false,
  compressAfterRequested: false,
  originalSplitPartsSize: null,
  finalPartsSize: null,
  compressedPartsCount: null,
  fallbackPartsCount: null,
  totalBytesSaved: null,
  warnings: [],
  resultAvailable: false,
};

const initialDiagnostic: DiagnosticSnapshot = {
  checked: false,
  durationMs: null,
  error: "",
};

export function normalizeSplitSnapshot(snapshot: Partial<SplitSnapshot> | null | undefined): SplitSnapshot {
  const next = snapshot ?? {};

  return {
    ...initialSplit,
    ...next,
    outputMode: next.outputMode ?? SPLIT_OUTPUT_MODE_DEFAULT,
    artifacts: asSplitArray(next.artifacts),
    warnings: asSplitArray(next.warnings),
    pagesPerPart: typeof next.pagesPerPart === "string" ? next.pagesPerPart : initialSplit.pagesPerPart,
    maxPartSizeMb: typeof next.maxPartSizeMb === "string" ? next.maxPartSizeMb : initialSplit.maxPartSizeMb,
    manualRanges: typeof next.manualRanges === "string" ? next.manualRanges : initialSplit.manualRanges,
    strategy: next.strategy ?? initialSplit.strategy,
  };
}

export const usePopupStore = create<PopupStoreState>((set) => ({
  pdf: initialPdf,
  compression: initialCompression,
  split: initialSplit,
  background: initialDiagnostic,
  offscreen: initialDiagnostic,
  storage: {
    ...initialDiagnostic,
    summary: null,
  },
  diagnosticsOpen: false,
  dragActive: false,
  setPdf: (next) =>
    set((state) => ({
      pdf: {
        ...state.pdf,
        ...next,
      },
    })),
  resetPdf: () =>
    set({
      pdf: initialPdf,
    }),
  setCompression: (next) =>
    set((state) => ({
      compression: {
        ...state.compression,
        ...next,
      },
    })),
  resetCompression: () =>
    set((state) => ({
      compression: {
        ...initialCompression,
        engineStatus: state.compression.engineStatus,
      },
    })),
  setSplit: (next) =>
    set((state) => ({
      split: normalizeSplitSnapshot({
        ...state.split,
        ...next,
      }),
    })),
  resetSplit: () =>
    set((state) => ({
      split: normalizeSplitSnapshot({
        ...initialSplit,
        strategy: state.split.strategy,
        pagesPerPart: state.split.pagesPerPart,
        maxPartSizeMb: state.split.maxPartSizeMb,
        manualRanges: state.split.manualRanges,
        compressAfter: state.split.compressAfter,
      }),
    })),
  setBackground: (next) =>
    set((state) => ({
      background: {
        ...state.background,
        ...next,
      },
    })),
  setOffscreen: (next) =>
    set((state) => ({
      offscreen: {
        ...state.offscreen,
        ...next,
      },
    })),
  setStorage: (next) =>
    set((state) => ({
      storage: {
        ...state.storage,
        ...next,
      },
    })),
  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),
  setDragActive: (dragActive) => set({ dragActive }),
}));
