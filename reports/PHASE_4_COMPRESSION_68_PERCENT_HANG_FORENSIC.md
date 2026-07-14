# Summary
The compression hang is caused by an infinite loop inside `src/lib/pdf/image-xobject-recompression.ts`, not by the popup, background, offscreen, persistence, or worker cleanup layers.

On the Canon benchmark PDF
`/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`
the compression pipeline reaches the `rewriting` stage at 68% and then never advances to `verifying` or `persisting`.

Root cause:

- the recompression helper selects safe candidates by repeatedly rediscovering the live document;
- when a candidate is skipped because the JPEG is not smaller, its fingerprint is not added to `processedFingerprints`;
- the same candidate is selected again on the next loop iteration;
- the loop never terminates, so the compression promise never resolves;
- cancellation only aborts the offscreen `AbortController`, but the recompression helper does not observe that signal during the loop.

This bug predates the Artifact Factory work. The first bad boundary is the initial multi-image recompression helper commit `af38687`.

# Manual Chrome Evidence
Observed on the exact Canon PDF after extension reload:

- validation status: Ready
- page count displays correctly
- Compress PDF is enabled
- Split PDF is enabled
- compression starts normally
- progress reaches 68%
- status remains Compressing
- compressed size stays empty
- Saved and Saved % stay empty
- Download result never appears
- clicking Cancel changes status to Cancelling
- progress remains at 68%
- the job never returns to Idle
- repeated Cancel clicks do nothing
- both primary actions remain blocked by shared busy state

# Exact Reproduction
Exact file:

- `/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`

File facts:

- size: `5,756,013` bytes
- page count: `220`
- MuPDF opens it successfully
- `needsPassword() === false`

Direct MuPDF/worker repro:

- `compressBalancedPdf(...)` enters `rewriting`
- `recompressSafeImageCandidates(...)` rewrites one safe candidate successfully
- the next safe candidate is skipped because the JPEG is not smaller
- the same skipped candidate is selected again and again
- no `compression:progress` event beyond 68% is emitted
- no `compression:result` or `compression:error` event is emitted

# Test File
The exact file used for the repro is:

- `/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`

The trace showed the first safe candidates:

1. page 69, object `277 0 R` rewrote successfully
2. page 192, object `854 0 R` was skipped because the JPEG was larger
3. page 192, object `854 0 R` was selected again

That repeated selection is the stall.

# Compression Pipeline
Current progress mapping in `src/lib/pdf/compressor.ts`:

| UI Percent | Runtime Stage | Event Source | Function | Expected Next Event |
|------------|---------------|--------------|----------|---------------------|
| 4% | loading-engine | `compressBalancedPdf` | `progressEvent(..., "loading-engine", 4, ...)` | `opening` at 12% |
| 12% | opening | `compressBalancedPdf` | `progressEvent(..., "opening", 12, ...)` | `scrubbing` at 35% |
| 35% | scrubbing | `compressBalancedPdf` | `progressEvent(..., "scrubbing", 35, ...)` | `rewriting` at 68% |
| 68% | rewriting | `compressBalancedPdf` | `progressEvent(..., "rewriting", 68, ...)` | `verifying` at 88% |
| 88% | verifying | `compressBalancedPdf` | `progressEvent(..., "verifying", 88, ...)` | `persisting` at 96% |
| 96% | persisting | `compressBalancedPdf` | `progressEvent(..., "persisting", 96, ...)` | `compression:result` and 100% complete |

# Exact 68 Percent Stage
The 68% event is emitted here:

`src/lib/pdf/compressor.ts`

```ts
await onProgress(
  progressEvent(request.recordId, "rewriting", 68, pageCount, 0, "Rewriting PDF", originalBytes),
);
```

Immediately after that, the compressor awaits:

`await recompressSafeImageCandidates(mupdf, request.input, pdfDocument, imageClassification, 75);`

That awaited call never completes because the helper loops forever over the same skipped safe candidate.

# Stuck Function or Await
Exact stuck await:

- `await recompressSafeImageCandidates(...)` in `compressBalancedPdf`

Exact stuck function:

- `recompressSafeImageCandidates(...)` in `src/lib/pdf/image-xobject-recompression.ts`

The specific failure point inside that helper is the candidate-selection loop:

```ts
const nextCandidate = liveClassification.candidates
  .filter(...)
  .sort(...)
  .find((candidate) => !processedFingerprints.has(fingerprintCandidate(candidate)));
```

When a candidate is skipped because the JPEG is not smaller, the code increments a counter and `continue`s without adding the fingerprint to `processedFingerprints`. The next iteration finds the same candidate again.

# Cancellation Flow
Popup cancel flow:

1. Popup sends `background:compression-cancel`.
2. Background forwards `offscreen:compression-cancel`.
3. Offscreen sets `activeCompression.reason = "cancelled"`.
4. Offscreen calls `activeCompression.abortController.abort()`.

What does not happen:

- `compressBalancedPdf` never reaches its post-helper cancellation checks
- the recompression helper does not inspect the abort signal inside the loop
- no completion or failure event is broadcast
- `resetCompressionState()` never runs because the top-level promise never resolves

