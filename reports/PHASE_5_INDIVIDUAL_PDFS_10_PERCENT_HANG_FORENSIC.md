# Summary
The browser regression is not inside the core split algorithm. The narrow failing boundary is the first awaited browser worker call in `src/lib/offscreen/split-runtime.ts`:

`await deps.workerApi.split(...)`

The pure engine path `createSplitZipArchive(...)` completes in Node for all three output modes, so the browser hang is in the worker RPC / return path, not in split planning or PDF part generation itself.

The separate compression-disable symptom is a popup startup/state gating issue: the Compress button is gated by `compression.engineStatus === "ready"` in `src/entrypoints/popup/main.tsx`, and the current first-open path depends on an async health check resolving before the button becomes usable.

# Exact Reproduction
Source PDF: `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`

Settings:
- Output mode: `Individual PDFs`
- Strategy: `By pages`
- Pages per part: `20`
- Compress each part after splitting: `OFF`

Observed popup behavior:
- Split starts
- Progress reaches `10%`
- Stage shows `Planning parts`
- No parts are created
- No terminal result appears

Observed compression behavior:
- Valid PDF selection completes
- File details show the PDF as ready
- Compress PDF remains disabled until the compression engine health path reports ready

# Specification Compliance
## Fully matches specification
- Split output modes are declared and threaded through the request path.
- The popup renders the three modes and restored split metadata.
- The split engine supports all three output modes in code.

## Partially matches specification
- Browser execution of `individual-pdfs` does not complete, so the browser path is not yet production-stable.
- Compression enablement depends on an async health check and can remain disabled on first open/selection.

# Chrome Evidence
- The last visible UI state is `10%` with `Planning parts`.
- No `creating-part`, `validating-part`, `creating-artifacts`, `creating-zip`, `split:result`, or `split:error` event is observed in the browser flow.
- The browser therefore stops after the popup dispatches the split request and before any worker-generated progress is observed.

# Message Flow Timeline
Popup `Split PDF`
→ `background:split-start`
→ `offscreen:split`
→ `runSplitJob(...)`
→ `await deps.workerApi.split(...)`
→ stall

For compression:
Popup selection
→ `restoreCompressionEngine()`
→ async health check
→ `compressionCanStart` remains false until `compression.engineStatus === "ready"`

# Last Successful Boundary
The last confirmed successful boundary is the popup emitting the `planning-parts` progress event from `src/lib/offscreen/split-runtime.ts`.

# Exact Stuck Location
`src/lib/offscreen/split-runtime.ts:85`

`outcome = await deps.workerApi.split(splitRequest, deps.isCancelled, deps.onProgress);`

The browser-only failure is downstream of that call, inside the worker boundary.

# Root Cause
## Split hang
The browser stall is in the worker RPC / serialization boundary, not in `createSplitZipArchive(...)`.

Evidence:
- Direct Node execution of `createSplitZipArchive(...)` completes for `single-zip`, `individual-pdfs`, and `separate-zips`.
- The offscreen runtime never reaches persistence or result broadcast in the hanging browser flow.
- The only browser-specific boundary left between the last visible 10% event and the core algorithm completion is the Comlink worker call and its returned transfer payload in `src/lib/offscreen/worker.ts`.

## Compress disabled
The Compress button is disabled because the popup requires `compression.engineStatus === "ready"` before enabling start.

The first-open flow depends on `restoreCompressionEngine()` finishing successfully. If that async health check has not yet resolved, the button remains disabled even after a valid PDF is selected.

# Why Tests Passed
- The existing Node tests exercise `createSplitZipArchive(...)` and the storage layer directly.
- Those tests bypass the browser service worker, offscreen document, and Comlink worker transport.
- As a result, they do not reproduce the browser-only stall at the worker RPC boundary.

# Regression Boundary
The behavior is consistent with the recent artifact-mode/browser integration work in `feat(split): add artifact factory output modes` and the popup initialization changes, but the specific hang is in the browser relay path rather than in the split algorithm itself.

# Narrow Fix Options
1. Instrument and harden the worker return path for multi-artifact results, especially `transfer(outcome, [...transferables])` in `src/lib/offscreen/worker.ts`.
2. Decouple Compress button enablement from the first health-check race, or surface an explicit loading state until `restoreCompressionEngine()` resolves.

# Recommended Fix
First fix the worker RPC / transfer boundary for `split`. The compression enablement issue is separate and should be addressed only after the split worker path is stable.

# Risks
- Changing the worker return path incorrectly can break all split output modes.
- Relaxing the compression enablement condition without a proper readiness signal would hide startup failures.

# Decision
ROOT_CAUSE_FOUND
