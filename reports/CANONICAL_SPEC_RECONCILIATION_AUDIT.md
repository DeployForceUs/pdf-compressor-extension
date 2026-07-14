# Executive Summary

> **Status notice (2026-07-14):** This audit is a historical snapshot at commit `47c021d`. Its manual-browser statements and phase ownership labels are superseded by [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md), `PHASE_5_BROWSER_RUNTIME_TRACE.md`, and `PHASE_5_BROWSER_RUNTIME_FIX.md`. In canonical specification numbering, the repository's historical Phase 5 Split work is Stage 6.

The repository is safe to proceed to Phase 5 manual Chrome acceptance before any additional code correction.

The core extension infrastructure is in place, the popup/background/offscreen/worker topology is stable, split runtime and storage paths exist, and the current compression pipeline, binary persistence boundaries, and split persistence tests are present in code. The remaining gaps are mostly either:

- later-phase features that the canonical spec explicitly places after the MVP;
- implementation choices that are valid supersessions of the spec sample code;
- or partial implementations that do not block Phase 5 manual acceptance.

Primary caution: the repo is not spec-complete. Notable omissions remain in PDF URL acquisition, manifest permissions for that acquisition path, freemium/licensing, JPX/OpenJPEG, Sentry, and some testing/hardening items. Those are real gaps, but they are not blockers for Phase 5 manual Chrome acceptance.

Decision: `GO`

# Audit Method

I compared the authoritative spec in [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md) against the current repository state on `feature/phase5-pdf-split` at baseline commit `47c021df2ef6c90a7c566a1469ed36b12e452950`.

Inspected:

- `package.json`
- `package-lock.json`
- `wxt.config.ts`
- `src/entrypoints/*`
- `src/lib/*`
- `src/locales/*`
- `public/_locales/*`
- `scripts/*`
- `tests/*`
- `reports/*`
- current manifest/build assumptions through the WXT config and entrypoint files

I classified each major specification item into exactly one of the requested categories based on actual code, installed dependencies, and the existing phase reports.

# Canonical Source

The authoritative document is [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md).

Most relevant spec anchors:

- Tech stack table and phase map: lines `31-39`, `45-56`
- Phase 4 local compression: lines `1776-1790`
- JPEG2000 / rate limiting / device memory / auto-cleanup: lines `1792-1820`
- Post-release / Sentry / On-Premise: lines `1840-1844`
- Architecture notes and validation expectations: lines `1946-1959`, `2006`, `2049`, `2157`, `2204`, `2225`, `2309`, `2323`, `2342`, `2356`, `2377`, `2390`, `2393`

# Current Baseline

- Branch: `feature/phase5-pdf-split`
- Baseline commit: `47c021df2ef6c90a7c566a1469ed36b12e452950`
- Working tree status at audit start: clean
- Existing phase reports present: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5 slice reports, and prior integration/preflight reports

# Classification Definitions

- `IMPLEMENTED_AND_VERIFIED`
  - Present in code and supported by tests, build output, or completed acceptance evidence.
- `IMPLEMENTED_NOT_MANUALLY_VERIFIED`
  - Present in code, but this audit did not re-run the final Chrome/manual step.
- `PARTIALLY_IMPLEMENTED`
  - Only part of the requirement exists, or the implementation is materially narrower than the spec.
- `MISSING_MVP_REQUIREMENT`
  - The spec requires the behavior in the MVP, but the repository does not implement it.
- `INTENTIONALLY_DEFERRED`
  - The spec explicitly defers the requirement.
- `SUPERSEDED_BY_CURRENT_ARCHITECTURE`
  - The repo uses a different implementation that safely satisfies the underlying product requirement.
- `SPECIFICATION_AMBIGUITY_OR_CONFLICT`
  - The spec is internally unclear or conflicts with an approved project decision.
- `POST_MVP`
  - The spec explicitly places the requirement after the initial release.

# Compliance Matrix

