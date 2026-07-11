# Phase 4 Preflight Report

## Git And PR Preflight

- Current branch: `feature/phase4-pdf-compression`
- Base branch before branching: `main`
- Latest main commit: `5b429f2c64529b0dd0ac42b3ec5852ecc4f8920c` (`Merge pull request #3 from DeployForceUs/feature/phase3-pdf-input`)
- PR #3 is merged into `main`
- Repository validation on the updated `main` passed before branching:
  - `npm install`: PASS
  - `npm run check`: PASS
  - `npm run build`: PASS

Documentation state for this preflight:

- Canonical specification: [`docs/pdf_compressor_spec_v3.3.0.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md)
- Phase 1-only backup preserved at: [`docs/pdf_compressor_spec_v3.3.0_phase1_only_backup.md`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0_phase1_only_backup.md)

## Repository Inspection

The current codebase does not yet contain Phase 4 implementation files or dependencies.

Observed gaps versus the canonical spec:

- `package.json` does not yet declare the Phase 4 libraries named in the spec, including `mupdf`, `comlink`, `idb`, `pdf-lib`, `openjpeg.js`, `pako`, or `fflate`.
- `src/` does not yet contain the Phase 4 PDF stack (`src/lib/pdf/*`), the compression worker, or the Offscreen worker entrypoint described in the spec.
- Existing code still covers the Phase 1-3 infrastructure only.

This is a scope gap, not a regression: Phase 4 has not started in code yet.

## Exact Specification Evidence

The canonical specification now explicitly defines the browser MVP and the post-MVP On-Premise split.

- [`docs/pdf_compressor_spec_v3.3.0.md:31-38`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L31) selects:
  - `mupdf.js` (WASM) for PDF parsing and compression
  - `pdf-lib` for splitting
  - Canvas API + `pako` for image recompression
  - `openjpeg.js` (WASM) for JPEG2000
  - `idb` for IndexedDB binary storage
  - `comlink` for worker abstraction
- [`docs/pdf_compressor_spec_v3.3.0.md:45-56`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L45) states On-Premise is post-MVP and uses Ghostscript (`gs`) there, not in the browser MVP.
- [`docs/pdf_compressor_spec_v3.3.0.md:82-97`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L82) shows the intended file layout:
  - `offscreen/worker.ts`
  - `lib/pdf/compressor.ts`
  - `lib/pdf/splitter.ts`
  - `lib/storage/indexed-db.ts`
- [`docs/pdf_compressor_spec_v3.3.0.md:1776-1790`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L1776) explicitly defines Phase 4:
  - integrate `mupdf.js` (WASM)
  - handle `WebAssembly.RuntimeError`
  - validate `WebAssembly` in the UI
  - load WASM with retry
  - extract and recompress images via OffscreenCanvas
  - run compression in the Offscreen Document through a Web Worker
  - use `comlink` + `comlink.transfer()`
  - use `AbortController`
  - persist results in IndexedDB
- [`docs/pdf_compressor_spec_v3.3.0.md:2308-2314`](/Users/dmitriikarpov/pdf-compressor-extension/docs/pdf_compressor_spec_v3.3.0.md#L2308) says SRI is unnecessary for local WASM because the extension bundles it locally via `wxt`.

## Engine Decision

The engine choice is documented and unambiguous:

- Browser MVP: `mupdf.js` WASM
- Compression worker: Web Worker inside the Offscreen Document
- Message transport: `comlink` with transferable `ArrayBuffer`s
- Post-MVP On-Premise: Ghostscript only

Decision: clear and aligned with the canonical spec.

## Package And Version Investigated

Official package snapshot from the temporary spike environment:

- `mupdf` version `1.28.0`
- `mupdf` license: `AGPL-3.0-or-later`
- `comlink` version `4.4.2`
- `comlink` license: `Apache-2.0`

Relevant official package docs:

- [`/private/tmp/mupdf-phase4-spike/node_modules/mupdf/package.json`](/private/tmp/mupdf-phase4-spike/node_modules/mupdf/package.json)
- [`/private/tmp/mupdf-phase4-spike/node_modules/mupdf/README.md:1-18`](/private/tmp/mupdf-phase4-spike/node_modules/mupdf/README.md#L1)
- [`/private/tmp/mupdf-phase4-spike/node_modules/comlink/package.json`](/private/tmp/mupdf-phase4-spike/node_modules/comlink/package.json)
- [`/private/tmp/mupdf-phase4-spike/node_modules/comlink/README.md:1-30`](/private/tmp/mupdf-phase4-spike/node_modules/comlink/README.md#L1)

## Browser, MV3, And WASM Compatibility

Evidence gathered so far indicates the selected path is technically viable:

- The MuPDF.js README states the package is powered by WebAssembly and usable in Chrome.
- The package is ESM-only, which matches the extension build system's modern bundling model.
- The temporary spike successfully opened a PDF from an in-memory `ArrayBuffer` and rewrote it back to valid PDF bytes.
- `comlink` explicitly documents WebWorker usage and transferables, matching the spec’s worker architecture.

What has not yet been proven in the real extension runtime:

- MV3 Offscreen Document boot path
- extension CSP compatibility in the actual popup/offscreen build
- full browser bundling of the WASM asset through `wxt`

No evidence suggests remote scripts or `eval` are required by the selected package path.

## CSP Implications

Based on the canonical spec and package behavior:

- WASM should be bundled locally with the extension.
- No external WASM fetches should be required for the MVP path.
- SRI is not relevant for local extension assets.
- The implementation should avoid remote script loading and dynamic code generation.

This is an implementation constraint, not a blocker.

## Licensing Assessment

MuPDF.js licensing status:

- Open source AGPL-3.0-or-later
- Commercial license available from Artifex

Implications for a closed-source commercial Chrome extension:

- This is not a final legal conclusion.
- A commercial licensing decision is required before shipping proprietary distribution if AGPL terms are not acceptable.

Status: `NEEDS OWNER DECISION`

Official source references:

- MuPDF.js README in the installed package snapshot
- MuPDF.js package metadata in the installed package snapshot

## Compression Capability Assessment

The canonical spec expects the following Phase 4 capabilities:

- in-place image replacement using `mupdf.js`
- JPEG/PNG extraction and recompression
- JPEG2000 decoding via `openjpeg.js`
- metadata scrubbing
- progress reporting
- cancellation
- timeout handling
- IndexedDB persistence of the result

Spike result:

- Core open/save round-trip works on a tiny in-memory PDF.
- Compression-specific behavior was not implemented or benchmarked in the spike.

Expected quality limitations to carry into implementation:

- scanned / image-heavy PDFs may have large memory spikes
- already optimized PDFs may compress poorly
- encrypted PDFs may fail or require explicit handling
- malformed PDFs need defensive error paths
- forms, annotations, signatures, and embedded fonts may be sensitive to rewrite behavior

## Bundle And Memory Risks

Risk posture is moderate to high for larger PDFs.

Reasoned assessment:

- The spec’s model loads the document into memory for local processing.
- Transferable `ArrayBuffer`s via `comlink` reduce copying overhead between contexts.
- The worker/offscreen split is the correct place to keep heavy work off the popup thread.

Estimated pressure points:

- 10 MB PDF: manageable with careful lifetime management
- 50 MB PDF: likely to require strict buffer release and progress reporting
- 100 MB PDF: high risk of memory pressure or browser tab instability without aggressive safeguards

These are engineering risks, not blockers, and they should be handled with cancellation, timeouts, and prompt buffer release.

## Proposed Architecture

Recommended runtime layout for Phase 4:

- Popup: file selection, compression controls, progress, download, and status
- Background: message router and offscreen lifecycle manager
- Offscreen Document: owns local PDF state, IndexedDB access, and worker orchestration
- Web Worker: performs MuPDF/WASM compression and image recompression
- `comlink`: typed RPC layer between Offscreen and Worker
- IndexedDB: persists selected input and compressed output locally

Operational decisions:

- Keep the compression engine in the Web Worker inside the Offscreen Document.
- Report progress from worker to offscreen to background to popup.
- Propagate cancellation with `AbortController`.
- Enforce a timeout for long-running page operations.
- Release `ArrayBuffer`s and WASM objects immediately after save.
- Keep original and compressed records separate so the selected input can coexist with the output.
- Log only privacy-safe metadata: status, error code, sizes, durations, and record IDs.

## Proposed Typed Message Contract

Minimal Phase 4 message surface:

- `phase4:select-file`
- `phase4:clear-file`
- `phase4:compress-start`
- `phase4:compress-cancel`
- `phase4:rehydrate`
- `phase4:health`
- `phase4:progress`
- `phase4:result`
- `phase4:error`

Recommended typed payload fields:

- `recordId`
- `fileName`
- `mimeType`
- `size`
- `lastModified`
- `mode` (`Balanced`)
- `status` (`idle`, `validating`, `ready`, `error`, `compressing`, `cancelled`)
- `originalBytes`
- `compressedBytes`
- `savedBytes`
- `savedPercent`
- `errorCode`
- `errorMessage`

Transferables:

- input `ArrayBuffer`
- compressed `ArrayBuffer`

## Proposed IndexedDB Record Contract

Recommended deterministic records for the MVP:

- `phase4:selected-pdf`
- `phase4:compressed-pdf`

Selected file record:

- `id`
- `fileName`
- `mimeType`
- `size`
- `lastModified`
- `status`
- `createdAt`
- `updatedAt`
- `data` (`ArrayBuffer`)

Compressed result record:

- `id`
- `sourceId`
- `fileName`
- `originalSize`
- `compressedSize`
- `savedBytes`
- `savedPercent`
- `mode`
- `createdAt`
- `data` (`ArrayBuffer`)

This keeps the deterministic active selection separate from the latest output.

## Minimal Phase 4 Scope

Smallest acceptable MVP for implementation:

- one selected PDF
- `Balanced` compression mode only
- local processing only
- original size display
- compressed size display
- saved bytes and percentage display
- download compressed PDF
- replace / delete result
- no split support
- no JPEG2000 work yet beyond spec preparation
- no multiple presets
- no batch processing
- no paywall or licensing UI
- no On-Premise implementation
- no polish sprint

## Experiment Results

Disposable spike location:

- `/private/tmp/mupdf-phase4-spike`

Commands run in the spike:

- `npm init -y`
- `npm install mupdf comlink`
- Node ESM round-trip test against an in-memory minimal PDF

Observed result:

- `mupdf.Document.openDocument(...)` succeeded on a generated tiny PDF
- `countPages()` returned `1`
- `asPDF()` returned a PDF document
- `saveToBuffer()` returned valid PDF bytes
- Output header began with `%PDF-1.4`

This proves the selected MuPDF package can load and rewrite a PDF locally in a controlled spike.

## Blockers

Hard blocker status:

- Technical blocker: none identified yet
- Licensing blocker: owner decision required

The only unresolved issue is whether the project can ship under AGPL, or whether a commercial MuPDF license must be obtained.

## Recommendation

Decision: `CONDITIONAL GO`

Reason:

- The canonical specification now explicitly chooses the Phase 4 engine and architecture.
- The selected MuPDF package is technically viable in a local spike.
- The remaining blocker is licensing, which requires an owner decision rather than a technical redesign.

Recommended Phase 4 branch name:

- `feature/phase4-pdf-compression`
