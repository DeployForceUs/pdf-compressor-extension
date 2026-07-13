# Summary
Implemented the Phase 5 Artifact Factory output-mode slice end to end. The Split pipeline now accepts `single-zip`, `individual-pdfs`, and `separate-zips`, generates the corresponding artifacts from one validated split run, persists them through the existing bundle/artifact model, restores them in the Popup, and exposes per-artifact downloads for the multi-artifact modes.

The current user-visible default remains `single-zip`.

# Specification Compliance

- Output mode contracts and persistence: Extends specification. The canonical spec did not define these three modes; the product decision did.
- Split execution, compression, validation, cancellation, and legacy single-zip compatibility: Fully matches the established Phase 5 requirements.
- Artifact list UI and per-file downloads: Extends specification with the approved product decision.
- Manual Chrome validation: Requires future verification in a real browser session.

# Specification Comparison

The canonical specification remains the source of truth for validation, Split planning, compression, and persistence invariants. This slice does not change those behaviors. It adds the Artifact Factory layer described in the architecture preflight and exposes the three supported output modes requested for this phase.

Where the specification was silent, the implementation follows the confirmed product decisions in this task:

- `single-zip` is the backward-compatible default.
- `individual-pdfs` exposes explicit per-artifact download actions.
- `separate-zips` creates one ZIP per final split part.

# Product Decisions Used

- Keep `single-zip` as the default output mode.
- Render a selector in the Split UI.
- Require explicit per-artifact download actions for the multi-artifact modes.
- Keep the single-zip result button unchanged for the default path.
- Preserve the existing split strategies and compression behavior.

# Implementation Summary

The output-mode value now flows from Popup state into the Split request, through background and offscreen routing, into the split runtime, and into the artifact builder. The split runtime still executes once. Final PDF parts are produced once, then packaged into artifacts according to the selected output mode.

The resulting bundle records the selected output mode plus the ordered artifact IDs. Bundle/artifact persistence remains atomic. Legacy single-zip compatibility still works for restore and delete.

# Architecture/Data Flow Summary

Popup form state -> `buildSplitRequestFromForm()` -> background `split:local` message -> offscreen split runtime -> `createSplitZipArchive()` -> artifact generation -> `writeSplitResultBundle()` -> Popup restore/download.

The bundle store is still the parent record. The artifact store holds the downloadable binary payloads. Multi-artifact results are restored from the bundle plus child artifacts. Legacy single-zip records continue to be read through the compatibility path.

# Exact Semantics Of All Three Output Modes

## single-zip

- One final ZIP artifact is produced.
- That ZIP contains every generated PDF part.
- The Popup keeps the existing single download action.

## individual-pdfs

- One PDF artifact is produced for each final split part.
- Each artifact uses `application/pdf`.
- The Popup shows a bounded artifact list with one explicit download button per PDF.

## separate-zips

- One ZIP artifact is produced for each final split part.
- Each ZIP contains exactly one PDF part.
- The Popup shows a bounded artifact list with one explicit download button per ZIP.

# Files Changed

- `src/lib/messaging.ts`
- `src/entrypoints/background.ts`
- `src/entrypoints/popup/main.tsx`
- `src/entrypoints/popup/split-ui.ts`
- `src/entrypoints/popup/store.ts`
- `src/lib/offscreen/main.ts`
- `src/lib/offscreen/split-runtime.ts`
- `src/lib/offscreen/worker.ts`
- `src/lib/pdf/split-archive.ts`
- `src/lib/storage/pdf-split-bundles-db.ts`
- `src/lib/storage/pdf-split-results-db.ts`
- `src/locales/en/translation.json`
- `src/locales/es/translation.json`
- `src/styles/popup.css`
- `tests/phase5_slice6a.test.ts`
- `tests/phase5_slice6b_a.test.ts`
- `tests/phase5_slice7.test.ts`
- `tests/phase5_slice8a.test.ts`
- `tests/phase5_slice9_passwordless_encrypted_split.test.ts`
- `tests/phase5_slice12_artifact_factory_foundation.test.ts`
- `tests/phase5_slice13_artifact_factory_output_modes.test.ts`

# Request Plumbing Changes

- Added `outputMode` to the Split request contracts.
- Added `SPLIT_OUTPUT_MODE_DEFAULT`.
- Added `normalizeSplitOutputMode()`.
- Added a dedicated `creating-artifacts` progress stage for multi-artifact packaging.
- Threaded output mode through Popup -> background -> offscreen -> worker -> split archive.

# Persistence Changes

- Persisted `outputMode` in `SplitResultBundle`.
- Persisted ordered `artifactIds`.
- Stored child artifact records for each output mode.
- Kept bundle/artifact writes atomic.
- Preserved quota error normalization.
- Preserved legacy single-zip compatibility reads and deletes.

# UI Changes

