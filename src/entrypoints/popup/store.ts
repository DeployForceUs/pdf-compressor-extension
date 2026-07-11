import { create } from "zustand";

export type HealthState = {
  loading: boolean;
  background: string;
  offscreen: string;
  storage: string;
  lastError: string;
};

type HealthActions = {
  setLoading(loading: boolean): void;
  setBackground(message: string): void;
  setOffscreen(message: string): void;
  setStorage(message: string): void;
  setError(message: string): void;
  reset(): void;
};

const initialState: HealthState = {
  loading: false,
  background: "unknown",
  offscreen: "unknown",
  storage: "not run",
  lastError: "",
};

export const useHealthStore = create<HealthState & HealthActions>((set) => ({
  ...initialState,
  setLoading: (loading) => set({ loading }),
  setBackground: (background) => set({ background }),
  setOffscreen: (offscreen) => set({ offscreen }),
  setStorage: (storage) => set({ storage }),
  setError: (lastError) => set({ lastError }),
  reset: () => set(initialState),
}));
