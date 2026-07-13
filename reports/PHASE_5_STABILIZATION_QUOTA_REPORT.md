# Summary

Implemented the first Phase 5 stabilization slice: compression-result storage now normalizes browser quota failures to the same machine-readable `STORAGE_QUOTA_EXCEEDED` contract already used by split storage, and the orchestration boundary now has focused regression coverage for a failed persistence write.

# Root Cause

Compression result persistence used a raw `db.put(...)` path with no quota normalization. Split storage already had explicit `QuotaExceededError` detection and remapping to `STORAGE_QUOTA_EXCEEDED`, but compression storage returned the browser-native failure shape instead.

That asymmetry meant large compression-result writes could surface a generic storage failure instead of the project’s existing machine-readable quota code.

# Compression Storage Before

- File: [`src/lib/storage/pdf-compression-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-compression-db.ts)
- Current schema:
  - `compression-results`
  - key: `string`
  - value: `CompressionResultRecord`
- Before this slice:
  - `writeCompressionResult(record)` called `db.put(...)` directly
  - quota errors were not normalized
  - `readCompressionResult(...)` and `deleteCompressionResult(...)` were already simple read/delete helpers

# Split Storage Reference Behavior

- File: [`src/lib/storage/pdf-split-results-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-split-results-db.ts)
- Split storage already:
  - detects `QuotaExceededError`
  - maps it to `STORAGE_QUOTA_EXCEEDED`
  - preserves the original browser error as the cause only through the thrown error chain
  - leaves existing split results untouched unless a write actually succeeds
- This slice does not directly exercise `writeSplitResult(...)`; it only references the existing split quota mapping behavior as a comparison point.

# Implementation

- Added compression-storage quota normalization in [`src/lib/storage/pdf-compression-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-compression-db.ts)
- Added a dedicated compression-storage error type:
  - `CompressionStorageError`
- Added a shared normalization path:
  - `normalizeCompressionPersistenceError(error)`
- Added the machine-readable code:
  - `COMPRESSION_STORAGE_QUOTA_ERROR_CODE = "STORAGE_QUOTA_EXCEEDED"`
- Updated `writeCompressionResult(...)` so quota failures throw the normalized compression storage error instead of a generic IndexedDB failure
- Left the compression algorithm, popup layout, split runtime, manifest, licensing, and acquisition paths unchanged

# Error Mapping

- Quota pressure now maps to:
  - `STORAGE_QUOTA_EXCEEDED`
- Generic IndexedDB / non-quota failures:
  - are rethrown unchanged
  - are not misclassified as quota exhaustion
- The thrown compression storage error preserves the original browser exception as `cause` when available
- The offscreen compression orchestration already treats thrown errors with a `code` field as machine-readable failures, so no broader runtime rewrite was required

# Atomicity Assessment

- Compression result writes still use a single IndexedDB `put(...)`
- If the write succeeds, the new result replaces the prior record atomically at the IndexedDB transaction level
- If quota exhaustion occurs, the write is rejected before completion and the selected source PDF is not deleted
- Existing valid compression results remain unchanged unless a write actually succeeds

# Tests

Added focused regression coverage in [`tests/phase5_stabilization_quota.test.ts`](/Users/dmitriikarpov/pdf-compressor-extension/tests/phase5_stabilization_quota.test.ts):

- helper-level compression-result storage checks:
  - successful compression-result write still works
  - stored result can be read back unchanged
  - result can be deleted
  - simulated `QuotaExceededError` maps to `STORAGE_QUOTA_EXCEEDED`
  - generic errors are not misclassified as quota failures
- orchestration-level compression completion checks:
  - a valid compression outcome is passed into the completion boundary
  - a simulated quota failure during compression-result persistence maps to `STORAGE_QUOTA_EXCEEDED`
  - no success completion response is returned
  - no `compression:result` event is emitted
  - no `compression:progress` complete event is emitted on failure
  - the existing compression-result record remains unchanged after the failed write
- split quota normalization remains unchanged in production code, but `writeSplitResult(...)` is not directly exercised by this slice

Also re-ran the relevant Phase 5 regression tests and the repo validation suite after the change.

# Manual Chrome Validation Required

Headless tests prove the storage helper, the compression completion orchestration seam, and the error mapping, but they do not fully simulate a browser storage-pressure condition in real Chrome.

Still required in Chrome:

- compress a PDF large enough to trigger real storage pressure
- confirm the popup surfaces the storage quota failure as a precise error
- confirm no successful completion state is shown after the quota failure
- confirm the existing selected source PDF remains intact
- confirm any previously stored valid compression result is left unchanged if the write fails

# Files Changed

- `src/lib/storage/pdf-compression-db.ts`
- `src/lib/offscreen/compression-runtime.ts`
- `src/lib/messaging.ts`
- `tests/phase5_stabilization_quota.test.ts`
- `reports/PHASE_5_STABILIZATION_QUOTA_REPORT.md`

# Risks

- Browser quota pressure is environment-dependent, so manual Chrome validation is still necessary
- The new compression-storage error type is intentionally narrow and should not be reused for split or unrelated storage code
- The popup currently relies on the offscreen error message text for user-facing display, so future message-copy changes should remain privacy-safe and precise

# Acceptance Checklist

- [x] successful compression-result write still works
- [x] stored result can be read back unchanged
- [x] result can be deleted
- [x] simulated `QuotaExceededError` maps to `STORAGE_QUOTA_EXCEEDED`
- [x] generic IndexedDB failure is not falsely classified as quota exhaustion
- [x] orchestration-level quota failure returns a non-success result
- [x] orchestration-level quota failure does not emit success events
- [x] split storage behavior remains unchanged in production code
- [x] `npm run check` passes
- [x] `npm run build` passes

# Git

- Branch: `feature/phase5-pdf-split`
- Commit: pending this slice commit
- Push target: `origin/feature/phase5-pdf-split`
