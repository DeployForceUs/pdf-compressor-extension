# Phase 5: Image Recompression Architecture

## Scope

This note captures the browser-side image recompression path that sits after image XObject discovery and candidate classification.

Current state:

- image XObject discovery is implemented
- image candidate classification is implemented
- one controlled single-image recompression spike succeeded on the scan PDF
- the normal extension runtime still does not mutate PDF objects outside that spike path

## Pipeline shape

The browser-side pipeline is intentionally split into read-only stages:

1. discover image XObjects from every page resource tree
2. classify each candidate into `SAFE_RECOMPRESS`, `SKIP`, or `UNSUPPORTED`
3. only after that, perform decode, resample, re-encode, and stream replacement
4. finish with a structural rewrite and garbage cleanup

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

Spike note:

- the tested image XObject was decoded to a pixmap, JPEG re-encoded at quality 75, written back in place, and saved with `saveToBuffer({ garbage: 4 })`
- the object that must be rewritten is the indirect PDF stream reference, not the resolved stream dictionary
- the output reopened with the same page count and rendered without visible corruption on the tested scan PDF

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
- `SKIP` count
- `UNSUPPORTED` count
- reason breakdown
- largest safe candidates

## Next implementation slice

The next step is expanding the single-image spike into a controlled pipeline for safe candidates only.
That work should stay behind the current classifier and should not alter discovery or classification behavior.
