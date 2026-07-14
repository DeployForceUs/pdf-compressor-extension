# Canonical Phase Roadmap and Repository Status

## Purpose

This document is the repository's authoritative index for phase numbering and delivery status.

Product requirements remain authoritative in [`pdf_compressor_spec_v3.3.0.md`](./pdf_compressor_spec_v3.3.0.md). This index does not replace those requirements. It maps the canonical specification stages to the branch names, reports, and implementation history that actually exist in the repository.

## Numbering Rule

Use the stage numbers from specification v3.3.0 without collapsing or renumbering deferred work.

- A deferred stage keeps its original number.
- Later work keeps its canonical number even if an earlier stage was deferred.
- Historical branch names, report names, test names, and database names remain unchanged when renaming them would rewrite history or create runtime migration risk.
- Every historical alias must be mapped here to its canonical stage.

## Canonical Map

| Canonical stage | Specification scope | Repository status | Branch / historical alias | Integration status |
| --- | --- | --- | --- | --- |
| 1 | Base infrastructure | Complete | `feature/phase1-infrastructure` | Merged into `main` via PR #1 |
| 2 | Localization | Complete | `feature/phase2-localization` | Merged into `main` via PR #2 |
| 3 | PDF acquisition | Accepted delivery slice; URL/viewer/context-menu acquisition remains a documented spec gap | `feature/phase3-pdf-input` | Merged into `main` via PR #3 |
| 4 | Client-side compression | Implemented, including conservative image recompression; separate browser investigation remains for the reported disabled Compress button | `feature/phase4-pdf-compression`, `feature/phase4-image-recompression` | Not merged into `main`; both tips are ancestors of the current Split branch |
| 5 | JPEG2000 / OpenJPEG | Deferred and not implemented | No active implementation branch | Must remain Stage 5; it is not replaced by Split |
| 6 | Client-side PDF splitting | Implemented and manually accepted in Chrome across all three output modes | Historical alias: `feature/phase5-pdf-split`, `PHASE_5_*`, `phase5_*` tests, `pdf-compressor-phase5` storage name | Not merged into `main`; runtime-validated code commit `3310e72980abe7085c2ab7d9f897804c88ddca27` |
| 7 | Freemium logic and licensing | Not started | Future canonical branch: `feature/phase7-freemium-licensing` | Blocked until Stages 4 and 6 are integrated into `main` |
| 8 | UX and accessibility | Not started | None | Future work |
| 9 | Testing and debugging | Not started as a dedicated stage; earlier stages contain their own tests | None | Future work |
| 10 | Publication | Not started | None | Future work |
| 11 | Post-release and On-Premise preparation | On-Premise ideas documented only | `docs/TODO_ON_PREMISE_PRO_ENGINE.md` uses its own A-D subphases | Future work |

## Historical Phase 5 Alias

The repository's Split implementation was called "Phase 5" after the JPEG2000 stage was skipped in the execution sequence. That local renumbering conflicts with specification v3.3.0, where:

- Stage 5 is JPEG2000 / OpenJPEG;
- Stage 6 is client-side PDF splitting;
- Stage 7 is Freemium logic and licensing.

The following names are therefore historical aliases for canonical Stage 6:

- branch `feature/phase5-pdf-split`;
- files matching `reports/PHASE_5_*` when they describe Split delivery or stabilization;
- tests matching `tests/phase5_*`;
- the IndexedDB name `pdf-compressor-phase5`.

These identifiers are intentionally retained. Renaming tests adds churn without changing behavior, renaming the branch rewrites collaboration history, and renaming the database would require a storage migration. New documentation and future branches must use canonical numbering.

## Stage 6 Browser Acceptance

Manual Chrome acceptance completed on 2026-07-14 against commit `3310e72980abe7085c2ab7d9f897804c88ddca27`.

Confirmed:

- `single-zip` reaches 100%, persists, restores, and downloads;
- `individual-pdfs` reaches 100%, creates 11 artifacts for the Canon fixture, persists, restores, and downloads;
- `separate-zips` reaches 100%, creates 11 artifacts, persists, restores, and downloads;
- runtime tracing reaches Worker execution, artifact creation, persistence, result broadcast, and popup completion;
- the two fixture-dependent MuPDF/recompression tests pass when run against the local Canon fixture;
- the working tree was clean after validation.

Evidence:

- [`../reports/PHASE_5_BROWSER_RUNTIME_TRACE.md`](../reports/PHASE_5_BROWSER_RUNTIME_TRACE.md)
- [`../reports/PHASE_5_BROWSER_RUNTIME_FIX.md`](../reports/PHASE_5_BROWSER_RUNTIME_FIX.md)

## Integration Order Before Stage 7

`origin/main` currently ends at the Phase 3 merge (`5b429f2`). The current Split branch contains the Stage 4 and Stage 6 histories, but neither has been merged into `main`.

Required order:

1. Integrate and verify Stage 4 compression history.
2. Integrate and verify canonical Stage 6 Split history (historical Phase 5 alias).
3. Confirm `main` contains commit `3310e72980abe7085c2ab7d9f897804c88ddca27` or its reviewed merge equivalent.
4. Create `feature/phase7-freemium-licensing` from updated `main`.
5. Begin Stage 7 only after the preceding integration is complete.

## Stage 7 Scope and Open Product Decisions

The canonical Stage 7 scope is:

- Free daily limits: 3 compressions and 10 splits;
- client-side rate limiting: one operation per 10 seconds;
- device fingerprint generation for counters;
- Pro license verification using JWT expiry;
- localized license activation UI;
- before/after comparison and compression percentage;
- quality control and persistence in `chrome.storage.local`;
- PDF size limits informed by `navigator.deviceMemory`, with a 4 GB fallback.

Before license implementation, the following specification inconsistencies require explicit resolution:

- the architecture table mentions a License Server and a 90-day offline grace period;
- the MVP decisions reject general server infrastructure and define a one-time $29 license;
- the sample code embeds a symmetric JWT secret in the extension, which is not a safe production verification design;
- fingerprint binding is explicitly rejected for MVP in section 11.3, so fingerprinting applies to limit counters unless requirements are changed.

Do not invent these missing product/security decisions during implementation. Record the approved decision before building the license-verification slice.

## Specification Compliance

- Canonical numbering: **Fully matches specification**.
- Historical alias retention: **Requires future specification update** only if the product wants repository identifiers renamed; no runtime rename is currently recommended.
- Stage 5 deferral: **Partially matches specification** because JPEG2000 remains a canonical MVP requirement but is not implemented.
- Stage 6 Split: **Fully matches the implemented Split requirements**, with the historical Phase 5 naming discrepancy documented here.
- Stage 7: **Not implemented**; security and offline-validation ambiguities must be resolved before the licensing slice.
