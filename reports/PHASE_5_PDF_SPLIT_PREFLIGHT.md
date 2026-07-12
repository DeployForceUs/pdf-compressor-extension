# Phase 5 PDF Split Preflight

Recommendation: CONDITIONAL GO

## Scope

This preflight checks the canonical Split requirements in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L136), the current repository structure, and the existing compression/storage/messaging flow. No runtime code was changed.

## Canonical Spec Review

The spec defines Split as a local pipeline with:
- `split:local` and `offscreen:split` messaging contracts in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L148)
- ZIP packaging via `fflate` in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L35)
- optional `compressAfter` gating for Pro users in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L151)
- free split limit enforcement and size limits in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L730)
- ZIP persistence through binary storage in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L779)
- quota handling expectation in the storage sample at [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L1103)

The spec also contains Split UI copy for page count, max-size splitting, ZIP download, and Pro-only `compressAfter` in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L416) and [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L520).

## Current Repository State

The repository is still Phase 4-compression-shaped:
- Messaging only defines compression, storage smoke tests, and PDF record CRUD in [`src/lib/messaging.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/messaging.ts#L115)
- Background only forwards compression and offscreen lifecycle messages in [`src/entrypoints/background.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/background.ts#L97)
- Offscreen only owns compression orchestration and selected-PDF persistence in [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L39)
- The worker API only exposes `health` and `compress` in [`src/lib/offscreen/worker.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/worker.ts#L13)
- Popup state only tracks selected PDF, compression, and diagnostics in [`src/entrypoints/popup/store.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/store.ts#L35)
- Popup UI only renders compression controls and result download, not Split controls, in [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L201)
- IndexedDB result storage is still a single compressed-result store in [`src/lib/storage/pdf-compression-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-compression-db.ts#L5)
- The compression helper already implements the production MuPDF pipeline and must be reused, not duplicated, in [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L198)

## Discrepancies And Gaps

1. Split runtime is absent.
   - There is no `split:local` handler, no `offscreen:split` handler, no split worker API, and no split progress or error contract in the repository.
   - The spec expects those boundaries already.

2. Required dependencies are missing locally.
   - `package.json` does not declare `pdf-lib` or `fflate` in [`package.json`](/Users/dmitriikarpov/pdf-compressor-extension/package.json#L13)
   - `node_modules/pdf-lib` and `node_modules/fflate` are not present in the current workspace install.
   - `@types/pdf-lib` is also not present locally, so the API surface cannot be verified from installed typings.

3. Monetization and gating for Split are not implemented.
   - There is no Pro/license state, no free split counter, no `compressAfter` gating, and no split-limit persistence in the current codebase.
   - The repo currently has only compression-oriented cancellation/status state and no split-specific entitlement model.

4. Split error taxonomy is not wired.
   - The brief requests machine-readable split errors such as `INVALID_PAGE_RANGE`, `OVERLAPPING_PAGE_RANGES`, `ZIP_CREATION_FAILED`, and `STORAGE_QUOTA_EXCEEDED`.
   - The repository currently exposes only compression error codes in [`src/lib/messaging.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/messaging.ts#L123).
   - The canonical spec sample does not enumerate the requested split-specific error set, so this needs a decision before runtime code is added.

5. Storage/download flow is single-result only.
   - Current persistence is keyed around `COMPRESSED_PDF_RECORD_ID`, and the popup download path expects a PDF record, not a ZIP result.
   - Split will need either a separate result namespace or a generic binary-result abstraction to avoid overwriting compression outputs.

6. Validation is too shallow for Split.
   - Current validation is signature-based file acceptance only in [`src/lib/pdf-validation.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf-validation.ts#L1)
   - Split requires page-range parsing, overlap detection, per-part page-count verification, and final ZIP integrity checks.

## Safe Implementation Architecture

Use the existing compression pipeline as a dependency, not as a fork.

- `src/lib/pdf/page-range-parser.ts`
  - Parse manual range input like `1-3,5,7-9`
  - Normalize, dedupe, and validate bounds
  - Emit structured errors for invalid syntax, overlaps, and out-of-bounds ranges

- `src/lib/pdf/split-strategies.ts`
  - Normalize `by-pages`, `manual`, and `by-size` strategies into an ordered part plan
  - For `by-size`, plan parts conservatively and fail fast when a single page exceeds the allowed ceiling

- `src/lib/pdf/splitter.ts`
  - Extract pages with `pdf-lib`
  - Preserve order and page coverage
  - Keep compression out of this module
  - If `compressAfter` is enabled, call the existing production compression pipeline for each extracted part instead of adding a second compression implementation

- `src/lib/pdf/split-validator.ts`
  - Open every generated part
  - Verify valid PDF header and parse success
  - Verify expected page count and page range coverage
  - Verify no duplicated or missing pages
  - Verify final aggregate page count matches input

- `src/lib/archive/zip-parts.ts`
  - Package ordered part buffers with `fflate`
  - Ensure unique filenames and stable ordering
  - Verify ZIP integrity before persistence

## Proposed Messaging / Flow

- Background remains the entrypoint for popup requests.
- Offscreen remains the orchestration layer for long-running work.
- Worker remains the heavy PDF-processing boundary.
- Split should add a new job state parallel to compression, not overload compression state.

Expected flow:
`Input PDF -> Validate -> Split into parts -> Optional compression of each part -> Validate every part -> ZIP -> Download`

Progress stages should include:
- `validating`
- `planning-parts`
- `creating-part`
- `compressing-part`
- `validating-part`
- `creating-zip`
- `persisting`
- `complete`

Cancellation should be checked:
- before heavy operations
- between parts
- before ZIP creation

## Recommended Storage Design

- Keep binary payloads out of Chrome runtime messaging.
- Continue the IndexedDB blob/result ID pattern.
- Add a split-specific result record type for ZIP outputs, or a shared binary-result store with typed metadata.
- Preserve the existing compression result store so Phase 4 download behavior does not regress.

## Key Risks

- `pdf-lib` page extraction may expose edge cases around malformed PDFs or object reuse; validation must reopen every output.
- Size-based splitting is the hardest strategy because the part size depends on content, compression choice, and PDF object overhead.
- `compressAfter` can multiply runtime and storage pressure, so quota handling and cancellation need to be checked at every boundary.
- ZIP packaging can become the first quota failure point even when individual parts succeed.
- The current repo does not yet have split progress state, so the popup needs a new task model rather than a small patch.

## Acceptance Criteria For Phase 5

- `split:local` exists and returns a ZIP blob ID plus part count.
- All three strategies work: by pages, manual page ranges, and by maximum file size.
- `compressAfter` is Pro-only and uses the existing compression pipeline.
- Every part is validated after generation.
- The final ZIP is validated before persistence.
- Cancellation works between parts and before ZIP creation.
- IndexedDB persists the ZIP without breaking compression result persistence.
- Download uses the existing blob-ID workflow.
- Free split limits and Pro unlimited split are enforced.

## Recommended Implementation Slices

1. Add split types, messaging, and error codes.
2. Add range parsing and split planning.
3. Add page extraction and per-part validation.
4. Add ZIP packaging and result persistence.
5. Add popup Split UI and progress wiring.
6. Add license / quota enforcement and `compressAfter` gating.

## Final Assessment

The architecture is viable, but Split is not yet safe to start without resolving the dependency and contract gaps above. The main blocker is not the PDF processing model itself; it is that the repository still lacks the Split-specific runtime surface, storage model, and monetization wiring that the spec assumes.

Proceed only after the split contract, error taxonomy, and dependency additions are agreed.
