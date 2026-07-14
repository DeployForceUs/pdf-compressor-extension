# Phase 4: Image Recompression Architecture

## Numbering Note

Image recompression belongs to canonical Stage 4 client-side compression. This document was previously named `phase5_image_recompression_architecture.md`; that label conflicted with both the specification and the Phase 4 execution report.

## Scope

This note captures the browser-side image recompression path that sits after image XObject discovery and candidate classification.

Current state:

- image XObject discovery is implemented
- image candidate classification is implemented
- a production-safe multi-image recompression helper is implemented
- the helper rewrites only `SAFE_RECOMPRESS` candidates, keeps the structural-only result as fallback, and validates the final output before returning it
- the normal extension runtime only mutates the PDF inside the compression path
- manual Chrome acceptance passed after reloading the unpacked extension in `chrome://extensions`
- a stale extension build briefly showed `0%` compression before reload; the current production bundle reproduces the measured scan result

## Pipeline Shape

The browser-side pipeline is intentionally split into read-only stages:

1. discover image XObjects from every page resource tree
2. classify each candidate into `SAFE_RECOMPRESS`, `SKIP`, or `UNSUPPORTED`
3. only after that, perform decode, JPEG re-encode, and stream replacement for safe candidates
4. re-check the final PDF, then fall back to the structural-only result if the recompressed output is invalid or larger
5. finish with a structural rewrite and garbage cleanup

Discovery and classification remain separate modules so the first two stages can be validated without changing PDF contents.

## Implemented Runtime

The installed MuPDF binding exposes and the production helper uses:

- page object traversal
- PDF object inspection
- image loading
- pixmap conversion
- raw stream read/write
- final document rewrite via `saveToBuffer({ garbage: 4 })`

The production helper:

- decodes each safe image to a pixmap
- JPEG re-encodes at fixed quality 75
- rewrites the indirect PDF stream only when the new stream is smaller
- keeps the structural-only result as fallback if output is invalid or larger
- reopens and validates the final document

## Classification Policy

`SAFE_RECOMPRESS` requires:

- normal image XObject
- no `ImageMask`
- no `SMask` or alpha dependency
- supported colorspace and filter chain
- valid dimensions
- enough stream data to justify recompression
- safe reference usage

`SKIP` covers small or already-efficient images and candidates unlikely to save bytes.

`UNSUPPORTED` covers `JBIG2Decode`, `JPXDecode`, unsupported CMYK or indexed colorspaces, masks, alpha dependencies, malformed dictionaries, and unsupported filter chains.

## Deferred Work

- Quality remains fixed at 75 until canonical Stage 7 quality controls are implemented.
- `JPXDecode` / JPEG2000 remains canonical Stage 5 and is deferred.
- OffscreenCanvas comparison was abandoned for this milestone after proving inconclusive relative to `Pixmap.asJPEG(75)`.

## Specification Compliance

- Conservative image recompression and validation: **Fully matches specification intent**.
- MuPDF Pixmap encoding instead of OffscreenCanvas: **Extends specification / approved implementation deviation**.
- Fixed quality 75: **Partially matches specification** until Stage 7 quality UI and persistence are implemented.
- JPEG2000 exclusion: **Partially matches specification** because canonical Stage 5 remains deferred.
