# Summary
- Objective: implement Phase 5 Slice 7, Split by Maximum File Size.
- Implementation status: completed.
- Completion status: done.

# Scope
- Implemented:
  - by-max-size split selection using actual serialized pdf-lib output size
  - page-boundary-only partitioning
  - oversized single-page preservation with non-fatal `SINGLE_PAGE_EXCEEDS_LIMIT` warnings
  - deterministic part filenames and ZIP filenames
  - result metadata warnings for popup-facing display
  - IndexedDB-backed split result persistence with a Node fallback for headless tests
  - runtime wiring preserved for by-pages and manual-ranges
  - cancellation checks during size selection and between generated parts where supported
  - headless regression tests for exact-fit, multiple parts, oversized singleton pages, invalid max size, cancellation, ZIP round-trip, and storage round-trip
- Intentionally not implemented:
  - popup split UI
  - visual Chrome acceptance
  - compress-after execution
  - split by file size UI
  - changes to the Phase 4 compression algorithm
  - Slice 6B popup work

# Files Created
- `src/lib/pdf/split-archive.ts`
- `tests/phase5_slice7.test.ts`
- `reports/PHASE_5_SLICE_7_REPORT.md`

# Files Modified
- `src/lib/messaging.ts`
- `src/lib/offscreen/main.ts`
- `src/lib/offscreen/split-runtime.ts`
- `src/lib/pdf/splitter.ts`
- `src/lib/storage/pdf-compression-db.ts`
- `src/lib/storage/pdf-split-results-db.ts`

# Public Interfaces Added or Changed
- `SplitWarning`
- `SplitResultRecord.warnings`
- `SplitResultMetadata.warnings`
- `buildSplitPart(sourceDocument, range, documentName, partNumber)`
- `createSplitZipArchive(request, isCancelled, onProgress)` now supports `by-max-size`

# Dependencies
- Added:
  - None
- Removed:
  - None
- Updated:
  - None

# Size Selection Algorithm
- The splitter walks remaining pages from left to right.
- For each starting page:
  - measure the first page as a standalone PDF part
  - if that single page already exceeds the limit, preserve it as its own oversized part and emit a warning
  - otherwise binary-search the largest contiguous end page that still fits
  - verify the chosen boundary by checking the adjacent boundary before finalizing
- Page order is preserved.
- Pages are never split.
- Pages are never duplicated or skipped.

# Actual Byte Measurement
- The implementation measures the actual serialized PDF bytes produced by pdf-lib `save()`.
- Selection is based on real part bytes, not estimated page counts.
- Final ZIP size is computed from the actual ZIP bytes returned by fflate.

# Single Page Exceeds Limit Behavior
- Decision implemented from user review:
  - preserve the oversized page as its own PDF part
  - mark the part as oversized
  - emit `SINGLE_PAGE_EXCEEDS_LIMIT` as a structured non-fatal warning
  - continue splitting the remaining pages normally
- Warning payload fields:
  - `pageNumber`
  - `actualGeneratedByteSize`
  - `requestedMaximumByteSize`
  - `fileName`
  - `partNumber`
  - `oversized: true`

# Runtime Contract Changes
- Split result metadata now exposes `warnings` alongside the ZIP metadata.
- Split result persistence stores warnings with the ZIP blob record.
- The worker/offscreen/background flow continues to use the existing safe binary boundary.
- by-pages and manual-ranges keep their existing behavior and message shapes.

# Cancellation Granularity
- Checked before the split selection starts.
- Checked before each new max-size part is measured.
- Checked between candidate measurements during max-size search.
- Checked between generated parts where the runtime loop can observe cancellation.
- Checked before ZIP creation and before persistence.
- No interruption is claimed inside a single non-interruptible pdf-lib serialization call.

# Regression Test Matrix
- Passed:
  - `npx -y tsx tests/phase5_slice2.test.ts`
  - `npx -y tsx tests/phase5_slice3.test.ts`
  - `npx -y tsx tests/phase5_slice4.test.ts`
  - `npx -y tsx tests/phase5_slice5.test.ts`
  - `npx -y tsx tests/phase5_slice6a.test.ts`
  - `npx -y tsx tests/phase5_slice7.test.ts`
  - `npm run check`
  - `npm run build`
- Not run separately:
  - No standalone Phase 4 test files exist in this repository snapshot.
  - Split storage round-trip was validated in `tests/phase5_slice7.test.ts` via write/read/delete and ZIP reopen.

# MANUAL_CHROME_VALIDATION_REQUIRED
- Not required for the headless Slice 7 implementation.
- Deferred visual popup validation remains a Slice 6B concern.
- This slice validates the runtime and storage path only.

# Validation
- One-page PDF below limit:
  - passed
- Exact-fit / near-limit multi-part split:
  - passed
- Multiple parts and final partial part:
  - passed
- Oversized singleton page at beginning:
  - passed
- Oversized singleton page in the middle:
  - passed
- Oversized singleton page at the end:
  - passed
- Invalid max size handling:
  - passed
- Cancellation during candidate planning:
  - passed
- ZIP round-trip and reopened parts:
  - passed
- Split result storage write/read/delete round-trip:
  - passed

# Risks
- The max-size selector relies on actual pdf-lib serialization, so pathological PDFs can still produce surprising part-size curves.
- The Node storage fallback exists only so automated tests can run headlessly; browser builds still use IndexedDB.
- Popup UX for warnings is not implemented yet, so the new warning payload is currently only observable through runtime metadata.

# Known Limitations
- No visible popup split UI exists yet.
- No manual Chrome acceptance was performed for this slice.
- `compressAfter` remains unimplemented.

# Next Slice Prerequisites
- Keep the split warning contract stable for the popup UI work.
- Add popup-side display for oversized part warnings in Slice 6B.
- Preserve the current runtime and storage behavior for by-pages, manual-ranges, and by-max-size.
- Do not change the size-selection contract without updating the report and regression tests.

# Acceptance Checklist
- [x] by-max-size split selects contiguous page-boundary parts using actual serialized PDF bytes
- [x] oversized single-page parts are preserved and marked with `SINGLE_PAGE_EXCEEDS_LIMIT`
- [x] result metadata exposes warnings
- [x] ZIP packaging still preserves deterministic ordering and filenames
- [x] no pages are lost or duplicated
- [x] cancellation is checked where the runtime can observe it
- [x] storage round-trip for split results works headlessly
- [x] `npm run check` passes
- [x] `npm run build` passes
- [x] regression tests for slices 2 through 7 pass

# Git
- Branch: `feature/phase5-pdf-split`
