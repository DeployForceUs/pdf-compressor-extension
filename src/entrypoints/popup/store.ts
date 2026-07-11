import { create } from "zustand";

export const SELECTED_PDF_RECORD_ID = "selected-pdf";

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

export type PopupStoreState = {
  pdf: SelectedPdfSnapshot;
  background: DiagnosticSnapshot;
  offscreen: DiagnosticSnapshot;
  storage: DiagnosticSnapshot & {
    summary: StorageSummary | null;
  };
  diagnosticsOpen: boolean;
  dragActive: boolean;
  setPdf: (next: Partial<SelectedPdfSnapshot>) => void;
  resetPdf: () => void;
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

const initialDiagnostic: DiagnosticSnapshot = {
  checked: false,
  durationMs: null,
  error: "",
};

export const usePopupStore = create<PopupStoreState>((set) => ({
  pdf: initialPdf,
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
