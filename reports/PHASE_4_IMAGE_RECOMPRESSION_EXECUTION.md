# Phase 4 Image Recompression Execution Report

## Scope

Implemented the production-safe multi-image recompression helper on top of existing image XObject discovery and candidate classification.

The normal extension runtime now recompresses only `SAFE_RECOMPRESS` candidates inside the compression path. Each safe image is decoded, JPEG re-encoded at quality 75, rewritten only when smaller, and the final PDF falls back to the structural-only result if recompression is not smaller or final validation fails.

Manual Chrome acceptance passed after reloading the unpacked extension in `chrome://extensions`. A stale extension build had temporarily shown `0%` compression before reload; the current production bundle now reproduces the expected `76.22%` scan result.

## Implementation Summary

- Added a dedicated classifier module at `src/lib/pdf/image-xobject-classifier.ts`.
- Extended discovery metadata in `src/lib/pdf/image-xobject-discovery.ts` with read-only mask and alpha indicators needed by the classifier.
- Added a production recompression helper at `src/lib/pdf/image-xobject-recompression.ts`.
- Wired the helper into `src/lib/pdf/compressor.ts` without changing the UI, worker topology, or download flow.
- Kept discovery and classification separate.
- Kept the runtime compression path conservative: only safe candidates are processed, and structural-only output remains the fallback.
- Wired developer-only classification diagnostics into `src/lib/pdf/compressor.ts`.

## Validation Results

### `Downloads/Scan_20251024 (2).pdf`

- total discovered: 1
- safe count: 1
- successfully recompressed count: 1
- skipped because new stream was not smaller: 0
- failed recompression count: 0
- unsupported count: 0
- top reasons:
  - `ELIGIBLE_FOR_RECOMPRESSION`: 1
- largest safe candidate:
  - page 1, object `2 0 R`, `1653x2338`, `1985585` bytes, `0.5138` bytes/pixel
- original image bytes: `1,985,585`
- rewritten image bytes: `471,542`
- structural PDF size: `1,986,506`
- final PDF size: `472,459`
- saved bytes vs original input: `1,514,047`
- saved percent vs original input: `76.22%`
- page count: `1` before, `1` after

### `Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01.pdf`

- total discovered: 233
- safe count: 53
- successfully recompressed count: 53
- skipped because new stream was not smaller: 0
- failed recompression count: 0
- unsupported count: 133
- top reasons:
  - `UNSUPPORTED_INDEXED_COLORSPACE`: 104
  - `ELIGIBLE_FOR_RECOMPRESSION`: 53
  - `ALPHA_DEPENDENCY`: 28
  - `RECOMPRESSION_WOULD_INCREASE_SIZE`: 24
  - `ALREADY_EFFICIENTLY_COMPRESSED`: 12
- largest safe candidate:
  - page 69, object `416 0 R`, `83036` bytes
- original image bytes: `2,714,739`
- rewritten image bytes: `2,358,136`
- structural PDF size: `6,368,491`
- final PDF size: `5,756,013`
- saved bytes vs original input: `642,433`
- saved percent vs original input: `10.04%`
- page count: `220` before, `220` after

### `Downloads/Magellan-1100i-Manual.pdf`

- total discovered: 15
- safe count: 0
- successfully recompressed count: 0
- skipped because new stream was not smaller: 0
- failed recompression count: 0
- unsupported count: 12
- top reasons:
  - `UNSUPPORTED_CMYK_COLORSPACE`: 4
  - `UNSUPPORTED_INDEXED_COLORSPACE`: 4
  - `RECOMPRESSION_WOULD_INCREASE_SIZE`: 2
  - `UNSUPPORTED_COLORSPACE`: 2
  - `IMAGE_MASK`: 2
- largest safe candidate: none
- page count: `204` before, `204` after

## Final Notes

- Production multi-image recompression is working in the browser pipeline.
- The current production encoder remains MuPDF `Pixmap.asJPEG(75)`.
- The OffscreenCanvas comparison was intentionally abandoned as inconclusive and over-engineered for this milestone.
- Unsupported formats remain deferred: `ICCBased`, CMYK, Indexed ColorSpace, `JPXDecode`, `JBIG2Decode`, and masks / alpha dependencies.

## Phase 4 Requirement Mapping

- `Интеграция mupdf.js (WASM) для in-place замены изображений`:
  - the production helper now decodes safe image XObjects, JPEG re-encodes them at quality 75, and rewrites only the indirect stream reference when the new stream is smaller.
- `Извлечение изображений из PDF (JPEG, PNG)`:
  - the new discovery pass walks every page resource tree and enumerates image XObjects.
- `Сжатие изображений через OffscreenCanvas`:
  - not implemented yet; the production helper stays on MuPDF Pixmap JPEG encoding for this slice.
- `Таймаут для длительных операций` and `Scrubbing метаданных`:
  - unchanged in the current branch.
- `SAFE_RECOMPRESS` only:
  - SKIP and UNSUPPORTED candidates remain untouched.
- shared reference safety:
  - the helper rewrites each discovered image at most once and falls back to the structural-only result if the recompressed output is invalid or larger.

## Commit

- `eeb3fc1` was the previous checkpoint.
- This work continues on `feature/phase4-image-recompression`.
