# AI Lab Phase 8 — Real Chrome Acceptance Matrix

Source plan: `docs/plans/AI_LAB_SOURCE_RUNTIME_REWRITE_PLAN_2026-07-22.md`

Phase 8 is real-browser acceptance. Unit tests, reducer tests, and simulated adapters are prerequisites, not substitutes for this matrix.

## Build under test

- Branch: `experiment/last-good-ai-build`
- Implementation flag: `source-runtime`
- Build directory: `.output/chrome-mv3`
- Phase 8 status remains open until all nine cases have complete evidence and pass.

## Required evidence for every case

1. Coordinator state trace.
2. Source, compressed, part, and ZIP record IDs as applicable.
3. Contract target bytes and verified actual bytes.
4. Final UI screenshot.
5. Downloaded artifact validation, or explicit proof that no download was exposed.

Store structured evidence in `reports/ai-lab-phase8/evidence.json`. Store screenshots and downloaded-artifact reports under the same directory. Run `npm run verify:ai-runtime-chrome-evidence` after every update.

## Fixed matrix

### Case 1 — PDF terminal success

Small PDF, target above verified compressed size.

Expected:

- lifecycle reaches `completed_pdf`;
- `actualBytes <= targetBytes`;
- PDF download appears only in `completed_pdf`;
- downloaded PDF has `%PDF-` signature and recorded byte length.

### Case 2 — ZIP terminal success

Large PDF, target below verified compressed size.

Expected:

- lifecycle reaches `splitting` from the compressed artifact;
- every split part passes signature and size validation;
- ZIP creation starts only after all parts validate;
- lifecycle reaches `completed_zip` only after ZIP persistence;
- downloaded ZIP contains exactly the validated parts.

### Case 3 — Compression record mismatch

Inject or reproduce a mismatched compression result record.

Expected:

- explicit `failed` state;
- failure identifies compressed-result ownership/identity mismatch;
- no PDF or ZIP download.

### Case 4 — Oversized generated part

Produce a split part above the active contract target.

Expected:

- continued division when the adapter supports it, otherwise explicit terminal `split_part_oversized` failure;
- no ZIP exposure before all final parts validate;
- no invalid or partial ZIP download.

### Case 5 — Planner unavailable

Run with the configured Planner endpoint unavailable.

Expected:

- typed visible Planner fallback/failure;
- no hidden localhost substitution;
- no compression dispatch.

### Case 6 — Cancellation during compression

Cancel after compression dispatch and before compressed-result ownership completes.

Expected:

- lifecycle reaches `cancelled`;
- late compression result cannot change the terminal state;
- no download.

### Case 7 — Cancellation during split

Cancel after split dispatch and before split result acceptance.

Expected:

- lifecycle reaches `cancelled`;
- late split result cannot change the terminal state;
- no ZIP download.

### Case 8 — Popup close/reopen

Close and reopen the popup during an active execution.

Expected:

- coordinator ownership and active execution identity are restored or safely represented;
- no duplicate compression or split dispatch;
- UI is derived from the restored snapshot;
- terminal result, cancellation, or explicit failure remains deterministic.

### Case 9 — Repeated execution after reset

Finish or terminate one execution, reset, then run a second execution.

Expected:

- new `executionId`;
- no stale artifact IDs or capabilities from the previous run;
- exactly one dispatch per stage;
- second execution reaches its correct terminal state.

## Closure rule

Phase 8 may be marked accepted only when:

- all nine cases are `passed`;
- every case contains all five evidence classes;
- `npm run verify:ai-runtime-chrome-evidence` passes;
- the build under test is recorded by commit SHA and build marker;
- no case relies on hidden console mutation or generated execution-runtime ownership.
