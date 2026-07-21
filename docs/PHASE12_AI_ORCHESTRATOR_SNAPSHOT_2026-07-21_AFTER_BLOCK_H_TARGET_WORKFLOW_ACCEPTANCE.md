# Phase 12 AI Compute Orchestrator — Snapshot after Block H target workflow acceptance

Date: 2026-07-21
Branch: `feature/phase12-ai-orchestrator`
Accepted implementation point: `11c006a`
Runtime revision: `C8`
Verifier revision: `H15-CONTRACT-C8`

## Status

The structured target-size workflow has passed real runtime acceptance on a heavy scanned PDF.

Accepted pipeline:

```text
User goal: Upload to portal, maximum 10 MB
→ Local structural analysis
→ Privacy-safe Planner request
→ AI recommendation: Current Office Engine / Balanced
→ User confirmation
→ Office Engine compression
→ Read actual compressed artifact size
→ Deterministic target-size decision
→ Direct IndexedDB handoff to selected-pdf
→ Local split by maximum size
→ Single ZIP output
→ Download split ZIP
```

## Real acceptance fixture

```text
Input size: approximately 157 MB
Pages: 220
Document type: scan-dominant
Image objects: 220
Image characteristics: JPX-heavy
Delivery target: portal upload, maximum 10 MB per PDF
Recommended route: Current Office Engine
Recommended preset: Balanced
Office configuration: 4 vCPU · 16 GB RAM
```

Observed result:

```text
Final action: Download split ZIP
Generated PDF parts: 17
Page order: sequential and complete
First part: pages 1–14
Last part: pages 217–220
Typical displayed size: 9.3–9.9 MB
Final part displayed size: 2.6 MB
```

Finder displayed one part as `10 MB`; Finder rounds displayed sizes. A byte-level check may be retained as optional evidence, but the splitter used a 95% safety boundary derived from the 10 MB contract.

## Runtime events accepted

```text
validating_target_size
split_started
split_complete
Download split ZIP
```

## Contract behavior accepted

The Planner response must contain:

```text
processingPlan.split.enabled = true
processingPlan.split.strategy = by-max-size
processingPlan.split.targetPartSizeMb > 0
processingPlan.split.outputMode = single-zip
```

Completion rule:

```text
non-original result <= target
→ complete as PDF

original result, or result > target
→ split locally into a single ZIP
```

Split request:

```json
{
  "type": "split:local",
  "strategy": {
    "type": "by-max-size",
    "maxPartSizeBytes": "floor(targetBytes * 0.95)"
  },
  "outputMode": "single-zip",
  "compressAfter": false
}
```

## Critical implementation decisions

### Retained structured contract

The target workflow uses a validated retained contract from `processingPlan.split`. Button text, rendered-plan text, and inferred target values are not execution sources.

### Schema dependency binding

`TARGET_WORKFLOW_SCHEMA_VERSION` is embedded with the serialized contract functions in the generated ExecutionRouter.

### Binary handoff

Large PDF bytes are not sent through `runtime.sendMessage`.

Office compression result source:

```text
IndexedDB database: pdf-compressor-phase4
Store: compression-results
Record: compressed-pdf
```

Splitter input destination:

```text
IndexedDB database: pdf-compressor-phase1
Version: 2
Store: binary-records
Record: selected-pdf
```

The Router writes the selected PDF directly to IndexedDB and sends only the small `split:local` control request through extension messaging.

## Regression guardrails

The generated build verifier must continue to prove:

```text
Planner split normalization
Presenter target-size binding
Canonical Router lifecycle integration
Schema dependency binding
Validated contract activation
Target size derived from contract
No active dataset/text inference execution source
Completion uses retained contract
Deterministic complete-or-split boundary
Direct IndexedDB PDF handoff
No binary PDF payload through runtime messaging
Local by-max-size split
Single ZIP output
Office host permission
Contest access artifact
```

## Block H acceptance matrix

```text
H1 Heavy scanned PDF + Office available     PASS
H2 Light text PDF + local route             TODO
H3 Medium mixed PDF                         TODO
H4 Office unavailable → local fallback      TODO
H5 Planner timeout                          TODO
H6 Malformed Planner response               TODO
```

The heavy scanned scenario is the highest-load target-size path and is accepted. Block H as a whole remains open until the remaining regression rows are exercised.

## Clean verification commands

```bash
cd ~/pdf-compressor-extension || exit 1

git checkout feature/phase12-ai-orchestrator
git pull --ff-only origin feature/phase12-ai-orchestrator

npm run check
npm run build:ai
node scripts/apply-ai-lab-local-contest-access.mjs
npm run verify:ai
```

Expected revision markers:

```text
AI Lab structured target workflow contract runtime C8 applied
AI Lab target-size workflow revision: H15-CONTRACT-C8
AI Lab build verification complete
```

## Next exact test

Run the light text PDF fixture and verify the local route:

```text
Planner recommends local
→ Process locally
→ compression completes
→ Download processed PDF
```

This test must not enter target-size splitting unless the selected user goal explicitly includes a delivery-size limit.

## Do not regress

- Do not pass PDF byte arrays through `runtime.sendMessage`.
- Do not restore target inference from button datasets or rendered text.
- Do not clear the retained target contract before delayed Office completion.
- Do not call the Office Engine or AI Planner when the popup merely opens.
- Do not allow AI to initiate processing without explicit user confirmation.
