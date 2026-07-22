# AI Lab Phase 0 Postbuild Inventory

Date: 2026-07-22
Branch baseline: `experiment/last-good-ai-build`
Baseline HEAD: `7299ecd7b20d0bfcbeb91da07d7659b85ba9fd53`
Status: frozen legacy inventory

## Purpose

This document freezes the legacy AI Lab postbuild execution surface before the clean source runtime rewrite begins.

No file listed below may receive new workflow behavior. During migration these files may only receive removal, disablement, compatibility shims, or test-only instrumentation approved by the source-runtime rewrite plan.

## Full `postbuild:ai` chain at baseline

1. `scripts/mark-ai-lab-build.mjs`
2. `scripts/apply-ai-lab-palette.mjs`
3. `scripts/force-ai-lab-english.mjs`
4. `scripts/apply-ai-lab-workflow-navigation.mjs`
5. `scripts/reset-ai-lab-selected-pdf.mjs`
6. `scripts/add-ai-lab-pdf-link.mjs`
7. `scripts/fix-ai-lab-pdf-link-input.mjs`
8. `scripts/fix-ai-lab-pdf-link-reinstall.mjs`
9. `scripts/fix-ai-lab-google-drive-permissions.mjs`
10. `scripts/apply-ai-lab-link-immediate-analysis.mjs`
11. `scripts/add-ai-lab-email-goal-flow.mjs`
12. `scripts/extend-ai-lab-goal-flows.mjs`
13. `scripts/fix-ai-lab-upload-stage-reset.mjs`
14. `scripts/add-ai-lab-orchestrator-debug.mjs`
15. `scripts/add-ai-lab-planner-runtime.mjs`
16. `scripts/apply-ai-lab-recommendation-presenter.mjs`
17. `scripts/apply-ai-lab-execution-router.mjs`
18. `scripts/style-ai-lab-download-action.mjs`
19. `scripts/apply-ai-lab-license-recovery.mjs`
20. `scripts/apply-ai-lab-office-connection-fallback.mjs`
21. `scripts/apply-ai-lab-target-size-workflow.mjs`
22. `scripts/fix-ai-lab-target-size-detection.mjs`
23. `scripts/fix-ai-lab-target-size-router-state.mjs`
24. `scripts/finalize-ai-lab-rendered-plan-fallback.mjs`
25. `scripts/apply-ai-lab-target-workflow-contract-runtime.mjs`

## Frozen execution-related owners

The following scripts currently touch Planner, workflow state, routing, persistence, completion, split, target-size decisions, or download behavior and are therefore frozen:

- `scripts/add-ai-lab-orchestrator-debug.mjs`
- `scripts/add-ai-lab-planner-runtime.mjs`
- `scripts/apply-ai-lab-link-immediate-analysis.mjs`
- `scripts/apply-ai-lab-recommendation-presenter.mjs`
- `scripts/apply-ai-lab-execution-router.mjs`
- `scripts/apply-ai-lab-license-recovery.mjs`
- `scripts/apply-ai-lab-office-connection-fallback.mjs`
- `scripts/apply-ai-lab-target-size-workflow.mjs`
- `scripts/fix-ai-lab-target-size-detection.mjs`
- `scripts/fix-ai-lab-target-size-router-state.mjs`
- `scripts/finalize-ai-lab-rendered-plan-fallback.mjs`
- `scripts/apply-ai-lab-target-workflow-contract-runtime.mjs`

Supporting legacy modules outside the postbuild chain are also frozen as migration references:

- `scripts/ai-lab-target-workflow-contract.mjs`
- `scripts/ai-lab-target-workflow-runtime-core.mjs`
- `scripts/apply-smart-planner-popup-ui.mjs`
- `scripts/apply-smart-planner-runtime-route.mjs`

## Ownership conflicts recorded at baseline

- Planner request and response handling are split across orchestrator, planner runtime, presenter, and fallback scripts.
- Compression completion is touched by the execution router, target-size workflow, target-size router-state fix, and target-workflow runtime patch.
- Target contract behavior exists in both source modules and generated runtime patches.
- Download visibility is influenced by execution routing, target-size handling, fallback rendering, and download styling.
- Runtime network defaults are embedded in generated scripts rather than owned by a source configuration boundary.

## Freeze rule

Until final source-runtime cutover:

1. No new execution-related postbuild script may be appended to `postbuild:ai`.
2. No frozen script may gain new business logic.
3. New workflow behavior must be implemented under `src/lib/ai-runtime/` or `src/entrypoints/popup/ai-lab/`.
4. Legacy scripts remain only to preserve the old implementation during side-by-side migration.
5. Removal from the legacy chain is allowed only after the equivalent source phase passes unit tests and Chrome acceptance.

The guard test in `tests/phase12_ai_postbuild_freeze.test.mjs` enforces the first rule.