Does cancel reach Offscreen?

- yes

Does cancel reach Worker?

- indirectly yes, through the abort flag passed into `compressBalancedPdf`, but that flag is not checked inside the stuck recompression loop

Is a cancellation flag set?

- yes, `activeCompression.reason = "cancelled"` and the AbortController is aborted

Is the current operation able to observe it?

- not while it is looping over the skipped candidate

Is there a timeout?

- yes, but it uses the same abort path and does not interrupt the stuck helper

Is worker termination available?

- not in this path

Which event is supposed to move UI from Cancelling to Idle/Error?

- a final `compression:result` or `compression:error` broadcast from offscreen

Why is that event missing?

- the worker promise never resolves or rejects because the recompression helper never returns

# Why Cancelling Never Completes
The cancel action changes popup state because the shared busy state is still owned by the active compression job.

The job never completes because:

- the 68% `rewriting` stage is followed by a non-terminating safe-candidate retry loop;
- the retry loop is not cancellation-aware;
- no result/error broadcast is emitted;
- popup cleanup is tied to that missing final event.

In short, `Cancelling` is a state transition on the UI side, but nothing in the worker/offscreen pipeline finishes to release it.

# Popup Busy-State Cleanup
The popup stays blocked because its shared busy state is cleared only when compression finishes or errors.

The current flow is:

- compression starts
- popup receives progress events
- popup sets `compression.status = "compressing"`
- the final `compression:result` or `compression:error` never arrives
- `resetCompressionState()` in offscreen `finally` never runs
- the popup never receives the terminal state needed to clear `sharedBusy`

So one missing terminal event is enough to wedge the popup until reload.

# Worker and Offscreen Lifecycle
Offscreen:

- starts compression
- holds `activeCompression`
- sets the timeout and cancellation state
- awaits the worker promise
- never reaches cleanup because the promise never resolves

Worker:

- opens MuPDF
- scrubs metadata
- rewrites one safe image successfully
- retries the same skipped candidate indefinitely

This is a worker-side loop bug, not a lifecycle teardown bug.

# IndexedDB and Result Persistence
Not implicated in the hang.

The hang occurs before:

- `completeCompressionOutcome(...)`
- `writeCompressionResult(...)`
- the final `compression:progress` 100 event
- the final `compression:result` broadcast

So IndexedDB persistence is never reached in the failing run.

# Regression Boundary
First bad boundary:

- `af38687` - `Add multi-image recompression helper`

Evidence:

- `src/lib/pdf/image-xobject-recompression.ts` was introduced in that commit
- the infinite retry behavior is in the original helper loop
- later commits in the Artifactory / persistence area did not touch this logic

This failure predates the Artifact Factory work and the selected-PDF persistence fix.

# Existing Test Gaps
Current tests exercise:

- individual image recompression behavior
- safe / unsupported classification
- split and popup metadata
- persistence and quota handling

They do not cover:

- a full 220-page Canon compression run where the first skipped safe candidate repeats
- cancellation during the `rewriting` stage on that exact file
- a timeout path that never receives a terminal compression event
- popup busy-state recovery when the worker promise never resolves

# Root Cause
The root cause is a missing processed-candidate mark on the skipped branch inside `recompressSafeImageCandidates`.

Concrete behavior:

1. Candidate A rewrites successfully.
2. Candidate B is safe but not smaller after JPEG recompression.
3. Candidate B is skipped.
4. Candidate B’s fingerprint is not added to `processedFingerprints`.
5. The next loop iteration selects Candidate B again.
6. The helper never advances to the remaining images, never returns, and never emits a terminal event.

The popup then remains stuck in `Compressing` or `Cancelling`.

# Proposed Narrow Fix
Add one of the following minimal corrections in `src/lib/pdf/image-xobject-recompression.ts`:

- mark skipped candidates as processed before `continue`, or
- maintain a separate skip set and exclude skipped candidates on the next iteration, or
- advance the loop over a stable candidate snapshot instead of reselecting from the live document

The smallest direct fix is to add `processedFingerprints.add(candidateFingerprint);` before the skip `continue`.

A secondary safety improvement would be to check cancellation inside the loop so a cancel request can unwind even if recompression work becomes slow again later.

# Regression Tests Required
Required tests after the fix:

- full Canon PDF compression completes past 68%
- no repeated selection of a skipped safe candidate
- `compression:result` is broadcast
- popup busy state clears
- cancel during 68% returns to Idle or Error
- timeout still clears the job
- existing image recompression tests remain green
- existing Phase 4 and Phase 5 suites remain green

# Files Inspected
- `src/lib/pdf/compressor.ts`
- `src/lib/pdf/image-xobject-recompression.ts`
- `src/lib/offscreen/main.ts`
- `src/lib/offscreen/compression-runtime.ts`
- `src/lib/storage/pdf-compression-db.ts`
- `src/entrypoints/popup/main.tsx`
- `src/entrypoints/popup/store.ts`
- `src/lib/messaging.ts`
- `tests/phase5_slice8a.test.ts`
- `tests/phase5_slice12_artifact_factory_foundation.test.ts`
- `tests/phase5_selected_pdf_persistence.test.ts`
- `tests/phase5_stabilization_quota.test.ts`
- `tests/phase5_slice11_split_ui_metadata.test.ts`

