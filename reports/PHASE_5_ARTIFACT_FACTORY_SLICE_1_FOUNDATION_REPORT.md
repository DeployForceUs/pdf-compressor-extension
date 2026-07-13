# Summary
Slice 1 migrates Phase 5 Split persistence from a single blob record to a parent/child artifact model while keeping the current user-visible behavior unchanged.

The split engine still executes once. `compressAfter` still runs once per eligible part. Validation still runs once per final part. The only change is the storage contract behind the existing single-ZIP result.

This slice also includes the GitHub review hotfix for IndexedDB robustness: the legacy inline-key write path now writes the value only, transaction aborts no longer mask the original persistence error, and the new storage tests run against a browser-like IndexedDB shim.

Current behavior remains:

- Split produces one ZIP archive containing all parts.
- Popup still shows one `Download ZIP archive` action.
- No output-mode selector is exposed yet.

# Scope
Implemented in this slice:

- canonical artifact contracts
- parent split bundle record
- child artifact records
- atomic persistence
- read/delete APIs for bundles and artifacts
- backward compatibility for legacy single-ZIP records
- current single-ZIP flow adapted to the new storage model
- tests and report updates

Not implemented:

- individual PDF output mode UI
- separate ZIP-per-part UI
- licensing gates
- folder downloads
- multi-download automation
- artifact-aware by-file-size replanning
- split or compression algorithm changes

# Architectural Invariants
1. Split planning executes once.
2. PDF part generation executes once.
3. `compressAfter` executes at most once per eligible part.
4. Final PDF part validation executes once.
5. Artifact generation happens only after final PDF parts exist.
6. Runtime messaging stays binary-free.
7. Popup never observes a partially persisted artifact bundle.
8. Current single-ZIP behavior remains fully compatible.

# Canonical Contracts
Added canonical contracts in `src/lib/messaging.ts`:

- `SPLIT_OUTPUT_MODES = ["single-zip", "individual-pdfs", "separate-zips"]`
- `SplitOutputMode`
- `SplitArtifactKind`
- `SplitArtifactStatus`
- `SplitArtifactDescriptor`
- `SplitArtifactRecord`
- `SplitResultBundle`

For this slice, the only runtime output mode is `single-zip`.

# IndexedDB Schema
The Phase 5 database remains `pdf-compressor-phase5`.

Stores:

- `split-results` for legacy compatibility
- `split-result-bundles` for parent bundle metadata
- `split-artifacts` for artifact metadata and bytes

The schema upgrade is additive. No second Phase 5 database was introduced.

# Atomic Persistence
Persistence now writes a complete bundle and its artifacts through one transactional boundary.

Behavior:

1. Build the final artifact set first.
2. Run any pre-commit hook before the IndexedDB transaction opens.
3. Write the final bundle and artifact records inside one transactional boundary.
4. Commit once.
5. Expose the result only after commit succeeds.

If persistence fails:

- the transaction aborts
- no partial bundle is visible
- no partial artifact is visible
- quota failures normalize to `STORAGE_QUOTA_EXCEEDED`

The in-memory test backend mirrors this behavior with staged copies and commit-at-end semantics. The IndexedDB-backed coverage now uses `fake-indexeddb` so the legacy inline-key write and transaction cleanup behavior are exercised in a browser-like environment.

# Worker and Offscreen Responsibilities
Current responsibilities remain separated:

- Worker produces final PDF part bytes and the final ZIP artifact bytes.
- Offscreen owns persistence.
- Popup continues to read result data through the storage boundary.

Runtime messaging remains metadata-only. Binary artifact bytes are not passed through Chrome runtime messages.

# Messaging Contract
The runtime-facing contract was expanded only at the type level.

Current flow:

- split worker returns final artifact bytes to offscreen
- offscreen persists bundle and children
- popup reads result bytes from storage when it needs to download

No new binary transport path was added through runtime messaging.

# Legacy Compatibility Strategy
Compatibility strategy chosen: read legacy records and adapt them in memory.

