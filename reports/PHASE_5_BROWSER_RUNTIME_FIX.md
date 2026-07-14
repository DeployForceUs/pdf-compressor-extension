# Phase 5 Browser Runtime Boundary Fix

> **Canonical numbering:** This historical Phase 5 Split report belongs to specification Stage 6. See [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md).

## Status

`FIX_IMPLEMENTED_BROWSER_VALIDATION_PENDING`

Baseline:

- Branch: `feature/phase5-pdf-split`
- Root-cause commit: `894c8bfe19b3b46cd27825c249f99f9b03ac4e5c`
- Root-cause report: `reports/PHASE_5_BROWSER_RUNTIME_TRACE.md`

## Proven Root Cause

The generated Dedicated Worker included `webextension-polyfill` through this runtime import chain:

```text
src/lib/offscreen/worker.ts
  -> src/lib/pdf/split-archive.ts
  -> src/lib/messaging.ts
  -> webextension-polyfill
```

The polyfill threw during Worker module evaluation before `expose(api)`, so the first Comlink call remained pending and the Popup stayed at `planning-parts` / `10%`.

## Fix Implemented

Created a browser-independent Split output-mode module:

```text
src/lib/split-output-mode.ts
```

The module owns:

- `SPLIT_OUTPUT_MODES`
- `SplitOutputMode`
- `SPLIT_OUTPUT_MODE_DEFAULT`
- `isSplitOutputMode(...)`
- `normalizeSplitOutputMode(...)`

Worker-reachable runtime code now imports output-mode normalization from this browser-independent module instead of `messaging.ts`.

`messaging.ts` re-exports the same public symbols, preserving existing Popup, background, storage, test, and request-contract imports without changing product behavior.

## Scope Preserved

No changes were made to:

- Artifact Factory behavior
- output-mode semantics
- split planning
- PDF part generation
- persistence schema or transactions
- Popup UI
- compression behavior
- Comlink transfer policy
- cancellation or timeout behavior

The existing `[PDF_SPLIT_TRACE]` instrumentation remains in place for manual Chrome acceptance.

## Regression Guard

Added:

```text
scripts/assert-worker-runtime-boundary.mjs
npm run check:worker-boundary
```

The guard fails when:

- the production build does not contain exactly one Worker asset;
- the generated Worker asset contains the `webextension-polyfill` extension-page guard;
- the generated Worker asset is missing the `worker-entry` diagnostic boundary.

## Generated Worker Evidence

Production Worker before the fix:

```text
assets/worker-*.js
contains: This script should only be loaded in a browser extension.
module evaluation: failed before Worker API exposure
```

Production Worker after the fix:

```text
assets/worker-CwnhzxG6.js
polyfill guard: absent
worker-entry trace: present
module evaluation with Worker globals: passed
```

## Validation

Passed:

```text
npm run check
npm run build
npm run check:worker-boundary
tests/phase5_split_worker_transfer_boundary.test.ts
tests/phase5_slice13_artifact_factory_output_modes.test.ts
tests/phase5_slice12_artifact_factory_foundation.test.ts
tests/phase5_slice6a.test.ts
tests/phase5_selected_pdf_persistence.test.ts
generated Worker module evaluation smoke test
```

Validated output modes:

- `single-zip`
- `individual-pdfs`
- `separate-zips`

Additional test not executed successfully:

```text
tests/phase4_image_xobject_recompression_loop.test.ts
tests/phase5_slice10_mupdf_lifecycle.test.ts
```

Reason: their exact local Canon PDF fixture is not present at:

```text
/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf
```

This is an environment fixture blocker, not a test assertion failure and not caused by the fix.

## Manual Chrome Acceptance Required

The next manual Chrome run must verify:

1. Reload the unpacked production build.
2. Select a valid PDF.
3. Run `Individual PDFs` with `compressAfter` disabled.
4. Confirm the trace reaches:

   ```text
   before-worker-api-split
   worker-entry
   before-create-split-zip-archive
   after-create-split-zip-archive
   before-worker-return
   after-worker-api-split-resolved
   persistence-start
   persistence-end
   result-broadcast-dispatched
   popup-received-completion
   ```

5. Confirm the Popup advances past `10%` and exposes the completed artifacts.
6. Re-open the Popup and confirm the completed bundle restores.
7. Check whether `Compress PDF` becomes enabled for the same valid PDF.

Error 2 about a closed asynchronous message channel remains outside this fix. Investigate it separately only if it remains after the proven Worker boundary is healthy.

## Specification Compliance

- Worker-safe runtime dependency boundary: `Fully matches specification` — restores the intended Popup → background → offscreen → Worker architecture without changing behavior.
- Split output modes and Artifact Factory: `Fully matches specification` — public contracts and all three established output modes are preserved.
- Worker bundle regression guard: `Extends specification` — build-time protection added to prevent recurrence of the proven browser-only failure.
- Manual Chrome acceptance: `Requires future specification update` only if the project chooses to make the exact trace sequence a permanent release gate; verification is still pending.

Product decisions outside the canonical specification:

- The current task authorized the narrow Worker import-boundary fix after root-cause proof.
- No new product behavior was introduced.

## Decision

`READY_FOR_MANUAL_CHROME_VALIDATION`
