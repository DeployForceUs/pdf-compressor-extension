# Phase 5 Browser Runtime Trace

## Status

`TRACE_COMPLETE`

Investigation baseline:

- Branch: `feature/phase5-pdf-split`
- Baseline commit: `c7bd9569733615bd686b3af6fc3db0b8f9522588`
- Scope: runtime-boundary diagnostics only
- Fixes implemented: none

## Result

- Exact last successful boundary: `before-worker-api-split`
- First missing boundary: `worker-entry`
- Root cause: proven
- Fix ready: yes

The Dedicated Worker fails during module evaluation before the Worker API is exposed and before `createSplitZipArchive(...)` can be entered. The generated Worker asset contains `webextension-polyfill`. That polyfill evaluates its extension-page guard in the Dedicated Worker and throws:

```text
Error: This script should only be loaded in a browser extension.
```

Because module evaluation aborts before `expose(api)`, the Comlink request made by `workerApi.split(...)` has no Worker-side responder. The offscreen caller remains pending at the first Worker RPC boundary, while the Popup remains at the already-broadcast `planning-parts` / `10%` state.

## Timeline

| Order | Runtime boundary | Evidence | Result |
|---:|---|---|---|
| 1 | Popup sends `split:local` | Split starts in the Popup | Successful |
| 2 | Background receives request | Offscreen job runs and emits progress through the background/runtime topology | Successful |
| 3 | Offscreen receives `offscreen:split` | `runSplitJob(...)` emits progress | Successful |
| 4 | `planning-parts` progress callback | Popup visibly reaches `10%` / `Planning parts` | Successful |
| 5 | Before `workerApi.split(...)` | This boundary follows synchronously after the awaited `planning-parts` callback and is now instrumented as `before-worker-api-split` | Successful |
| 6 | Worker module initialization | Browser reports `This script should only be loaded in a browser extension` from `assets/worker-*.js` | Failed |
| 7 | Worker API entry | Instrumented as `worker-entry`; module evaluation aborts before this code can execute | First missing boundary |
| 8 | Before `createSplitZipArchive(...)` | Downstream of `worker-entry` | Not reached |
| 9 | Split-engine progress callbacks | Downstream of Worker entry | Not reached |
| 10 | After `createSplitZipArchive(...)` | Downstream of Worker entry | Not reached |
| 11 | Before Worker return | Downstream of Worker entry | Not reached |
| 12 | After `workerApi.split(...)` resolves | No Worker response exists | Not reached |
| 13 | Persistence start/end | Downstream of resolved Worker RPC | Not reached |
| 14 | Result broadcast | Downstream of persistence | Not reached |
| 15 | Popup receives completion | No result is produced | Not reached |

## Exact Last Successful Boundary

`src/lib/offscreen/split-runtime.ts` reaches the boundary immediately before:

```ts
await deps.workerApi.split(splitRequest, deps.isCancelled, deps.onProgress);
```

This is consistent with the visible `10%` state because `planning-parts` is emitted and awaited immediately before the Worker RPC.

## First Missing Boundary

`src/lib/offscreen/worker.ts` never reaches the first statement of the `split(...)` Worker API method.

The first missing trace stage is:

```text
worker-entry
```

The failure is earlier, while the Worker module and its runtime imports are being evaluated.

## Root-Cause Proof

### 1. Browser evidence identifies the Worker asset

Chrome reports the exception in `offscreen.html` with a stack in `assets/worker-*.js`:

```text
This script should only be loaded in a browser extension.
```

### 2. The baseline Worker asset contains the exact throwing guard

The unmodified baseline `c7bd9569733615bd686b3af6fc3db0b8f9522588` was built independently. Its generated asset was:

```text
.output/chrome-mv3/assets/worker-BjMPKT9a.js
```

The exact exception text is present in that baseline Worker asset. Executing the generated module independently terminates during module evaluation with:

```text
Error: This script should only be loaded in a browser extension.
    at .../assets/worker-BjMPKT9a.js:76:62356
```

This separate baseline build proves the diagnostic instrumentation did not introduce the dependency or the exception.

### 3. Source import chain explains why it is in the Worker

The Worker import graph includes this runtime chain:

```text
src/lib/offscreen/worker.ts
  -> src/lib/pdf/split-archive.ts
  -> src/lib/messaging.ts
  -> webextension-polyfill
```

