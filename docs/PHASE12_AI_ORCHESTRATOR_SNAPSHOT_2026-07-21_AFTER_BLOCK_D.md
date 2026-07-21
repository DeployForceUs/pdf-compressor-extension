# Phase 12 AI Compute Orchestrator — Snapshot after Block D

Date: 2026-07-21
Repository: `DeployForceUs/pdf-compressor-extension`
Branch: `feature/phase12-ai-orchestrator`

## Current purpose

Competition-only AI Lab flow for privacy-first PDF processing. The commercial build remains separate.

AI Lab build output:

```text
.output/chrome-mv3-ai-lab
```

Stable commercial output:

```text
.output/chrome-mv3
```

## Canonical implementation plan

```text
docs/PHASE12_AI_COMPUTE_ORCHESTRATOR_IMPLEMENTATION_PLAN_2026-07-21.md
```

Architecture order:

```text
A. Contracts
B. Local capability collector
C. Office capabilities endpoint
D. Shared compute orchestrator without OpenAI
E. Real AI Planner
F. Recommendation screen
G. Execution router
H. Fixtures and acceptance matrix
```

## Product and architecture decisions that must not be changed

1. No Office Engine probe when the popup opens.
2. Office Engine capabilities are checked only after the user fully confirms a goal.
3. `GET /api/v1/capabilities` is read-only and never uploads or processes the PDF.
4. If Office Engine is unavailable, orchestration continues with local capabilities.
5. AI receives no PDF, filename, text, image, preview, OCR output, or document content.
6. AI receives only normalized privacy-safe structural metrics, the user goal, available compute capabilities, and the approved capacity catalog.
7. No Kamatera API integration and no automatic server resizing. The system recommends only.
8. Deterministic processing starts only after the recommendation and explicit user confirmation.
9. There is one common pipeline for all six goal cards. Cards only construct `UserGoal`.
10. No top-level fourth phase is added to the popup.
11. The popup dimensions and primary scroll behavior must not be changed.
12. Green is reserved for final successful Download; active workflow phase uses the blue gradient.

## Current visible workflow

```text
1 · Upload PDF
2 · Local Analysis
3 · Define Goal
```

All three phases remain visible. The central workspace is replaced rather than appended.

Goal flows:

```text
Send by email       -> 10 / 20 / 25 MB / Custom
Upload to portal    -> 10 / 20 / 50 MB / Custom
Print               -> Standard / High quality
Archive             -> Smaller file / Preserve quality
Reduce file size    -> Light / Balanced / Maximum
Something else      -> free text + Build plan
```

## Completed implementation

### Block A — contracts

Main contract:

```text
lib/ai-orchestrator/contracts.ts
```

Core types include:

```text
DocumentProfile
UserGoal
LocalCapabilities
OfficeCapabilities
CapacityProfile
ComputeSnapshot
PlannerRequest
PlannerResponse
```

### Block B — local capability collection

Implemented local runtime capability collection and preflight coverage.

### Block C — Office Engine capabilities endpoint

Implemented:

```text
GET /api/v1/capabilities
```

Confirmed manually with a ready response from the local Office Engine, including approximately:

```text
4 CPU cores
16 GB memory
Ghostscript 10.05.1
```

CORS was fixed so Chrome extension origins can read the response.

CORS fix commit:

```text
e4e8df9 fix: allow Chrome extension access to Office Engine
```

### Block D — common orchestrator without OpenAI

Implemented modules:

```text
src/lib/ai-orchestrator/office-capability-client.ts
src/lib/ai-orchestrator/capacity-catalog.ts
src/lib/ai-orchestrator/planner-request-builder.ts
src/lib/ai-orchestrator/compute-orchestrator.ts
src/lib/ai-orchestrator/compute-orchestrator-preflight.ts
src/lib/ai-orchestrator/document-profile-adapter.ts
```

Important commits:

```text
e63f625 feat: add Office Engine capability client
4d654ba feat: define approved compute capacity catalog
7afefae feat: add planner request builder
98876ea feat: assemble compute snapshot and planner request
4e36ca4 test: add compute orchestrator preflight
a6efd25 feat: add AI Lab orchestrator debug bridge
e c20ee6 build: apply AI Lab orchestrator debug bridge
```

Note: the commit above is `ec20ee6` without the space.

Document profile bridge commits:

```text
ae18d2a feat: adapt content-blind profile for AI orchestrator
ed2092e feat: bridge Local Analysis profile into orchestrator
```

## How the real DocumentProfile is obtained

The existing content-blind profiler is reused. The PDF is not analyzed a second time.

Existing path:

```text
ContentBlindPdfProfiler
-> SmartPlannerDocumentProfile
-> Phase 12 document-profile-adapter
-> __AI_LAB_DOCUMENT_PROFILE__
-> PlannerRequest
```

The debug bridge listens for the existing successful response to:

```text
background:smart-planner-prepare
```

It adapts and publishes only privacy-safe values:

