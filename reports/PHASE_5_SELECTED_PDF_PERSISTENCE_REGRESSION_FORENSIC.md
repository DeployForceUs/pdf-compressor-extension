# Summary

> **Canonical numbering:** This historical Phase 5 Split report belongs to specification Stage 6. See [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md).
The selected PDF persistence failure is caused by an incorrect IndexedDB write in `src/lib/storage/pdf-records-db.ts`.

`writePdfRecord()` writes to an inline-key object store (`keyPath: "id"`) but still passes an explicit key argument:

```ts
await db.put(STORE_NAME, stored, stored.id);
```

In a browser-compatible IndexedDB backend this throws `DataError`. The popup then proceeds to read `selected-pdf`, gets `null`, and throws:

`Local PDF record was not returned after persistence (recordId=selected-pdf)`

This is not a split regression, not a version conflict, and not caused by the Artifact Factory storage changes.

# Fix Implemented
The selected PDF persistence path now writes the inline-key IndexedDB record correctly:

```ts
await db.put(STORE_NAME, stored);
```

The popup selection flow also stops immediately if `pdf:store` returns an error response. It no longer continues into `pdf:read` after a storage failure, so the original normalized storage error remains the one the user sees.

The memory fallback in `src/lib/storage/pdf-records-db.ts` now resolves the key from `value.id` when no explicit key is passed, which keeps the Node test path aligned with the inline-key IndexedDB contract.

# Manual Chrome Evidence
Observed after extension reload and selecting a valid PDF:

- `Local PDF record was not returned after persistence (recordId=selected-pdf)`
- Split strategy controls are absent
- `Split PDF` is disabled
- Compression stays idle

That matches a failed selected-PDF persistence step before Split UI initialization completes.

# Reproduction
Browser-like IndexedDB repro using `fake-indexeddb`:

Fresh database:

- `writePdfRecord(selected-pdf)` throws `DataError`
- message: `Data provided to an operation does not meet requirements.`
- immediate read returns `null`

Existing database:

- pre-created `pdf-compressor-phase1` database with `binary-records` store
- same `DataError`
- read after failure returns `null`

Correct inline-key write probe in the same backend:

- `db.put("binary-records", record)` succeeds
- record can be read back immediately

# Persistence Flow
Popup selection flow:

1. File picker validates the PDF.
2. Popup sends `pdf:store` to offscreen.
3. Offscreen calls `writePdfRecord()` in `src/lib/storage/pdf-records-db.ts`.
4. `writePdfRecord()` opens `pdf-compressor-phase1` version `2`.
5. `db.put(STORE_NAME, stored, stored.id)` throws `DataError`.
6. Offscreen catches and returns an error response.
7. Popup still sends `pdf:read`.
8. `readPdfRecord("selected-pdf")` returns `null`.
9. Popup throws the displayed error and never sets `pdf.status = "ready"`.

# Database and Store Inventory
Selected PDF persistence uses:

- database: `pdf-compressor-phase1`
- store: `binary-records`
- schema: inline keyPath `id`

Split artifact persistence uses a different database:

- database: `pdf-compressor-phase5`
- stores: `split-results`, `split-result-bundles`, `split-artifacts`

The two databases are separate. The Phase 5 artifact-factory changes did not alter the selected-PDF store schema or database name.

# Root Cause
Exact failing function:

- `writePdfRecord()` in `src/lib/storage/pdf-records-db.ts`

Exact bad line:

- `await db.put(STORE_NAME, stored, stored.id);`

Exact exception in browser-compatible IndexedDB:

- class: `DataError`
- message: `Data provided to an operation does not meet requirements.`

This is a misuse of IndexedDB keyPath semantics. For an inline-key store, the value should be written without passing a separate key argument.

There is no evidence of:

- database version mismatch
- schema conflict with `pdf-compressor-phase5`
- fake-indexeddb leakage into production bundling
- swallowed write exception inside the store module

# First Bad Boundary
The bug originates in:

- `4fe6c7e0557b26fbe5c7b338281c3bdab06733fd`

Evidence:

- `src/lib/storage/pdf-records-db.ts` was introduced in that commit
- the bad `db.put(STORE_NAME, stored, stored.id)` call is present there
- the file does not exist in the parent commit

