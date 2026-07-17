# Stage 11 Processing Engine License Decision

Status: **BLOCKED — owner decision required**  
Branch: `feature/phase11-office-engine-buildweek-spike`  
Decision scope: Build Week Office Engine distribution, hosted evaluation, and the existing bundled MuPDF runtime

## Verified facts

1. The current Extension declares `mupdf@^1.28.0` and vendors the MuPDF JavaScript/WASM runtime into the production build.
2. The installed `mupdf@1.28.0` package declares `AGPL-3.0-or-later`.
3. Ghostscript is available from Artifex under AGPL or a commercial license.
4. Artifex states that an AGPL server-based application or service requires disclosure of the application source to interacting users; a commercial license is required when those terms cannot be met.
5. The Repository is currently public, but it has no root `LICENSE` and no `THIRD_PARTY_NOTICES` file.
6. The Build Week plan requires both a hosted judge path and a self-hosted Docker path. Shipping or hosting an Engine before the license path is resolved is prohibited by the approved addendum.

Primary references checked on 2026-07-17:

- Artifex licensing: https://artifex.com/licensing
- Ghostscript FAQ: https://ghostscript.com/faq/index.html
- Ghostscript releases and license choices: https://ghostscript.com/releases/gsdnld.html
- Installed package metadata: `node_modules/mupdf/package.json`

This record is an engineering release gate, not legal advice.

## Option A — AGPL-compliant contest distribution

Required owner decision:

- license the applicable project/server source under `AGPL-3.0-or-later`;
- add the complete AGPL license text and third-party notices;
- keep corresponding source available to all users who interact with the hosted evaluation service;
- document exact Ghostscript and MuPDF versions and source locations;
- preserve required copyright/license notices and any applicable PDF producer identification;
- ensure the Docker Image and hosted judge path point users to corresponding source.

Advantages:

- no Artifex commercial-license procurement dependency before the deadline;
- consistent with a public-source Build Week submission;
- permits the Docker and hosted evaluation path if the complete deployment is genuinely AGPL-compliant.

Trade-off:

- recipients receive the AGPL rights; proprietary distribution of the same dependency-integrated product requires a separate commercial-license or architecture decision.

## Option B — Artifex commercial license

Required owner action:

- obtain written commercial terms covering MuPDF/MuPDF.js and Ghostscript for the Extension, Docker distribution, hosted evaluation, and intended commercial deployment.

Advantages:

- permits proprietary distribution under the negotiated terms;
- avoids AGPL source-disclosure requirements for the licensed use case.

Trade-off:

- pricing, approval, and contract timing are unknown and cannot be assumed before the Build Week deadline.

## Option C — No distributable Office Engine for Build Week

Consequences:

- select Plan B from `OPENAI_BUILD_WEEK_EXECUTION_PLAN.md`;
- submit Smart Planner plus the existing deterministic Local Compression/Split path;
- do not publish or host the Ghostscript Office Engine;
- separately resolve the existing bundled MuPDF Extension licensing before public store distribution.

This avoids adding a new Ghostscript distribution risk but does not remove the existing MuPDF licensing gate.

## Required decision

No Docker Office Engine implementation, Image publication, hosted PDF-processing endpoint, or public-store build may be described as license-cleared until the owner selects and completes one of the paths above.

Recommended deadline path for an owner who accepts open-source distribution:

> Select Option A for the contest build, complete the AGPL/notice/source-offer package, and treat future proprietary distribution as a separate commercial-license decision.

If the owner does not approve AGPL distribution, select Option C immediately unless a commercial license is obtained in time.

## SPECIFICATION COMPLIANCE

- License gate enforcement: **Fully matches specification** and the approved Build Week addendum.
- AGPL contest path: **Requires owner approval and future specification update** before implementation.
- Commercial-license path: **Requires owner approval and executed external license** before implementation.
- Plan B fallback: **Fully matches the approved Build Week execution plan**.
