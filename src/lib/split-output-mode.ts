export const SPLIT_OUTPUT_MODES = ["single-zip", "individual-pdfs", "separate-zips"] as const;
export type SplitOutputMode = (typeof SPLIT_OUTPUT_MODES)[number];

export const SPLIT_OUTPUT_MODE_DEFAULT: SplitOutputMode = "single-zip";

export function isSplitOutputMode(value: unknown): value is SplitOutputMode {
  return typeof value === "string" && (SPLIT_OUTPUT_MODES as readonly string[]).includes(value);
}

export function normalizeSplitOutputMode(value: unknown): SplitOutputMode {
  return isSplitOutputMode(value) ? value : SPLIT_OUTPUT_MODE_DEFAULT;
}
