# Phase 5: Image Recompression Architecture

## Scope

This note captures the browser-side image recompression path that sits after image XObject discovery and candidate classification.

Current state:

- image XObject discovery is implemented
- image candidate classification is implemented
- a production-safe multi-image recompression helper is implemented
- the helper rewrites only `SAFE_RECOMPRESS` candidates, keeps the structural-only result as fallback, and validates the final output before returning it
- the normal extension runtime still only mutates the PDF inside the compression path

## Pipeline shape

The browser-side pipeline is intentionally split into read-only stages:

1. discover image XObjects from every page resource tree
2. classify each candidate into `SAFE_RECOMPRESS`, `SKIP`, or `UNSUPPORTED`
3. only after that, perform decode, JPEG re-encode, and stream replacement for safe candidates
4. re-check the final PDF, then fall back to the structural-only result if the recompressed output is invalid or larger
5. finish with a structural rewrite and garbage cleanup

Discovery and classification remain separate modules so the first two stages can be validated without changing PDF contents.

## What the current code can already support

The installed MuPDF binding already exposes the primitives required for the later phases:

- page object traversal
- PDF object inspection
- image loading
- pixmap conversion
- raw stream read/write
- final document rewrite via `saveToBuffer({ garbage: 4 })`

That is enough for planning, classification, and eventual recompression, but not enough to claim that recompression has happened yet.
The production helper now uses those primitives directly:

- the image is decoded to a pixmap
- JPEG re-encode stays fixed at quality 75
- the indirect PDF stream reference is rewritten in place when the new stream is smaller
- the structural-only result remains the fallback if the recompressed output is invalid or larger
- final validation reopens the document and checks the rewritten pages again

## Classification policy

The classifier is conservative by design.

`SAFE_RECOMPRESS` requires:

- normal image XObject
- no `ImageMask`
- no `SMask` or alpha dependency
- supported colorspace
- supported filter chain
- valid dimensions
- large enough stream to justify recompression
- no unsafe shared reference usage

`SKIP` is used for:

- very small images
- already efficient JPEG-like images
- assets below the size threshold
- duplicate or shared references that are not yet safe to rewrite
- images where recompression is unlikely to save bytes

`UNSUPPORTED` is used for:

- `JBIG2Decode`
- `JPXDecode`
- unsupported CMYK handling
- unsupported indexed colorspace handling
- `ImageMask`
- `SMask` or other alpha dependency
- malformed dictionaries
- unsupported filter chains

## Developer diagnostics

The development log prints a concise read-only summary:

- total images
- `SAFE_RECOMPRESS` count
- successfully recompressed count
- skipped because new stream was not smaller
- failed recompression count
- `SKIP` count
- `UNSUPPORTED` count
- reason breakdown
- largest safe candidates

## Next implementation slice

The next slice is the browser-side encoding benchmark and quality comparison work. The production helper is now in place and should stay behind the current classifier without changing discovery or classification behavior.