## 1. Project infrastructure and Manifest V3

- `IMPLEMENTED_AND_VERIFIED`
  - WXT MV3 app structure, popup entrypoint, background service worker, offscreen document, and worker boundary exist and build successfully.
  - Evidence: [`package.json`](/Users/dmitriikarpov/pdf-compressor-extension/package.json#L6-L33), [`wxt.config.ts`](/Users/dmitriikarpov/pdf-compressor-extension/wxt.config.ts#L1-L32), [`src/entrypoints/background.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/background.ts#L1-L196), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L1-L652), [`src/lib/offscreen/worker.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/worker.ts#L1-L47).

- `IMPLEMENTED_NOT_MANUALLY_VERIFIED`
  - Current Phase 5 split popup flows exist in code, but this audit did not re-run a live Chrome acceptance pass for the split UX.
  - Evidence: [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1241-L1695), [`tests/phase5_slice2.test.ts`](/Users/dmitriikarpov/pdf-compressor-extension/tests/phase5_slice2.test.ts), [`tests/phase5_slice7.test.ts`](/Users/dmitriikarpov/pdf-compressor-extension/tests/phase5_slice7.test.ts).

## 2. Manifest permissions and host permissions

- `SUPERSEDED_BY_CURRENT_ARCHITECTURE`
  - `downloads` permission is not present because downloads are implemented with `Blob` + `URL.createObjectURL()` in the popup.
  - Evidence: [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L670-L693), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L800-L817), [`wxt.config.ts`](/Users/dmitriikarpov/pdf-compressor-extension/wxt.config.ts#L20-L30).

- `MISSING_MVP_REQUIREMENT`
  - PDF URL fetch, Chrome PDF viewer URL extraction, and context-menu entrypoints are absent.
  - Evidence: no `chrome.contextMenus` usage, no URL-fetching PDF acquisition module, no viewer extraction path in `src/`.
  - Repo evidence for current acquisition scope: [`src/lib/pdf-validation.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf-validation.ts#L1-L45), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L826-L985).

- `POST_MVP`
  - `notifications` and `alarms` are not implemented; they are tied to later cleanup/monitoring work, not the current acceptance path.

## 3. CSP

- `IMPLEMENTED_AND_VERIFIED`
  - Extension CSP allows local WASM and worker execution without remote scripts.
  - Evidence: [`wxt.config.ts`](/Users/dmitriikarpov/pdf-compressor-extension/wxt.config.ts#L28-L30).

## 4. Localization

- `IMPLEMENTED_AND_VERIFIED`
  - English and Spanish UI translations exist for popup, split, compression, and diagnostics copy.
  - Manifest localization files exist for the extension name/description/title.
  - Evidence: [`src/locales/en/translation.json`](/Users/dmitriikarpov/pdf-compressor-extension/src/locales/en/translation.json), [`src/locales/es/translation.json`](/Users/dmitriikarpov/pdf-compressor-extension/src/locales/es/translation.json), [`public/_locales/en/messages.json`](/Users/dmitriikarpov/pdf-compressor-extension/public/_locales/en/messages.json), [`public/_locales/es/messages.json`](/Users/dmitriikarpov/pdf-compressor-extension/public/_locales/es/messages.json), [`src/lib/i18n/config.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/i18n/config.ts#L1-L38).

- `PARTIALLY_IMPLEMENTED`
  - There is no automated translation-completeness check.
  - The repo supports language detection, localStorage caching, and manual switching, but no test asserts that every UI key exists in both locales.

## 5. PDF acquisition

- `IMPLEMENTED_AND_VERIFIED`
  - Local file selection, drag-and-drop, extension/MIME/signature validation, and size limit enforcement exist.
  - Evidence: [`src/lib/pdf-validation.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf-validation.ts#L1-L45), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L826-L985).

- `MISSING_MVP_REQUIREMENT`
  - URL fetch input, Chrome PDF viewer extraction, and context-menu-based PDF acquisition are not implemented.
  - User impact: the product only accepts locally selected files, not PDFs acquired from URLs or Chrome viewer URLs.
  - Severity: medium
  - Recommended fix: add the acquisition path in a dedicated browser-ingestion slice, not by changing the split/compression flow.
  - Suggested ownership bucket: `Phase 5 stabilization` for audit tracking, even though the missing behavior belongs to an earlier acquisition feature set.
  - Manual Chrome validation required: yes
  - Regression risk: medium

## 6. PDF validation

- `IMPLEMENTED_AND_VERIFIED`
  - Empty file, size limit, extension, MIME, and `%PDF-` signature validation are present.
  - Evidence: [`src/lib/pdf-validation.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf-validation.ts#L1-L45).

## 7. MuPDF loading and WASM behavior

- `IMPLEMENTED_AND_VERIFIED`
  - MuPDF is vendored locally, loaded from an extension URL, health-checked, and kept out of the worker polyfill path.
  - Evidence: [`scripts/vendor-mupdf.mjs`](/Users/dmitriikarpov/pdf-compressor-extension/scripts/vendor-mupdf.mjs#L1-L14), [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L85-L96), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L246-L248), [`src/lib/offscreen/worker.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/worker.ts#L1-L47).

- `IMPLEMENTED_AND_VERIFIED`
  - `WebAssembly.RuntimeError` is handled explicitly in compression startup and health checks.
  - Evidence: [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L157-L195), [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L327-L340), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L616-L648).

## 8. Compression

- `IMPLEMENTED_AND_VERIFIED`
  - Balanced compression exists, opens PDFs, scrubs metadata, rewrites the document, verifies `%PDF-`, and reopens the output to confirm page count.
  - Evidence: [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L198-L347).

- `PARTIALLY_IMPLEMENTED`
  - The current image recompression path is selective and narrower than the spec sample.
  - Current code does:
    - image discovery/classification
    - MuPDF `Pixmap.asJPEG(quality)` recompression for safe RGB/Gray candidates
    - structural fallback when recompression is not beneficial or safe
  - Current code does not do:
    - OffscreenCanvas-based recompression
    - explicit downsampling/DPI reduction
    - full-format PNG-to-JPEG conversion pipeline for all candidates
  - Evidence: [`src/lib/pdf/image-xobject-discovery.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-discovery.ts#L1-L212), [`src/lib/pdf/image-xobject-classifier.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-classifier.ts#L1-L315), [`src/lib/pdf/image-xobject-recompression.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-recompression.ts#L260-L425), [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L243-L277).
  - User impact: many PDFs, especially already-efficient scans, will show only small gains or no gain.
  - Severity: medium
  - Recommended fix: if the project still wants the spec-sampled browser canvas path, add it as a separate image recompression slice rather than expanding the current structural path in place.
  - Suggested ownership bucket: `Phase 5 stabilization`
  - Manual Chrome validation required: yes
  - Regression risk: medium

- `IMPLEMENTED_AND_VERIFIED`
  - Metadata scrubbing of `/Info`-style metadata is present and best-effort.
  - Evidence: [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L132-L151), [`src/lib/pdf/image-xobject-recompression.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-recompression.ts#L141-L150).

- `IMPLEMENTED_AND_VERIFIED`
  - Cancellation and timeout controls are present in offscreen compression/split orchestration.
  - Evidence: [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L43-L71), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L500-L652).

- `PARTIALLY_IMPLEMENTED`
  - The spec’s remaining-time indicator is not present in the popup UI.
  - Evidence: the popup renders progress and state, but no `estimatedTimeLeft` field or ETA widget exists in [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1477-L1629).
  - Severity: low
  - Recommended fix: add ETA only if the product still wants it; it is not necessary for Phase 5 acceptance.
  - Suggested ownership bucket: `Phase 8 UX/accessibility`

## 9. Image discovery and supported formats

- `PARTIALLY_IMPLEMENTED`
  - The classifier handles safe candidate detection and excludes many unsafe image types.
  - Unsupported formats such as JPX/JBIG2/CMYK/Indexed/alpha-dependent images are deliberately excluded from safe recompression.
  - Evidence: [`src/lib/pdf/image-xobject-classifier.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-classifier.ts#L159-L315).

- `INTENTIONALLY_DEFERRED`
  - JPEG2000 / JPX decoding is explicitly deferred in the current branch; there is no `openjpeg` dependency or runtime path.
  - Evidence: classifier emits `JPX_DECODE` as unsupported; `package.json` has no `openjpeg` dependency.
  - Suggested ownership bucket: `Phase 7 JPEG2000`

## 10. Metadata scrubbing

- `IMPLEMENTED_AND_VERIFIED`
  - The compression pipeline scrubs supported metadata keys best-effort, and the output remains valid if a key is unsupported.
  - Evidence: [`src/lib/pdf/compressor.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/compressor.ts#L132-L151), [`src/lib/pdf/image-xobject-recompression.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/image-xobject-recompression.ts#L141-L150).

## 11. Timeout and cancellation

- `IMPLEMENTED_AND_VERIFIED`
  - Compression and split each have abortable worker flows and 30-second job timeouts in offscreen orchestration.
  - Evidence: [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L424-L429), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L541-L546), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L616-L650).

## 12. Progress and estimated time

- `IMPLEMENTED_AND_VERIFIED`
  - Progress bars, stages, and status text exist for compression and split.
  - Evidence: [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1477-L1629).

- `PARTIALLY_IMPLEMENTED`
  - The spec’s explicit remaining-time indicator is absent.
  - Suggested ownership bucket: `Phase 8 UX/accessibility`

## 13. Split

- `IMPLEMENTED_AND_VERIFIED`
  - Split strategies, ZIP packaging, storage, warnings, and the current popup UI are present in code.
  - Evidence: [`src/lib/pdf/split-archive.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf/split-archive.ts#L1-L560), [`src/lib/offscreen/split-runtime.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/split-runtime.ts#L1-L158), [`src/lib/archive/zip-parts.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/archive/zip-parts.ts), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1383-L1555).

- `IMPLEMENTED_NOT_MANUALLY_VERIFIED`
  - Split runtime is covered by headless tests and reports, but this audit did not re-run the full Chrome/manual split acceptance path.
  - Evidence: [`tests/phase5_slice2.test.ts`](/Users/dmitriikarpov/pdf-compressor-extension/tests/phase5_slice2.test.ts), [`tests/phase5_slice7.test.ts`](/Users/dmitriikarpov/pdf-compressor-extension/tests/phase5_slice7.test.ts), [`reports/PHASE_5_SLICE_7_REPORT.md`](/Users/dmitriikarpov/pdf-compressor-extension/reports/PHASE_5_SLICE_7_REPORT.md).

- `POST_MVP`
  - Free split limits and Pro-only `compressAfter` gating are not implemented.
  - Suggested ownership bucket: `Phase 6 freemium/licensing`

## 14. IndexedDB

- `IMPLEMENTED_AND_VERIFIED`
  - Selected input, compressed result, and split result persistence all exist with deterministic record IDs.
  - Evidence: [`src/lib/storage/pdf-compression-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-compression-db.ts#L1-L70), [`src/lib/storage/pdf-split-results-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-split-results-db.ts#L1-L88), [`src/lib/pdf-records.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/pdf-records.ts#L1-L3).

- `IMPLEMENTED_AND_VERIFIED`
  - The popup stores and restores the selected PDF and result metadata without sending binary payloads over runtime messaging.
  - Evidence: [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L826-L985), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L271-L323), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L353-L389).

- `PARTIALLY_IMPLEMENTED`
  - Compression result storage lacks the explicit QuotaExceededError normalization that the split store already has.
  - Evidence: [`src/lib/storage/pdf-compression-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-compression-db.ts#L54-L70) vs. [`src/lib/storage/pdf-split-results-db.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/storage/pdf-split-results-db.ts#L55-L81).
  - User impact: storage quota failures may surface as a generic storage error instead of a targeted quota message.
  - Severity: medium
  - Recommended fix: add the same quota normalization pattern to the compression result store.
  - Suggested ownership bucket: `Phase 5 stabilization`
  - Manual Chrome validation required: yes
  - Regression risk: low

- `IMPLEMENTED_AND_VERIFIED`
  - Cleanup on replace/remove exists for selected PDF, compression result, and split result records.
  - Evidence: [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L995-L1013), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L658-L668), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L800-L823).

- `POST_MVP`
  - Automatic expiration / cleanup of old records is not implemented.
  - Suggested ownership bucket: `Phase 8 UX/accessibility` if it remains a UX feature, otherwise `post-MVP`.

## 15. Large binary transfer boundaries

- `IMPLEMENTED_AND_VERIFIED`
  - Compression and split binary payloads remain in IndexedDB; runtime messages carry metadata only.
  - Evidence: [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L271-L323), [`src/lib/offscreen/main.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/offscreen/main.ts#L590-L600), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L670-L693), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L800-L817).

## 16. Free limits, rate limiting, licensing, and Pro entitlement

- `POST_MVP`
  - Free usage limits, rate limiting, JWT verification, device fingerprinting, and Pro entitlement enforcement are absent.
  - Evidence: no `jose`, no `rate-limiter`, no `fingerprint`, no licensing store, and no gating code in `src/`.
  - Suggested ownership bucket: `Phase 6 freemium/licensing`

- `POST_MVP`
  - `navigator.deviceMemory`-based size gating and Pro persistence of quality settings are absent.
  - Suggested ownership bucket: `Phase 6 freemium/licensing`

## 17. Quality controls and persistence

- `POST_MVP`
  - Compression quality controls and persistence are not implemented.
  - The current compression mode is fixed to `Balanced`.
  - Suggested ownership bucket: `Phase 6 freemium/licensing`

## 18. Sentry and monitoring

- `POST_MVP`
  - Sentry is not actually integrated; the repo only contains a bootstrap logger that optionally records env flags.
  - Evidence: [`src/lib/bootstrap.ts`](/Users/dmitriikarpov/pdf-compressor-extension/src/lib/bootstrap.ts#L1-L44), `package.json` has no `@sentry/browser` dependency.
  - Suggested ownership bucket: `post-MVP`

## 19. Accessibility

- `IMPLEMENTED_AND_VERIFIED`
  - Dark theme is preserved, and the popup is keyboard-usable at a basic level.
  - Evidence: [`src/styles/popup.css`](/Users/dmitriikarpov/pdf-compressor-extension/src/styles/popup.css), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1299-L1311), reports `PHASE_2_EXECUTION_REPORT.md` and `PHASE_4_EXECUTION_REPORT.md`.

- `PARTIALLY_IMPLEMENTED`
  - The spec’s keyboard-controls scope is broader than the current implementation.
  - Current code handles Enter/Space for the dropzone, but there is no Escape shortcut wiring for cancellation and no formal accessibility test coverage.
  - Suggested ownership bucket: `Phase 8 UX/accessibility`

## 20. Dark theme

- `IMPLEMENTED_AND_VERIFIED`
  - The approved dark glass visual language is present and preserved in the current popup CSS and markup.
  - Evidence: [`src/styles/popup.css`](/Users/dmitriikarpov/pdf-compressor-extension/src/styles/popup.css), [`src/entrypoints/popup/main.tsx`](/Users/dmitriikarpov/pdf-compressor-extension/src/entrypoints/popup/main.tsx#L1241-L1695).

## 21. E2E tests, memory-leak testing, and cross-browser readiness

- `POST_MVP`
  - Playwright E2E, memory-leak testing, and cross-browser validation are not present in the repository.
  - Evidence: `tests/` contains slice/unit tests only.
  - Suggested ownership bucket: `Phase 9 testing/hardening`

## 22. Production packaging and publication readiness

- `POST_MVP`
  - Store listing preparation, release packaging, and publication hardening are not part of the current codebase.
  - Suggested ownership bucket: `publication preparation`

## 23. On-Premise and post-MVP items

- `POST_MVP`
  - On-Premise architecture and enterprise licensing are explicitly deferred beyond the initial release.
  - Evidence: spec lines `45-56`, `1680-1844`.
  - Suggested ownership bucket: `post-MVP`

# Implemented and Verified

- MV3 extension scaffold and WXT build config
- Popup/background/offscreen/worker separation
- Local file selection and PDF validation
- Selected PDF persistence and restore
- Compression result persistence and restore
- Split result persistence and restore
- Binary-safe download paths for compression and split results
- MuPDF local vendoring and extension-local WASM loading
- Compression health check and split worker orchestration
- Metadata scrubbing and page-count verification
- Headless split regression coverage for the slice set

# Implemented but Awaiting Manual Chrome Validation

- Split popup end-to-end usage in the live browser
- Split warning rendering in the live popup
- Any remaining visual fit checks after the last popup layout changes

# Partial Implementations

- Image recompression is selective and narrower than the spec sample
- ETA / remaining-time display is absent
- Compression quota normalization is not yet symmetrical with split storage
- Keyboard controls are only partly implemented
- Locale completeness checks are not automated

# Missing MVP Requirements

- PDF URL fetching
- Chrome PDF viewer URL extraction
- Context-menu based PDF acquisition
- Manifest support for the acquisition path
- Explicit browser-side remaining-time indicator

# Intentionally Deferred

- JPEG2000 / JPX support
- Any `jbig2dec`-style support
- On-Premise server packaging

# Superseded Specification Samples

- `downloads` permission is superseded by Blob download from the popup
- The spec sample popup file path is superseded by the current WXT build convention
- The spec’s `unlimitedStorage` sample is unnecessary because the repo uses IndexedDB for binaries

# Specification Ambiguities and Conflicts

- The spec sample code and the current WXT output use different popup file paths (`popup/index.html` sample vs. generated `popup.html`).
- The spec sample image-compression description uses Canvas + `pako`, while the current implementation uses MuPDF-based selective recompression. This is a real implementation divergence, but it is not a blocking conflict for Phase 5 acceptance.

# Security and Privacy Gaps

- No freemium/licensing enforcement yet
- No device fingerprinting
- No JWT verification or replay protection
- No Sentry telemetry
- No remote PDF upload path exists, which is good; all processing remains local

# Data Integrity Gaps

- Compression result storage does not yet normalize quota failures the way split storage does
- ETA is not displayed, so long-running operations have less user feedback than the spec sample
- No automated translation-completeness check exists

# Manifest and Permission Gaps

- Missing context-menu / acquisition permissions for URL-based ingestion
- Missing `activeTab` / `scripting` path for the PDF viewer use case
- Missing `notifications` / `alarms` support for later cleanup/monitoring flows

# Localization Gaps

- UI and manifest localization exist for the implemented surfaces
- Context-menu localization is not present because the context-menu feature is absent
- No automated coverage checks verify completeness across locales

# Storage and Cleanup Gaps

- No TTL-based cleanup for old records
- No browser alarm job for cleanup
- Compression result quota normalization still needs parity with split result storage

# Monitoring Gaps

- Sentry is not actually wired in
- Performance metrics are not emitted
- No crash/trace telemetry exists beyond console logging

# Testing Gaps

- No Playwright E2E coverage
- No memory-leak regression suite
- No cross-browser test matrix
- No automated locale completeness test

# Publication Gaps

- No release packaging automation
- No store-listing polish checklist
- No publication-hardening workflow

# Phase and Branch Ownership

- `Phase 5 stabilization`
  - PDF acquisition / context-menu / URL ingestion gaps
  - Compression quota normalization parity
  - Any remaining split-popup manual acceptance issues
  - The browser-canvas image recompression gap if the team wants to pursue the spec sample path
- `Phase 6 freemium/licensing`
  - Free limits
  - Rate limiting
  - JWT / license verification
  - Device fingerprinting
  - Quality settings persistence
  - `navigator.deviceMemory` gating
- `Phase 7 JPEG2000`
  - JPX / OpenJPEG support
- `Phase 8 UX/accessibility`
  - ETA display
  - Keyboard shortcut polish
  - Auto-cleanup UX
  - Accessibility hardening
- `Phase 9 testing/hardening`
  - E2E tests
  - Memory-leak testing
  - Cross-browser readiness
  - Translation-completeness checks
- `publication preparation`
  - Release packaging
  - Store-listing hardening
- `post-MVP`
  - Sentry
  - On-Premise
  - Enterprise licensing/back-end work

# Recommended Corrective Slices

1. Phase 5 stabilization slice
   - Scope: compression-result quota normalization, any live split-popup acceptance issues, and any browser-acquisition gaps the team still wants before release.
   - Exclusions: licensing, JPX, Sentry, publication workflow.
   - Likely files: `src/lib/storage/pdf-compression-db.ts`, `src/entrypoints/popup/main.tsx`, and any new acquisition module if the team reopens URL ingestion.
   - Tests: existing slice tests plus `npm run check` / `npm run build`.
   - Manual validation: yes, in Chrome.
   - Rollback risk: low to medium.

2. Phase 6 freemium/licensing slice
   - Scope: limits, rate limiting, JWT, fingerprinting, quality persistence.
   - Exclusions: compression algorithm changes and split runtime changes.

3. Phase 7 JPEG2000 slice
   - Scope: OpenJPEG / JPX support only.
   - Exclusions: licensing and publication changes.

4. Phase 8 UX/accessibility slice
   - Scope: ETA indicator, keyboard polish, auto-cleanup UX, and accessibility hardening.
   - Exclusions: processing behavior.

5. Phase 9 testing/hardening slice
   - Scope: E2E, memory, cross-browser, translation completeness.
   - Exclusions: runtime architecture.

6. Publication preparation slice
   - Scope: packaging, release checklist, store-readiness.
   - Exclusions: feature work.

7. Post-MVP slice
   - Scope: Sentry and On-Premise.
   - Exclusions: MVP feature completion.

# First Recommended Implementation Slice

The smallest useful corrective slice is:

- Add quota normalization to `src/lib/storage/pdf-compression-db.ts`
- Keep the current download/persistence architecture unchanged
- Re-run the existing headless tests and a focused Chrome smoke test for compression result persistence

This is the first genuinely useful safety improvement in the current tree because it closes a real error-path gap without changing the compression behavior, popup layout, or split implementation.

# Manual Chrome Validation Dependencies

- Split popup behavior still needs a live browser pass for full user-visible acceptance
- Compression and split result downloads should be rechecked after any storage change
- Any PDF acquisition work will need a separate Chrome validation pass because it is currently absent

# Risks

- The repo is not fully spec-complete, so later-phase gaps remain visible after Phase 5 acceptance.
- The compression image path is intentionally selective; low savings on already-efficient PDFs is expected unless the broader browser-canvas path is added later.
- Compression-result quota handling is asymmetric today and should be closed before relying on large-file workflows under storage pressure.

# Final Recommendation

`GO`

Proceed to Phase 5 manual Chrome acceptance now.

Do not block Phase 5 acceptance on later-phase items such as licensing, JPX, Sentry, publication hardening, or On-Premise work. Those remain real gaps, but they are intentionally deferred or post-MVP and do not invalidate the current Phase 5 branch.