The later commit `4d0dc08d821e12886506f775735a360df20191e2` did not change the selected-PDF persistence path.

# Why Split UI Disappears
The Split UI is gated on the selected PDF reaching `status: "ready"` and `selected: true`.

Relevant popup checks:

- `splitControlsDisabled = sharedBusy || pdf.status !== "ready" || !pdf.selected`
- the Split card strategy controls and inputs are disabled under the same guard

Because readback returns `null`, the success path that calls `setPdf({ status: "ready", selected: true, ... })` never runs. The popup remains in the idle/error selection state, so the Split controls never appear.

# Fresh Database Result
Fresh `pdf-compressor-phase1` database:

- write fails with `DataError`
- immediate read returns `null`

The failure happens before any persistence state can be established, so a fresh database does not help.

# Existing Database Upgrade Result
Pre-existing `pdf-compressor-phase1` database with `binary-records` store:

- same `DataError`
- read after failure returns `null`

This proves the problem is not a version upgrade conflict or stale store layout.

# Proposed Narrow Fix
Change the write call in `src/lib/storage/pdf-records-db.ts` to inline-key form:

```ts
await db.put(STORE_NAME, stored);
```

That is the minimal correction needed for this regression.

# IndexedDB Write Audit
Audited writes in `src/lib/storage/pdf-records-db.ts`:

- `writePdfRecord()` now uses inline-key form with no explicit key argument
- `readPdfRecord()` remains a simple keyed read
- `deletePdfRecord()` remains a keyed delete

No other selected-PDF persistence helper was broadened. Split storage and Artifact Factory code were not changed for this fix.

The related popup selection flow now uses a small helper in `src/entrypoints/popup/selected-pdf-persistence.ts` so the store/read sequence is explicit and the error path stops after a failed store response.

# Regression Tests Required
Required coverage after the fix:

- browser-like IndexedDB write/read/delete for `selected-pdf`
- immediate readback after write
- reopen/readback after reconnect
- existing database and fresh database paths
- `DataError` no longer thrown for valid selected PDFs
- Split UI remains gated on successful selected-PDF persistence

# Regression Tests
Added coverage in `tests/phase5_selected_pdf_persistence.test.ts` for:

- fresh database write succeeds
- immediate read returns the record
- filename matches
- byte length matches
- page count survives
- close/reopen read succeeds
- existing pre-created database write/read succeeds
- delete succeeds
- deleted record is no longer returned
- valid write no longer throws `DataError`
- failed `pdf:store` response does not continue into `pdf:read`
- original storage error remains visible

Existing coverage also continues to pass for:

- Artifact Factory foundation
- Split UI metadata
- passwordless encrypted PDF support
- split planning, packaging, and stabilization

# Manual Chrome Validation Required
After this fix, manual Chrome validation is still required:

1. Reload the extension.
2. Select a valid PDF.
3. Confirm the popup shows `Ready`.
4. Confirm `Pages` displays correctly.
5. Confirm `By pages`, `By file size`, and `Manual selection` are visible.
6. Confirm `Split PDF` is enabled.
7. Run one single-ZIP Split.
8. Download and open the ZIP.
9. Close and reopen the popup.
10. Confirm the selected PDF and Split result restore correctly.
11. Remove/reset the result.
12. Reopen the popup and confirm the stale result is gone.

# Files Inspected
- `src/lib/storage/pdf-records-db.ts`
- `src/lib/offscreen/main.ts`
- `src/entrypoints/popup/main.tsx`
- `src/lib/messaging.ts`
- `src/lib/storage/pdf-split-bundles-db.ts`
- `src/lib/pdf-records.ts`
- `tests/phase5_slice12_artifact_factory_foundation.test.ts`
- `tests/phase5_selected_pdf_persistence.test.ts`
- `package.json`
- `package-lock.json`

# Risks
- Existing users with a broken selected-PDF record will need a successful rewrite after the fix.
- The popup currently reports the readback failure message instead of surfacing the original `DataError`.
- The bug is easy to reintroduce if inline-key IndexedDB writes are repeated elsewhere.

# Decision
FIX_READY

# Git
The fix is committed on `feature/phase5-pdf-split` and pushed to `origin`.
