# Summary
- Objective: implement Phase 5 Slice 8A, headless compress-after-splitting.
- Implementation status: completed.
- Completion status: done.

# Scope
- Implemented:
  - compress-after pipeline for by-pages, manual-ranges, and by-max-size
  - reuse of the existing Phase 4 production compression helper as the default runtime compressor
  - per-part compression validation and fallback selection
  - oversized single-page warning preservation
  - progress emission for `compressing-part`
  - persisted split metadata expansion for compression diagnostics
  - Node-only compression storage fallback remains isolated for headless tests
  - headless regression coverage for selection, fallback, cancellation, ZIP reopening, metadata, and storage smoke
- Intentionally not implemented:
  - popup split UI
  - visual Chrome acceptance
  - download ZIP button
  - visible Pro controls
  - free daily split limits
  - UI redesign
  - a second compression algorithm
  - any change to the existing Phase 4 compression algorithm
  - Slice 6B

# Files Created
- `tests/phase5_slice8a.test.ts`
- `reports/PHASE_5_SLICE_8A_REPORT.md`

# Files Modified
- `src/lib/messaging.ts`
- `src/lib/offscreen/main.ts`
- `src/lib/offscreen/split-runtime.ts`
- `src/lib/pdf/split-archive.ts`

# Public Interfaces Added or Changed
- `SplitProgressStage` now includes `compressing-part`
- `SplitProgressEvent` now carries optional compression diagnostics
- `SplitWarning` now includes compression fallback warnings
- `SplitResultRecord` now includes compression-after metadata fields
- `SplitResultMetadata` now includes compression-after metadata fields
- `SplitArchiveRequest.mupdfRuntimeUrl`
- `SplitArchiveDependencies.compressPart`

# Slice 7 Verification
- `src/lib/pdf/split-archive.ts` was already created in Slice 6A.
- The Slice 7 report incorrectly listed `src/lib/pdf/split-archive.ts` as newly created again; that was a report-only inconsistency, not a code issue.
- `src/lib/storage/pdf-compression-db.ts` changed in Slice 7 to add a Node-only in-memory IndexedDB fallback for headless tests.
- Why it changed:
  - to let headless Node tests round-trip compression results without a browser `indexedDB` implementation
  - to keep the browser path on `idb`/IndexedDB when `indexedDB` exists
- Verified unchanged behavior:
  - existing compression persistence record shape remains the same
  - no compression result schema was broken
  - browser builds still use IndexedDB when available
  - the Node fallback is isolated to `typeof indexedDB === "undefined"` and does not replace browser behavior

# Compression Helper Reuse
- Default runtime compression uses the existing production `compressBalancedPdf` helper.
- No new compression algorithm was introduced.
- The split pipeline only decides whether to keep the compressed candidate or fall back to the original split part.
- Test doubles are only used in the headless slice tests to force specific fallback branches.

# Per-Part Selection Logic
- Split parts are selected first using the existing split strategies.
- Each finalized split part is then compressed independently when `compressAfter` is enabled.
- A compressed candidate is accepted only when all of the following are true:
  - it opens successfully
  - it preserves the expected page count
  - it is strictly smaller than the original split part
- Otherwise the original split bytes are retained.
- `by-max-size` still selects split boundaries before compression; compression never widens the already finalized boundary.

# Fallback Matrix
- `COMPRESSION_FAILED_FALLBACK`
  - compression threw before a candidate could be validated
- `COMPRESSED_PART_INVALID_FALLBACK`
  - the compressed candidate did not reopen successfully or page count did not match
- `COMPRESSED_PART_NOT_SMALLER_FALLBACK`
  - the compressed candidate was valid but not strictly smaller
- `SINGLE_PAGE_EXCEEDS_LIMIT`
  - preserved from Slice 7 when an oversized singleton part must remain unsplit

# Progress Contract
- Shared runtime stages:
  - `validating`
  - `planning-parts`
  - `creating-part`
  - `validating-part`
  - `compressing-part`
  - `creating-zip`
  - `persisting`
  - `complete`
