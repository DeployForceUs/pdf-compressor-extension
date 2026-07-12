# Phase 4 Image Recompression Execution Report

## Scope

Implemented the read-only image candidate classification layer on top of existing image XObject discovery, then validated a controlled single-image recompression spike on the scan PDF.

The normal extension runtime still does not modify PDF objects. The spike path decoded one image, recompressed it to JPEG, replaced that one stream in place, and saved the output with the existing `saveToBuffer({ garbage: 4 })` flow.

## Implementation Summary

- Added a dedicated classifier module at `src/lib/pdf/image-xobject-classifier.ts`.
- Extended discovery metadata in `src/lib/pdf/image-xobject-discovery.ts` with read-only mask and alpha indicators needed by the classifier.
- Wired developer-only classification diagnostics into `src/lib/pdf/compressor.ts`.
- Kept discovery and classification separate.
- Kept the runtime compression path unchanged.

## Validation Results

### `Downloads/Magellan-1100i-Manual.pdf`

- total discovered: 15
- safe count: 0
- skip count: 3
- unsupported count: 12
- top reasons:
  - `UNSUPPORTED_CMYK_COLORSPACE`: 4
  - `UNSUPPORTED_INDEXED_COLORSPACE`: 4
  - `RECOMPRESSION_WOULD_INCREASE_SIZE`: 2
  - `UNSUPPORTED_COLORSPACE`: 2
  - `IMAGE_MASK`: 2
- largest safe candidate: none

### `Downloads/Scan_20251024 (2).pdf`

- total discovered: 1
- safe count: 1
- skip count: 0
- unsupported count: 0
- top reasons:
  - `ELIGIBLE_FOR_RECOMPRESSION`: 1
- largest safe candidate:
  - page 1, object `2 0 R`, `1653x2338`, `1985585` bytes, `0.5138` bytes/pixel

## Controlled Spike Result

Validated a single safe image XObject recompression spike against `Downloads/Scan_20251024 (2).pdf`.

- target image: page 1, object `2 0 R`
- input size: `1,986,416` bytes
- output size: `472,323` bytes
- saved bytes: `1,514,093`
- saved percent: `76.22%`
- output header: `%PDF-`
- input page count: `1`
- output page count: `1`
- rewritten image remained loadable after save
- manual page render showed no visible corruption

Implementation note:

- the rewrite path must operate on the indirect PDF stream reference, not the resolved stream dictionary
- `saveToBuffer({ garbage: 4 })` preserved document structure for the tested file

## Phase 4 Requirement Mapping

- `Интеграция mupdf.js (WASM) для in-place замены изображений`:
  - discovery and classification now prepare the image candidates required for that later phase, without mutating PDF objects yet.
- `Извлечение изображений из PDF (JPEG, PNG)`:
  - the new discovery pass walks every page resource tree and enumerates image XObjects.
- `Сжатие изображений через OffscreenCanvas`:
  - not implemented yet; classification isolates the safe candidates that will feed that work.
- `Таймаут для длительных операций` and `Scrubbing метаданных`:
  - unchanged in the current branch.
- controlled single-image recompression spike:
  - one safe candidate was decoded, JPEG re-encoded at quality 75, written back in place, and saved successfully without changing page count or visible output integrity.

## Commit

- `eeb3fc1` was the previous checkpoint.
- This work continues on `feature/phase4-image-recompression`.