- Added an output-mode selector to the Split section.
- Added localized labels and descriptions for all three modes.
- Added a bounded artifact list for multi-artifact results.
- Kept the single-zip result button for the default mode.
- Added per-artifact download buttons for individual PDFs and separate ZIPs.

# Popup Crash Fix

After commit `26a01aca4c93fdea742c6c17c7fc08a5fa8d1de8`, the Popup could crash on first open with `Cannot read properties of undefined (reading 'length')`.

The source-map stack pointed at the split result render block in `src/entrypoints/popup/main.tsx`:

- `splitWarningsCount = split.warnings.length` around line `1247`
- `split.artifacts.length > 0` around line `1541`
- `split.artifacts.length` in the artifact header around line `1567`

Root cause:

- the new split result view assumed `warnings` and `artifacts` were always initialized arrays;
- first-open and restore paths could still pass through partially shaped split state;
- the render path dereferenced `.length` before normalization.

Fix:

- added `normalizeSplitSnapshot()` in `src/entrypoints/popup/store.ts`;
- normalized split state in the store setter/reset path;
- normalized split state in the Popup selector before render;
- normalized bundle metadata arrays in `src/lib/storage/pdf-split-bundles-db.ts`.

# Localization Changes

- Added output-mode labels and descriptions.
- Added artifact list labels.
- Added the `creating-artifacts` progress message.
- Added artifact kind labels and page-range labels.

# Download Behavior

- Downloads are driven by Blob URLs.
- Artifact MIME type is validated before download.
- PDF artifacts must start with `%PDF-`.
- ZIP artifacts must start with `PK`.
- Object URLs are revoked after use.
- Persisted results are not deleted on download.

# Cancellation Behavior

- Cancellation is still checked in the split runtime and during artifact generation.
- The new packaging path respects cancellation before continuing to later artifacts.
- The current tests continue to cover the cancellation path on split jobs.

# Compatibility Behavior

- Legacy single-zip records still restore.
- Legacy single-zip deletes still work.
- New bundle/artifact records do not masquerade as a legacy single record.
- The default output mode remains `single-zip` for backward compatibility.

# Tests Added

- Extended request/state coverage in `tests/phase5_slice6b_a.test.ts`.
- Added first-open / legacy / bundle split snapshot normalization coverage in `tests/phase5_slice6b_a.test.ts`.
- Extended single-zip/runtime coverage in `tests/phase5_slice6a.test.ts`.
- Extended split persistence coverage in `tests/phase5_slice7.test.ts`.
- Extended compression fallback coverage in `tests/phase5_slice8a.test.ts`.
- Kept passwordless encrypted PDF coverage green in `tests/phase5_slice9_passwordless_encrypted_split.test.ts`.
- Kept Artifact Factory foundation coverage green in `tests/phase5_slice12_artifact_factory_foundation.test.ts`.
- Added `tests/phase5_slice13_artifact_factory_output_modes.test.ts` for all three output modes.
- Kept the phase 4 image recompression loop regression green in `tests/phase4_image_xobject_recompression_loop.test.ts`.
- Kept selected-PDF persistence coverage green in `tests/phase5_selected_pdf_persistence.test.ts`.

# Commands Executed

- `npm run check`
- `npm run build`
- `NODE_OPTIONS='--import=data:text/javascript,globalThis.chrome%3D%7Bruntime%3A%7Bid%3A%22test%22%7D%7D%3BglobalThis.browser%3DglobalThis.chrome%3B' npx -y tsx /private/tmp/phase5-run-test.mjs` with:
  - `tests/phase5_slice6a.test.ts`
  - `tests/phase5_slice6b_a.test.ts`
  - `tests/phase5_slice7.test.ts`
  - `tests/phase5_slice8a.test.ts`
  - `tests/phase5_slice9_passwordless_encrypted_split.test.ts`
  - `tests/phase5_slice12_artifact_factory_foundation.test.ts`
  - `tests/phase5_slice13_artifact_factory_output_modes.test.ts`
  - `tests/phase4_image_xobject_recompression_loop.test.ts`
  - `tests/phase5_selected_pdf_persistence.test.ts`

# Test Results

- `npm run check`: passed.
- `npm run build`: passed.
- Targeted Phase 4/5 tests listed above: passed.
- Popup crash normalization regression coverage: passed.

# Manual Chrome Results

Not performed in this environment. The implementation is ready for a browser smoke test, but I cannot claim manual Chrome acceptance from the current tool session.

# Known Limitations

- Manual Chrome validation remains pending.
- The multi-artifact result UI uses a bounded scrollable list by design; it is functional but not yet optimized for very large output sets beyond the current product slice.

# Remaining Risks

- Browser-only regressions in the Popup download flow could still surface in real Chrome.
- Chrome multiple-download behavior may matter for future bulk-download enhancements, but the current slice intentionally avoids automatic multi-download.
- Restore/delete behavior should be rechecked in a real extension session after reload.

# Final Decision

IMPLEMENTED_MANUAL_VALIDATION_PENDING