- Observed sequences:
  - without `compressAfter`: `validating -> planning-parts -> creating-part -> validating-part -> ... -> creating-zip -> persisting -> complete`
  - with `compressAfter`: `validating -> planning-parts -> creating-part -> validating-part -> compressing-part -> validating-part -> ... -> creating-zip -> persisting -> complete`
- `compressing-part` emits:
  - `sourceByteSize`
  - `compressedCandidateByteSize` when available
  - `selectedByteSize`
  - `fallbackUsed`

# Cancellation Granularity
- Checked before split selection starts.
- Checked before each part compression attempt.
- Checked after each compression attempt and before candidate validation.
- Checked between parts.
- Checked before ZIP creation.
- Checked before persistence.
- No interruption is claimed inside a non-interruptible pdf-lib or MuPDF call.

# Result Metadata Changes
- Added fields:
  - `compressAfterRequested`
  - `compressedPartsCount`
  - `fallbackPartsCount`
  - `originalSplitPartsSize`
  - `finalPartsSize`
  - `totalBytesSaved`
  - `warnings`
- Compatibility choice:
  - `totalPartsSize` remains present and now reflects the final selected part total so existing consumers keep a stable shape.
- Warnings are persisted with the split ZIP record and returned in readback metadata.

# Pro Gating Status
- No visible Pro gating UI was added.
- No fake license system was introduced.
- `compressAfter` request handling remains injectable and isolated.
- Full entitlement enforcement remains deferred to the existing licensing surface and later UI work.

# Regression Test Matrix
- Passed:
  - `npx -y tsx tests/phase5_slice2.test.ts`
  - `npx -y tsx tests/phase5_slice3.test.ts`
  - `npx -y tsx tests/phase5_slice4.test.ts`
  - `npx -y tsx tests/phase5_slice5.test.ts`
  - `npx -y tsx tests/phase5_slice6a.test.ts`
  - `npx -y tsx tests/phase5_slice7.test.ts`
  - `npx -y tsx tests/phase5_slice8a.test.ts`
  - `npm run check`
  - `npm run build`
- Phase 4 compression validation note:
  - no standalone Phase 4 compression test file or browser-safe validation harness exists in this repo snapshot
  - the production compression helper requires a browser extension URL and WASM context, so it is not directly runnable in this Node-only test environment
  - strongest available validation here was the production build plus the Slice 8A integration tests using injectable compression outcomes and the compression DB smoke round-trip

# MANUAL_CHROME_VALIDATION_REQUIRED
- Required for popup-facing Split UI acceptance.
- Deferred to Slice 6B.
- Slice 8A validates the headless runtime and storage path only.

# Dependencies
- Added:
  - None
- Removed:
  - None
- Updated:
  - None

# Next Slice Prerequisites
- Add the visible popup split UI in Slice 6B.
- Surface compression-after diagnostics and warnings in the popup.
- Preserve the current runtime contract for by-pages, manual-ranges, and by-max-size.
- Keep the Node-only storage fallback isolated from browser builds.

# Acceptance Checklist
- [x] compress-after false leaves existing split behavior unchanged
- [x] compress-after true accepts a smaller valid compressed candidate
- [x] compress-after true falls back when the candidate is larger
- [x] compress-after true falls back when the candidate is invalid
- [x] compress-after true falls back when compression throws
- [x] compress-after true falls back when page counts do not match
- [x] by-pages works with compress-after
- [x] manual-ranges works with compress-after
- [x] by-max-size works with compress-after and preserves oversized-page warnings
- [x] cancellation is honored between compressed parts
- [x] ZIP reopens successfully
- [x] persisted metadata includes compression diagnostics
- [x] split result storage round-trip works in headless Node tests
- [x] existing Phase 5 regression tests still pass
- [x] `npm run check` passes
- [x] `npm run build` passes

# Git
- Branch: `feature/phase5-pdf-split`
- Commit hash: pending