```text
pageCount
fileSizeBytes
imageObjectCount
scannedRatio
textRatio
vectorRatio
complexitySignals
```

The saved profile is cleared when a new PDF is selected, preventing stale profile reuse.

## Manual runtime acceptance completed

Test PDF profile shown by UI:

```text
37 pages
0 image objects
Scanned 0%
Text 100%
Vector 0%
fileSizeBytes 1528924
```

DevTools confirmed:

```text
[AI Lab] Document profile bridged from Local Analysis
```

Then after:

```text
Continue to Define Goal
Send by email
20 MB
```

DevTools confirmed:

```text
[AI Lab] Compute orchestration debug email
```

and the resulting object contained:

```text
userGoal: {...}
computeSnapshot: {...}
plannerRequest: {...}
plannerRequestStatus: "ready"
```

This replaces the earlier temporary state:

```text
plannerRequest: null
plannerRequestStatus: "waiting_for_document_profile_adapter"
```

Therefore Block D is complete and runtime-verified.

## Build status at snapshot

The user ran successfully:

```bash
cd ~/pdf-compressor-extension || exit 1
git pull --ff-only
npm run check
npm run build:ai
```

Results:

```text
tsc --noEmit passed
WXT AI Lab build passed
postbuild scripts passed
AI Lab compute orchestrator debug bridge applied
```

The Vite chunk-size notice is only a warning and is not the current blocker.

## Current debug globals

Latest orchestration result:

```js
globalThis.__AI_LAB_LAST_ORCHESTRATION__
```

Bridged document profile:

```js
globalThis.__AI_LAB_DOCUMENT_PROFILE__
```

Expected current final status:

```text
plannerRequestStatus: "ready"
```

## Current Office Engine local command

```bash
ENGINE_WORK_ROOT="$PWD/.tmp/pdf-office-engine/jobs" npm run engine:start
```

Current local endpoint:

```text
http://127.0.0.1:8787/api/v1/capabilities
```

## Exact next task — Block E

Proceed strictly with Block E: real AI Planner.

Do not begin with UI changes.

Implementation order:

1. Define the exact server-side Planner request/response boundary using the existing Phase 12 `PlannerRequest` and `PlannerResponse` contracts.
2. Add a server-side OpenAI client. The API key must never be shipped in the Chrome extension.
3. Use the OpenAI Responses API with strict Structured Outputs.
4. Send only the existing privacy-safe `PlannerRequest`.
5. Add `PlannerResponseValidator` after the model response.
6. Validate at minimum:
   - route is allowed;
   - preset exists;
   - selected capacity exists in the approved catalog;
   - numeric ranges are non-negative and ordered;
   - Office route is not accepted when Office Engine is unavailable;
   - privacy rules remain satisfied.
7. Add deterministic fallback/error behavior. No processing job starts in Block E.
8. Add focused contract and preflight tests before connecting the recommendation UI.
9. Only after server-side request, strict response validation, and tests pass should the AI Lab runtime call be wired into the common orchestrator.

Expected Block E output before Block F:

```text
PlannerRequest ready
-> server-side Responses API call
-> strict structured PlannerResponse
-> deterministic validation
-> debug result available
```

No `Recommended Plan` UI redesign yet. No execution route yet.

## OpenAI structured response target

Conceptual response shape already approved by the plan:

```json
{
  "schemaVersion": "1",
  "recommendedRoute": "office_current",
  "recommendedPreset": "balanced",
  "currentLocalAssessment": "sufficient_but_slower",
  "currentOfficeAssessment": "recommended",
  "idealConfiguration": {
    "id": "medium",
    "cpuCores": 4,
    "memoryMb": 8192,
    "label": "4 vCPU · 8 GB RAM"
  },
  "oversizedConfiguration": {
    "id": "large",
    "cpuCores": 8,
    "memoryMb": 16384,
    "label": "8 vCPU · 16 GB RAM",
    "reason": "..."
  },
  "estimatedRuntime": {
    "local": { "min": 900, "max": 1300 },
    "officeCurrent": { "min": 360, "max": 540 }
  },
  "explanation": "...",
  "confidence": "medium"
}
```

The exact schema must be derived from the existing TypeScript contract rather than copied loosely from this example.

## Files that must remain separated

Competition-only runtime/build manipulation currently includes:

```text
scripts/add-ai-lab-orchestrator-debug.mjs
.output/chrome-mv3-ai-lab
```

Do not leak AI Lab-only behavior into the stable commercial build unless explicitly approved.

## Safe restart prompt for a new conversation

Use this message in a new chat:

```text
Continue the PDF Compressor Phase 12 AI Compute Orchestrator from:
docs/PHASE12_AI_ORCHESTRATOR_SNAPSHOT_2026-07-21_AFTER_BLOCK_D.md

Repository: DeployForceUs/pdf-compressor-extension
Branch: feature/phase12-ai-orchestrator

Block D is complete and manually verified in DevTools with plannerRequestStatus: "ready". Proceed strictly with Block E from the snapshot. Do not change UI and do not start deterministic PDF processing.
```
