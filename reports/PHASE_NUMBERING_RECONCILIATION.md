# Phase Numbering and Documentation Reconciliation

## Outcome

Repository documentation now uses specification v3.3.0 stages as the only canonical numbered roadmap.

The historical Split label "Phase 5" is preserved as an alias for canonical Stage 6. Canonical Stage 5 JPEG2000 remains deferred, and canonical Stage 7 Freemium/licensing remains not started.

## Investigation Scope

Inspected:

- canonical specification and its phase plan
- frozen Phase 1 specification backup
- Phase 1 implementation plan
- repository `README.md`
- `AGENTS.md` workflow rules
- all files in `docs/`
- all reports in `reports/`
- local and remote branch names
- commit graph through `3310e72980abe7085c2ab7d9f897804c88ddca27`
- `origin/main` integration state
- Phase 4 and historical Phase 5 implementation lineage

## Proven Conflicts

### Canonical specification

- Stage 4: client-side compression
- Stage 5: JPEG2000 / OpenJPEG
- Stage 6: client-side splitting
- Stage 7: Freemium logic and licensing

### Repository execution history

- image recompression had one document incorrectly titled Phase 5 even though it was delivered and reported under Phase 4
- JPEG2000 was deferred
- Split was implemented under `feature/phase5-pdf-split`
- Split reports and tests inherited the `phase5` label
- `README.md` still described the repository as Phase 1 infrastructure
- the current-state report stopped at an obsolete commit and still described the resolved 10% browser hang as active
- `origin/main` contains only Stages 1-3, while the cumulative Split branch contains Stage 4 and canonical Stage 6 work

## Reconciliation Decision

The specification numbering wins.

Deferred stages are not removed and later stages are not shifted downward. Therefore:

- JPEG2000 remains canonical Stage 5 and is marked deferred
- Split is canonical Stage 6
- Freemium/licensing is canonical Stage 7
- historical `phase5` identifiers remain aliases for Stage 6 where renaming would rewrite history, churn tests, or require IndexedDB migration
- all new branches and documents must use canonical numbering

## Documentation Changes

- Added [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md) as the authoritative phase/status index.
- Updated `README.md` from stale Phase 1 status to cumulative repository status.
- Updated `AGENTS.md` so agents must resolve canonical numbering before creating a phase branch.
- Added an execution-mapping note to the canonical specification without changing product requirements.
- Reclassified `phase5_image_recompression_architecture.md` as canonical Stage 4 documentation.
- Replaced the stale Split current-state report with the completed browser-acceptance state.
- Added canonical Stage 6 notes to every historical `PHASE_5_*` report.
- Marked the Phase 1 backup and implementation plan as historical documents.
- Clarified that On-Premise Phase A-D labels are internal Stage 11 subphases.
- Marked the earlier canonical audit as a historical snapshot superseded for current browser/status claims.

## Integration Finding

At the time of reconciliation:

- `origin/main` = `5b429f2c64529b0dd0ac42b3ec5852ecc4f8920c` (Phase 3 merge)
- Stage 4 image recompression branch = `fdacf8e85f4cf9e2a075b6d4be7ab5e995c577cc`
- historical Phase 5 / canonical Stage 6 runtime-validated commit = `3310e72980abe7085c2ab7d9f897804c88ddca27`
- Stage 4 branch tips are ancestors of the current Split branch
- neither Stage 4 nor canonical Stage 6 is present in `origin/main`

This was the blocking condition at reconciliation time.

## Post-Reconciliation Integration Outcome

The required integration completed on 2026-07-14:

- Stage 4 merged through PR #4 at `109d5b48e7ab2c7d61d88903c2e763167bf7fdad`
- canonical Stage 6 merged through PR #5 at `0d5a91a32ac4d1cf2499d9015db8a1a5fc6d0610`
- the complete Stage 6 tip is an ancestor of the updated `origin/main`
- isolated merge validation, typecheck, production build, and Worker boundary checks passed

The integration-order blocker is resolved. Stage 7 remains subject to the product/security decisions below.

## Stage 7 Security Ambiguities

Documentation inspection also identified unresolved licensing decisions:

- the specification mentions a License Server and 90-day offline grace period
- MVP architecture rejects general server infrastructure
- the business model is a one-time $29 license rather than a subscription
- sample code embeds a symmetric JWT secret in the extension, which is unsuitable for production verification
- fingerprint binding is explicitly rejected for MVP, while fingerprint generation is still required for local daily counters

No licensing implementation should guess these decisions. They require an explicit product/security decision before the license-verification slice.

## Validation

- every `reports/PHASE_5*.md` file contains a canonical Stage 6 mapping note or historical-alias note
- stale `docs/phase5_image_recompression_architecture.md` removed
- canonical `docs/phase4_image_recompression_architecture.md` present
- `git diff --check` passes
- `npm run check` passes

## Specification Compliance

- Canonical phase numbering: **Fully matches specification**.
- Stage 4 image recompression classification: **Fully matches specification**.
- Stage 5 JPEG2000 status: **Partially matches specification** because the required feature remains deferred.
- Stage 6 Split mapping: **Fully matches specification**, with historical aliases retained and documented.
- Stage 7 status: **Fully matches specification as planned work**, but implementation has not started.
- Historical identifier retention: **Requires future specification update** only if physical renames are later demanded; current retention is an integration-safety decision, not a product behavior change.