# Risks
- If cancellation checks are only added without fixing the skipped-candidate retry, the hang remains.
- If the fix is only applied to the Canon file, the same loop can recur on any document with a safe-but-not-smaller image.
- Because the helper rewrites the live document repeatedly, future regressions in candidate tracking could recreate the same wedge.

# Decision
FIX_READY

# Fix Implemented
The recompression loop in `src/lib/pdf/image-xobject-recompression.ts` now guarantees forward progress on every non-cancelled iteration:

- every permanently non-retryable outcome adds the candidate fingerprint to `processedFingerprints` before the iteration exits;
- the previously failing `recompressedSize >= originalSize` branch now marks the candidate as processed before continuing;
- cancellation is polled at the start of the loop and before expensive candidate work so `Cancelling` can unwind promptly;
- a defensive progress guard now rejects repeated selection of the same candidate or excessive iterations relative to the candidate count.

`compressBalancedPdf(...)` now passes its existing cancel checker into the helper so the compression pipeline observes the same cancellation state inside the recompression loop.

# Audited Skip Branches
The helper was reviewed for every non-success path:

- unresolved object reference: permanently non-retryable, already marked processed
- non-indirect object: permanently non-retryable, already marked processed
- JPEG recompression not smaller: permanently non-retryable, now marked processed before continuing
- load / decode / save / validation failures: permanently non-retryable for the current run, marked processed and abort the recompression pass
- cancellation: now rethrown immediately instead of being converted into a recompression failure

No retryable branch was introduced.

# Cancellation Checkpoints Added
Cancellation is now checked:

- before each live candidate discovery pass
- before target-object processing
- after reading the raw stream and before image decoding
- after obtaining the pixmap and before JPEG encoding
- after saving candidate bytes and before validation

This keeps the existing cancellation semantics intact without changing the broader worker/offscreen architecture.

# Defensive Invariant Description
The new `createRecompressionProgressGuard(candidateCount)` helper enforces two safety limits:

- the same fingerprint cannot be selected twice in a row
- the loop cannot exceed a conservative iteration bound derived from the candidate count

The guard fails with a clear internal error instead of spinning forever. It does not reject large PDFs merely because they contain many candidates.

# Automated Tests Added
Added `tests/phase4_image_xobject_recompression_loop.test.ts` covering:

- the loop guard reporting no-progress iterations
- the loop guard rejecting repeated fingerprint selection
- the loop guard rejecting excessive iterations
- the exact Canon benchmark PDF completing recompression without hanging
- at least one successful recompression on the Canon PDF
- at least one non-beneficial skip on the Canon PDF
- cancellation during recompression returning `CANCELLED`

Existing Phase 5 split tests were also rerun:

- `tests/phase5_slice8a.test.ts`
- `tests/phase5_slice9_passwordless_encrypted_split.test.ts`

# Exact Canon PDF Validation Result
Exact file validated:

- `/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`

Observed result after the fix:

- compression no longer stalls at 68%
- the recompression helper returns normally
- the output PDF reopens successfully
- the page count remains 220
- 233 image XObjects discovered
- 36 candidates classified SAFE_RECOMPRESS
- 15 candidates recompressed successfully
- 21 safe candidates skipped because the JPEG was not smaller
- 0 recompression failures
- the extension remains responsive in the recompression path

# Cancel Validation Result
On the same Canon PDF, a cancellation request during recompression now unwinds cleanly:

- the helper observes cancellation inside the loop
- the operation exits instead of hanging in `Cancelling`
- the cancellation error is preserved as `CANCELLED`
- no infinite retry remains active

# Commands Executed and Results
Executed successfully:

- `node --import /Users/dmitriikarpov/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/esm/index.mjs tests/phase4_image_xobject_recompression_loop.test.ts`
- `node --import /Users/dmitriikarpov/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/esm/index.mjs tests/phase5_slice8a.test.ts`
- `node --import /Users/dmitriikarpov/.npm/_npx/fd45a72a545557e9/node_modules/tsx/dist/esm/index.mjs tests/phase5_slice9_passwordless_encrypted_split.test.ts`
- `npm run check`
- `npm run build`

Results:

- focused recompression regression: pass
- Phase 5 compress-after split regression: pass
- Phase 5 passwordless-encrypted split regression: pass
- typecheck: pass
- build: pass

# Remaining Risks
The guard is deliberately conservative, but it still depends on the candidate fingerprinting scheme. If new mutable image classes are introduced later, the fingerprint should be reviewed alongside those changes.

The cancellation checks now cover the current expensive stages in the helper, but if future MuPDF APIs introduce additional long-running synchronous operations, they should be placed behind the same cancel polling pattern.

# Final Decision
FIX_VERIFIED
