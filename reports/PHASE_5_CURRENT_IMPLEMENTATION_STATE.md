# Canonical Stage 6 Split — Current Implementation State

> **Historical alias:** The branch, reports, tests, and storage identifiers use "Phase 5". Under specification v3.3.0 this work is canonical Stage 6 client-side PDF splitting. See [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md).

## Repository State

- Branch: `feature/phase5-pdf-split`
- Validated commit: `3310e72980abe7085c2ab7d9f897804c88ddca27`
- Remote branch: pushed
- Working tree after browser acceptance: clean
- `origin/main`: ends at the Phase 3 merge and does not yet contain Stage 4 or Stage 6

## Implementation Status

Canonical Stage 6 Split is implemented end to end:

- split by pages
- split by maximum serialized part size
- manual page-range selection
- optional compress-after execution plumbing
- cancellation and timeout boundaries
- generated-part validation
- artifact factory
- atomic bundle/artifact persistence
- legacy single-ZIP compatibility
- restored result metadata and downloads

Output modes:

- `single-zip`
- `individual-pdfs`
- `separate-zips`

## Browser Acceptance

Manual Chrome acceptance completed on 2026-07-14.

Confirmed:

- all three output modes reach 100%
- Individual PDFs download
- Separate ZIPs download
- the common ZIP archive downloads
- the final result persists after the popup is closed and reopened
- the Canon fixture produced 11 parts at 20 pages per part
- no Split warnings were reported for the accepted common-ZIP run

Runtime trace confirmed:

1. background received and forwarded the request
2. offscreen received the request
3. Worker proxy existed
4. `workerApi.split()` was called
5. Worker execution and progress continued beyond the former 10% boundary
6. 11 artifacts returned from Worker RPC
7. persistence completed
8. result broadcast dispatched
9. popup rendered completion and restored the result

## Resolved Browser Regression

The former `Individual PDFs` hang at `Planning parts` / 10% was caused by `webextension-polyfill` entering the Dedicated Worker bundle through a browser-runtime import chain. The Worker threw before exposing its Comlink API.

The fix isolated Split output-mode normalization from browser messaging dependencies. The Worker bundle no longer contains the extension-only polyfill guard.

Evidence:

- [`PHASE_5_BROWSER_RUNTIME_TRACE.md`](./PHASE_5_BROWSER_RUNTIME_TRACE.md)
- [`PHASE_5_BROWSER_RUNTIME_FIX.md`](./PHASE_5_BROWSER_RUNTIME_FIX.md)

## Validation

Passed:

- `npm run check`
- `npm run build`
- Worker boundary guard
- Split output-mode and artifact tests
- selected-PDF persistence test
- Canon fixture image-XObject recompression-loop test
- Canon fixture MuPDF lifecycle test
- manual Chrome acceptance for all three output modes and downloads

## Remaining Work Outside Stage 6 Acceptance

- `Compress PDF` may remain disabled after a valid PDF is selected; this requires a separate Stage 4 browser investigation.
- Pro gating for `compressAfter`, daily limits, rate limiting, licensing, quality settings, and device-memory policy belong to canonical Stage 7.
- JPEG2000 / OpenJPEG belongs to canonical Stage 5 and remains deferred.
- Stage 4 and Stage 6 branch histories must be integrated into `main` before Stage 7 begins.

## Specification Compliance

- Split strategies and artifact generation: **Fully matches specification**.
- Three output modes: **Extends specification** while preserving the specified ZIP behavior.
- Historical Phase 5 naming: **Requires documentation mapping**, provided by `docs/PHASE_ROADMAP.md`.
- Free/Pro gating: **Not part of this implementation state**; canonical Stage 7 remains pending.
