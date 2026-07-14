# Summary

> **Canonical numbering:** This historical Phase 5 Split report belongs to specification Stage 6. See [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md).
- Objective: implement Phase 5 Slice 6A, headless split runtime plumbing and automated validation.
- Implementation status: completed.
- Completion status: done.

# Scope
- Implemented:
  - `split:local` and `offscreen:split` messaging contracts
  - split progress, cancellation, result metadata, and error contracts
  - worker split execution through the existing worker boundary
  - offscreen split orchestration and persistence
  - split result storage in a dedicated IndexedDB store
  - background routing for split start/cancel/result read/result delete
  - headless runtime tests for pages, manual ranges, cancellation, quota failure, and archive round-tripping
- Intentionally not implemented:
  - visible popup split UI
  - download ZIP button in popup
  - manual Chrome acceptance
  - split by maximum file size
  - compress-after execution
  - Pro gating
  - free daily split limits
  - UI redesign
  - any changes to the Phase 4 compression algorithm

# Files Created
- `src/lib/pdf/split-errors.ts`
- `src/lib/pdf/split-archive.ts`
- `src/lib/offscreen/split-runtime.ts`
- `src/lib/storage/pdf-split-results-db.ts`
- `tests/phase5_slice6a.test.ts`
- `reports/PHASE_5_SLICE_6A_REPORT.md`

# Files Modified
- `src/lib/messaging.ts`
- `src/lib/pdf-records.ts`
- `src/lib/pdf/splitter.ts`
- `src/lib/offscreen/worker.ts`
- `src/lib/offscreen/main.ts`
- `src/entrypoints/background.ts`

# Public Interfaces Added or Changed
- `SplitLocalRequest`
- `SplitCancelRequest`
- `SplitResultReadRequest`
- `SplitResultDeleteRequest`
- `OffscreenSplitRequest`
- `OffscreenSplitCancelRequest`
- `OffscreenSplitResultReadRequest`
- `OffscreenSplitResultDeleteRequest`
- `SplitProgressStage`
- `SplitProgressEvent`
- `SplitResultRecord`
- `SplitResultMetadata`
- `SplitResultEvent`
- `SplitErrorEvent`
- `SplitStartResponse`
- `SplitCancelResponse`
- `SplitResultReadResponse`
- `SplitResultDeleteResponse`
- `createSplitZipArchive(request, isCancelled, onProgress)`
- `runSplitJob(inputRecord, request, deps)`
- `readSplitResult(recordId?)`
- `writeSplitResult(record)`
- `deleteSplitResult(recordId?)`

# Dependencies
- Added:
  - None
- Removed:
  - None
- Updated:
  - None

# Runtime Message Flow
- `split:local` is accepted by the background service worker.
- Background opens the offscreen document if needed and forwards the request as `offscreen:split`.
- Offscreen loads the selected PDF record, starts a split job, and streams progress events.
- Offscreen forwards the PDF bytes to the worker boundary through Comlink, not through Chrome runtime messaging.
- Worker builds split parts, validates them, packages them into a ZIP, and returns ZIP bytes plus metadata.
- Offscreen persists the ZIP result in a dedicated IndexedDB store.
- Background can forward split result reads and deletes to the offscreen document.

# IndexedDB Changes
- Added a dedicated `split-results` object store in `pdf-compressor-phase5`.
- Existing compression persistence remains on the separate `pdf-compressor-phase4` database and is unchanged.
- Split result records store:
  - `id`
  - `sourceRecordId`
  - `fileName`
  - `mimeType`
  - `originalSize`
  - `totalPartsSize`
  - `partsCount`
  - `strategy`
  - `data`
  - `createdAt`
  - `updatedAt`
- ZIP quota failures are normalized to `STORAGE_QUOTA_EXCEEDED`.

# Progress Contract
- `validating`
- `planning-parts`
- `creating-part`
- `validating-part`
- `creating-zip`
- `persisting`
- `complete`

# Cancellation Granularity
- Checked before the worker starts any heavy processing.
- Checked between generated parts.
- Checked before ZIP creation.
- Checked before persistence.
- Not claimed as interruptible inside a single PDF copy, validation, or ZIP operation when the underlying library call is not interruptible.

# Validation
- Tests executed:
  - `npx -y tsx tests/phase5_slice2.test.ts`
  - `npx -y tsx tests/phase5_slice3.test.ts`
  - `npx -y tsx tests/phase5_slice4.test.ts`
  - `npx -y tsx tests/phase5_slice5.test.ts`
  - `npx -y tsx tests/phase5_slice6a.test.ts`
- `npm run check`:
  - passed
- `npm run build`:
  - passed

# Risks
- The runtime path now spans background, offscreen, worker, ZIP, and storage layers, so regression coverage must stay in sync with the message contracts.
- Comlink wrapping for the worker boundary must keep transferring the input and output buffers instead of cloning them.
- The split result store is intentionally separate from compression storage; any future consolidation needs careful migration planning.

# Known Limitations
- No visible popup split UI exists yet.
- `compressAfter` is accepted in the request shape but not executed in Slice 6A.
- By-max-size remains deferred to Slice 7.

# MANUAL_CHROME_VALIDATION_REQUIRED
- Required for the popup-facing Split UI and manual user acceptance.
- Deferred to Slice 6B.
- Slice 6A only validates the headless runtime path and storage persistence.

# Next Slice Prerequisites
- Add visible popup Split controls.
- Add user-facing ZIP download handling in the popup.
- Wire manual Chrome acceptance for the split workflow.
- Preserve the existing headless runtime contract and result store.
- Keep the split progress and cancellation message shapes stable.

# Acceptance Checklist
- [x] `split:local` exists and routes through background and offscreen
- [x] `offscreen:split` executes the split runtime
- [x] ZIP persistence completes before success is returned
- [x] Split result metadata is returned
- [x] Split ZIP can be read back and reopened
- [x] Progress stages are emitted in valid order
- [x] Cancellation before processing is handled
- [x] Cancellation before ZIP creation is handled
- [x] Invalid range error propagation works
- [x] Storage quota failure maps to `STORAGE_QUOTA_EXCEEDED`
- [x] Existing Phase 5 tests still pass
- [x] `npm run check` passes
- [x] `npm run build` passes
- [ ] Manual Chrome validation completed

# Git
- Branch: `feature/phase5-pdf-split`
- Commit hash: `d3775f0`
