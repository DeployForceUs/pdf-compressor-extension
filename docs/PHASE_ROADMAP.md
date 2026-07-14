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
| 4 | Client-side compression | Implemented, including conservative image recompression; separate browser investigation remains for the reported disabled Compress button | `feature/phase4-pdf-compression`, `feature/phase4-image-recompression` | Merged into `main` via PR #4; merge commit `109d5b48e7ab2c7d61d88903c2e763167bf7fdad` |
| 5 | JPEG2000 / OpenJPEG | Preflight complete; runtime implementation pending architecture approval | `feature/phase5-jpeg2000-openjpeg` | MuPDF already proves the JPX decode boundary; approval is required to supersede the separate `openjpeg.js` implementation detail |
| 6 | Client-side PDF splitting | Implemented and manually accepted in Chrome across all three output modes | Historical alias: `feature/phase5-pdf-split`, `PHASE_5_*`, `phase5_*` tests, `pdf-compressor-phase5` storage name | Merged into `main` via PR #5; merge commit `0d5a91a32ac4d1cf2499d9015db8a1a5fc6d0610` |
| 7 | Freemium logic and licensing | Complete and browser-accepted | `feature/phase7-freemium-licensing` | Merged into `main` via PR #7; merge commit `c2aaf5589e22af50acf711b401d0bb175e65b217` |
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

## Integration Status After Stage 7

The required integration completed on 2026-07-14:

1. Stage 4 merged through PR #4 at `109d5b48e7ab2c7d61d88903c2e763167bf7fdad`.
2. Canonical Stage 6 Split merged through PR #5 at `0d5a91a32ac4d1cf2499d9015db8a1a5fc6d0610`.
3. An ancestry check confirmed the complete historical Phase 5 / canonical Stage 6 tip is contained in `origin/main`.
4. Isolated merge checks, TypeScript validation, production build, and the Worker runtime boundary guard passed before PR #5 was merged.
5. Canonical Stage 7 Freemium and licensing merged through PR #7 at `c2aaf5589e22af50acf711b401d0bb175e65b217` after browser acceptance.

The next canonical gap is Stage 5 JPEG2000. Its preflight is recorded in [`../reports/STAGE_5_JPEG2000_OPENJPEG_PREFLIGHT.md`](../reports/STAGE_5_JPEG2000_OPENJPEG_PREFLIGHT.md).

## Stage 7 Approved MVP Scope

The canonical Stage 7 scope is:

- Free daily limits: 3 compressions and 10 splits;
- client-side rate limiting: one operation per 10 seconds;
- device fingerprint generation for counters;
- Pro license verification using JWT expiry;
- localized license activation UI;
- before/after comparison and compression percentage;
- quality control and persistence in `chrome.storage.local`;
- PDF size limits informed by `navigator.deviceMemory`, with a 4 GB fallback.

The implementation resolved the specification inconsistencies as follows:

- no License Server or 90-day offline grace period in MVP;
- a one-time USD 29 perpetual Pro license;
- offline ES256 tokens verified with the public key embedded in the extension;
- the encrypted private key remains outside the repository;
- no fingerprint binding for licenses; fingerprinting is used only for local Free counters.

Browser acceptance, enforcement behavior, and validation are recorded in [`../reports/PHASE_7_PREFLIGHT_REPORT.md`](../reports/PHASE_7_PREFLIGHT_REPORT.md).

## Specification Compliance

- Canonical numbering: **Fully matches specification**.
- Historical alias retention: **Requires future specification update** only if the product wants repository identifiers renamed; no runtime rename is currently recommended.
- Stage 5: **Partially matches specification** because JPEG2000 remains a canonical MVP requirement and runtime implementation is pending; the proven MuPDF decoder path requires approval as a specification-level architecture update.
- Stage 6 Split: **Fully matches the implemented Split requirements**, with the historical Phase 5 naming discrepancy documented here.
- Stage 7: **Fully matches the approved MVP decisions and is merged into `main`**; the approved MVP uses offline ES256 perpetual tokens, local Free counters, persisted quality, and device-aware size limits.
