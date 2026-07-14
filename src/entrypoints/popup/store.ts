import { create } from "zustand";
import type { CompressionEngineStatus, CompressionStage, CompressionStatus } from "../../lib/messaging";
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

export type PopupStoreState = {
  pdf: SelectedPdfSnapshot;
  compression: CompressionSnapshot;
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
  setBackground: (next: Partial<DiagnosticSnapshot>) => void;
  setOffscreen: (next: Partial<DiagnosticSnapshot>) => void;
  setStorage: (next: Partial<PopupStoreState["storage"]>) => void;
  setDiagnosticsOpen: (diagnosticsOpen: boolean) => void;
  setDragActive: (dragActive: boolean) => void;
};

const initialPdf: SelectedPdfSnapshot = {
  status: "idle",
  selected: false,
  fileName: null,
  fileSize: 0,
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

const initialDiagnostic: DiagnosticSnapshot = {
  checked: false,
  durationMs: null,
  error: "",
};

export const usePopupStore = create<PopupStoreState>((set) => ({
  pdf: initialPdf,
  compression: initialCompression,
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