`split-archive.ts` imports `normalizeSplitOutputMode` from `messaging.ts`. `messaging.ts` has a runtime import of `webextension-polyfill` for `sendMessage(...)`. As a result, the browser-extension messaging polyfill is bundled into the Dedicated Worker even though the split engine itself does not need runtime messaging.

### 4. The failure precedes Worker API exposure

The Worker cannot complete module evaluation after the polyfill throws. Therefore `expose(api)` is not installed and the Worker cannot answer the Comlink RPC. This explains both observed facts without relying on the previously suspected multi-buffer return boundary:

- no Worker-generated progress event appears after `10%`;
- `workerApi.split(...)` never resolves or reaches persistence.

## Browser Evidence Assessment

### Error 1

```text
Context: offscreen.html
Message: This script should only be loaded in a browser extension.
Stack: assets/worker-*.js
```

Assessment: root-cause evidence. The exact throwing code is present in the baseline Worker bundle and runs before the Worker API entry.

### Error 2

```text
A listener indicated an asynchronous response by returning true,
but the message channel closed before a response was received.
```

Assessment: not required to explain the first stopping boundary. No fix should be based on Error 2 during this investigation. The Worker module failure already prevents the awaited split response from completing.

## Diagnostic Instrumentation Added

All temporary runtime diagnostics use one prefix:

```text
[PDF_SPLIT_TRACE]
```

Every trace payload includes:

- `timestamp`
- `jobId`
- `outputMode`
- `stage`
- `workerLifecycle`
- `messageDirection`
- `success`
- `errorName`
- `errorMessage`

Instrumented boundaries:

1. Popup request dispatch
2. Background receive and forward
3. Offscreen receive
4. Worker creation, proxy creation, `error`, and `messageerror`
5. Before `workerApi.split(...)`
6. Worker entry
7. Before `createSplitZipArchive(...)`
8. Progress callback start/end
9. After `createSplitZipArchive(...)`
10. Before Worker return
11. After Worker RPC resolution/rejection
12. Persistence start/end
13. Result broadcast
14. Popup completion receive

## Screenshots

No additional screenshot is necessary. The textual Chrome exception, its Worker asset stack, the independently built baseline asset, and the source import chain identify the stopping boundary more precisely than a UI screenshot of the `10%` state.

## Recommended Fix

Fix only the proven Worker import-boundary violation:

1. Move Worker-safe split contracts and `normalizeSplitOutputMode` into a browser-independent module with no `webextension-polyfill` import.
2. Ensure `src/lib/offscreen/worker.ts` and every runtime dependency reachable from it import only Worker-safe modules.
3. Rebuild and verify that the generated `assets/worker-*.js` no longer contains:

   ```text
   This script should only be loaded in a browser extension.
   ```

4. Re-run the same Browser trace and require this sequence before accepting the fix:

   ```text
   before-worker-api-split
   worker-entry
   before-create-split-zip-archive
   progress:...
   after-create-split-zip-archive
   before-worker-return
   after-worker-api-split-resolved
   persistence-start
   persistence-end
   result-broadcast-dispatched
   popup-received-completion
   ```

Do not change Artifact Factory, persistence architecture, output modes, UI, compression behavior, or the Worker return-transfer policy as part of this fix.

## Validation

Passed:

```text
npm run check
npm run build
tests/phase5_split_worker_transfer_boundary.test.ts
tests/phase5_slice13_artifact_factory_output_modes.test.ts
```

Independent baseline proof:

```text
git worktree at c7bd9569733615bd686b3af6fc3db0b8f9522588
npm run build
generated worker contains the exact browser exception
generated worker aborts during module evaluation before Worker API entry
```

No product fix was attempted.

## Specification Compliance

- Runtime-boundary diagnostics: `Extends specification` — temporary investigation instrumentation requested by the current task; no product behavior is changed.
- Existing Split behavior, output modes, Artifact Factory, persistence, and UI: `Fully matches specification` for this investigation because they were not modified.
- Recommended Worker-safe module separation: `Requires future specification update` only if the project chooses to document runtime dependency-boundary rules explicitly; no implementation was performed here.

Product decisions outside the canonical specification used in this investigation:

- The current task explicitly authorized temporary `[PDF_SPLIT_TRACE]` instrumentation.
- No other product behavior was inferred or added.