Legacy behavior preserved:

- existing single-ZIP records remain readable
- legacy downloads still work
- legacy delete still works

The compatibility layer synthesizes:

- one bundle
- one ZIP artifact

from the legacy record on read.

# Single ZIP Adaptation
The current single-ZIP flow is now stored as:

- one parent `SplitResultBundle`
- one child ZIP `SplitArtifactRecord`

Current `writeSplitResult(...)` and `readSplitResult(...)` remain available as compatibility facades. They now route through the bundle/artifact storage model without changing popup behavior.

# Restore Semantics
Restore rules:

- pending bundles are not returned
- incomplete bundles are not returned
- complete bundles are returned
- legacy records are adapted as a complete single-ZIP bundle

This keeps popup reopen behavior stable while preventing partial artifacts from surfacing.

# Delete Semantics
Delete rules:

- bundle delete removes the parent and all child artifacts
- legacy delete still removes the legacy record
- artifact delete is idempotent and safe if a child is already missing
- deleting the current result also clears any stale legacy record with the same id

# Size Policy
No size-planning behavior changed in this slice.

Temporary policy:

- `single-zip`: keep current per-PDF-part semantics; ZIP size can exceed the configured per-part threshold.
- `individual-pdfs`: future limit applies to the final PDF part.
- `separate-zips`: future implementation should still start from PDF-part planning; ZIP-aware replanning is deferred.

# Tests
Added focused coverage for:

- canonical output-mode contract
- current runtime persisting single-zip only
- bundle/artifact persistence
- atomic visibility
- write failure rollback
- quota normalization
- pending restore filtering
- bundle delete and orphan cleanup
- legacy record read/adaptation/delete
- browser-like IndexedDB coverage for the legacy inline-key write path
- safe abort behavior so the original IndexedDB error is preserved during cleanup

Also fixed the existing `phase5_slice6a` helper so it supplies MuPDF loading the same way the other split tests do.

Validation run:

- `npm run check` PASS
- `npm run build` PASS
- Phase 5 test import loop PASS

# Manual Chrome Validation Required
Still required for the existing single-ZIP UX:

- reload the extension
- split the Canon 220-page PDF by pages
- verify one `Download ZIP archive` button
- download and reopen the ZIP
- close/reopen Popup
- verify restore still works
- reset/remove the result
- verify artifacts disappear

No new visible output-mode UI was introduced in this slice.

# Files Changed
Code:

- `src/lib/messaging.ts`
- `src/lib/storage/pdf-split-bundles-db.ts`
- `src/lib/storage/pdf-split-results-db.ts`

Tests:

- `tests/phase5_slice6a.test.ts`
- `tests/phase5_slice12_artifact_factory_foundation.test.ts`

Report:

- `reports/PHASE_5_ARTIFACT_FACTORY_SLICE_1_FOUNDATION_REPORT.md`

Package metadata:

- `package.json`
- `package-lock.json`

# Risks
- Bundle/artifact id alignment must stay strict as future output modes are added.
- Legacy fallback depends on the source PDF record being available when sourceFileName is reconstructed.
- The compatibility facade still assumes a single legacy ZIP artifact.
- Future output modes will need separate UI and download surfaces, but this slice does not expose them yet.

# Known Limitations
- Only `single-zip` is operational in the UI.
- Individual PDFs and separate ZIP-per-part are contract-only for now.
- Artifact-aware by-file-size replanning is deferred.
- The current popup still shows one download action and no artifact list.

# Acceptance Checklist
- [x] Canonical contracts added
- [x] Parent/child storage added
- [x] Atomic persistence added
- [x] Legacy single-ZIP compatibility preserved
- [x] Current popup behavior unchanged
- [x] Tests added and passing
- [x] `npm run check` passing
- [x] `npm run build` passing
- [x] Phase 5 suite passing

# Git
Branch: `feature/phase5-pdf-split`

Baseline: `c2527c4d504fe36d14d85e257c6741513b6acca9`

This slice is intended to be committed as one isolated foundation change.
