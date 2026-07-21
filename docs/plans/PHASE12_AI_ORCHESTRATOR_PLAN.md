# Phase 12 — AI Orchestrator Branch Plan

## Status

- Branch: `feature/phase12-ai-orchestrator`
- Base branch: `feature/phase11-content-blind-profiler-runtime`
- Starting point: the current working Phase 11 product, including local PDF profiling, Office Engine capability detection, local hardware detection, local buffer benchmark, Smart Planner preview, large scanned PDF routing, and large-file storage fixes.
- Branch strategy: light experimental fork. Phase 11 remains the stable reference build and is not modified by Phase 12 work.

## Why this branch exists

The current Smart Planner can analyze structural metrics and return a valid recommendation, but the AI contribution is still easy to perceive as a thin recommendation layer over deterministic rules.

Phase 12 changes the product story from:

> AI recommends a preset.

into:

> AI understands the user’s delivery goal, asks for missing constraints, builds a safe processing strategy, compares execution options, explains trade-offs, and can adapt the plan after real execution feedback.

The intended competition narrative is:

> The AI does not process the document. It designs and adapts the processing strategy using privacy-safe document signals, user intent, local capability, Office Engine capability, and real execution feedback.

## Non-negotiable safety boundary

Phase 12 must preserve all working Phase 11 behavior until each new phase is accepted.

The AI may propose and explain actions, but execution remains constrained by deterministic guardrails:

- no processing starts without explicit user confirmation;
- no visual content leaves the device unless the user explicitly enables preview analysis;
- model output must pass a strict schema;
- numeric quality, DPI, split, retry, entitlement, engine availability, and file-size policies remain validated locally;
- AI cannot bypass Office entitlement, runtime health, storage limits, or privacy settings;
- the current Phase 11 routing remains the fallback whenever orchestration is unavailable or invalid.

## Branch and build separation

### Stable build

- Branch: `feature/phase11-content-blind-profiler-runtime`
- Purpose: stable working reference and fallback.
- Output identity: existing extension name and existing build path.

### AI Orchestrator build

- Branch: `feature/phase12-ai-orchestrator`
- Purpose: interactive AI planning and orchestration experiments.
- Planned identity: `PDF Compressor AI Lab` during development.
- Planned output path: separate from the stable build, for example `.output/chrome-mv3-ai`.
- Planned storage namespace: separate Phase 12 keys for interview state, consent state, orchestration plans, and execution feedback.

The two builds should be loadable independently in Chrome so the stable version can always be demonstrated even if the experimental branch is incomplete.

## Product flow

The target user flow is:

1. User selects a PDF.
2. Local structural profiling runs.
3. Local runtime and Office Engine capability are detected.
4. AI asks what the user is trying to achieve.
5. User answers with quick controls plus an optional free-text note.
6. AI summarizes the task in plain language.
7. User confirms or edits the summary.
8. User chooses privacy mode:
   - Private Mode: no visual previews;
   - Enhanced Mode: selected low-resolution previews, only after explicit consent.
9. AI produces a multi-step processing plan with alternatives, estimates, and reasoning.
10. User explicitly confirms execution.
11. Deterministic engine executes the approved plan.
12. Actual metrics are collected.
13. AI may recommend a safe second pass when the first result misses the goal.

## Core interaction model

The interface should be hybrid, not a blank chat box and not a rigid form.

### Quick controls

#### Intended use

- Email
- Upload portal
- Print
- Archive
- Mobile sharing
- Other

#### Delivery limit

- 10 MB
- 20 MB
- 25 MB
- Custom
- No fixed limit

#### Priority

- Preserve quality
- Balanced
- Smallest file
- Fastest result

#### File handling

- Splitting allowed
- Single file required

#### Readability requirement

- General readability
- Small text must remain readable
- Print-quality text required
- Images are more important than text

#### Privacy mode

- Private Mode — structural metrics only
- Enhanced Mode — allow selected low-resolution page previews

### Free-text field

Prompt:

> Anything else the AI should know?

Examples:

- `The court portal accepts one file only.`
- `Small text and stamps must remain readable.`
- `This will only be viewed on phones.`
- `I need the smallest possible email attachment.`

### AI task summary

Before planning, the AI should restate the task, for example:

> You need this 150 MB scanned PDF reduced below 20 MB for email while keeping small text printable. Splitting is allowed. Visual previews are disabled.

The user must be able to confirm or edit this summary.

## Privacy modes

### Mode A — Private Mode / No Preview

Default mode.

AI receives only content-blind signals such as:

- file size;
- page count;
- image object count;
- scanned/text/vector ratios;
- DPI buckets;
- codec counts;
- page-size distribution;
- local hardware capability;
- local benchmark result;
- Office Engine capability;
- user goal and constraints.

No filename, text, page image, thumbnail, or PDF content is sent.

### Mode B — Enhanced Mode / Preview with consent

Optional mode, disabled by default.

Requirements:

- explicit consent control;
- clear disclosure before any preview generation or upload;
- only a small representative sample, initially 3–5 pages;
- low-resolution raster previews;
- no hidden OCR upload path;
- no full PDF upload;
- user can disable the mode at any time;
- preview metadata must record which pages were selected and why.

The visual model may classify relevant content patterns such as:

- dense small text;
- forms and tables;
- photographs;
- engineering drawings;
- stamps and signatures;
- uneven scan quality;
- mixed page types.

The visual result must be converted into bounded planning signals rather than unrestricted execution instructions.

## AI Orchestrator responsibilities

The orchestrator should:

- understand the user’s real delivery objective;
- identify missing constraints and ask only necessary follow-up questions;
- summarize the task for confirmation;
- compare Local Engine and Office Engine;
- generate one recommended strategy and optional alternatives;
- define an ordered sequence of processing steps;
- estimate output size range, runtime range, memory risk, and likely retry risk;
- explain trade-offs in plain language;
- adapt the plan after real execution feedback;
- preserve a human-readable audit trail.

The orchestrator should not:

- directly execute arbitrary commands;
- change entitlement;
- override engine health checks;
- invent unsupported presets;
- bypass validation;
- claim precise output size or runtime without calibration;
- upload visual previews without explicit consent.

## Processing plan model

The Phase 11 single-plan contract should evolve into a bounded orchestration plan.

Illustrative structure:

```ts
type OrchestrationPlan = {
  schemaVersion: 1;
  taskSummary: string;
  recommendedScenarioId: string;
  scenarios: Array<{
    id: string;
    label: "recommended" | "fastest" | "smallest" | "safest";
    engine: "local" | "office";
    estimatedOutputSizeMb: { min: number; max: number } | null;
    estimatedDurationSeconds: { min: number; max: number } | null;
    memoryRisk: "low" | "medium" | "high" | "unknown";
    rationale: string;
    steps: Array<{
      id: string;
      operation: "compress" | "recompress-images" | "split" | "validate" | "measure";
      preset: "balanced";
      quality?: number;
      dpi?: number;
      targetPartSizeMb?: number;
      dependsOn: string[];
    }>;
  }>;
  requiresUserConfirmation: true;
};
```

This is illustrative only. The final schema must use existing engine capabilities and remain narrow enough for strict validation.

## Adaptive feedback loop

The competition-grade flow should support:

```text
Analyze → Clarify → Plan → Confirm → Execute → Measure → Re-plan
```

Execution feedback should include only operational metrics:

- input size;
- output size;
- achieved compression ratio;
- duration;
- engine used;
- peak or failure memory signal when available;
- validation result;
- number and sizes of split parts;
- error category;
- whether the delivery target was met.

Example:

- target: under 20 MB;
- first result: 27 MB;
- validation: passed;
- AI response: recommend one additional bounded pass at lower image quality or propose splitting, depending on the user’s single-file constraint.

The second plan must still pass local deterministic validation and require explicit confirmation.

## Universal local capability strategy

No routing decision may be based on one machine’s absolute benchmark result.

The universal approach should combine:

- local logical CPU count;
- total memory;
- currently available memory;
- local calibrated buffer throughput;
- document size and structure;
- Office Engine effective CPU and memory;
- Office Engine availability and limits;
- prior execution evidence when available.

The initial benchmark is a generic local runtime signal, not a direct PDF speed prediction. It should be treated as one bounded feature until correlated with real PDF execution times.

Future calibration can derive per-device evidence such as:

- seconds per scanned page for representative operations;
- MB processed per second for image-heavy documents;
- memory pressure observed by file-size band;
- confidence score based on number of completed jobs.

## Phase breakdown

### Phase 12.0 — Branch isolation and documentation

Goal: establish a safe fork without changing runtime behavior.

Deliverables:

- create `feature/phase12-ai-orchestrator` from the accepted Phase 11 head;
- add this plan;
- define stable and experimental build identities;
- document switching and recovery commands;
- verify Phase 11 remains untouched.

Acceptance:

- Phase 11 branch still builds independently;
- Phase 12 starts from the same accepted baseline;
- no runtime behavior changed yet.

### Phase 12.1 — Separate AI Lab build

Goal: make the experimental branch visually and operationally distinct.

Deliverables:

- experimental extension name;
- separate build output directory;
- visible build label such as `AI Orchestrator Preview`;
- separate Phase 12 storage keys;
- documented load path for Chrome.

Acceptance:

- stable and AI Lab builds can be loaded independently;
- settings and temporary orchestration state do not collide;
- each build clearly identifies itself.

### Phase 12.2 — Task interview UI

Goal: let the user explain the real objective.

Deliverables:

- quick controls for use case, limit, priority, splitting, readability, and privacy mode;
- optional free-text field;
- local draft persistence;
- no AI execution yet beyond task interpretation.

Acceptance:

- the user can describe the common email/upload/print/archive cases in under 20 seconds;
- custom constraints can be entered freely;
- no PDF content is sent.

### Phase 12.3 — AI clarification and task summary

Goal: make the AI contribution visible before plan generation.

Deliverables:

- Structured Output contract for normalized user intent;
- AI may ask at most 1–3 relevant follow-up questions;
- AI-generated task summary;
- confirm/edit interaction;
- fallback deterministic summary when gateway is unavailable.

Acceptance:

- AI identifies missing delivery constraints instead of silently assuming them;
- summary accurately reflects selected controls and free text;
- user confirmation is required before planning.

### Phase 12.4 — Two privacy modes

Goal: preserve privacy-first behavior while enabling richer reasoning by consent.

Deliverables:

- Private Mode as default;
- explicit Enhanced Mode consent;
- representative page selection logic;
- low-resolution preview generation;
- clear preview disclosure and cancel path;
- bounded visual classification schema.

Acceptance:

- no preview is generated or transmitted without consent;
- selected previews contain no filename metadata;
- turning Enhanced Mode off returns to metrics-only behavior;
- visual classifications are visible in the audit trail.

### Phase 12.5 — Multi-scenario orchestration plan

Goal: replace the single recommendation card with a richer AI plan.

Deliverables:

- recommended scenario;
- fastest, smallest, or safest alternatives when meaningful;
- ordered processing steps;
- estimated size/runtime ranges with confidence labels;
- plain-language trade-offs;
- strict schema and local validation.

Acceptance:

- AI output is more than a preset choice;
- every proposed operation maps to an implemented engine capability;
- invalid or unsupported steps are blocked;
- no execution occurs from model output alone.

### Phase 12.6 — Confirmed execution bridge

Goal: connect an approved plan to the existing processing pipeline.

Deliverables:

- explicit `Confirm and run` action;
- translation from validated plan steps to existing runtime messages;
- progress display by step;
- cancellation behavior;
- deterministic validation after output creation.

Acceptance:

- the current working pipeline remains the executor;
- AI never receives direct execution authority;
- cancellation and errors leave the source PDF intact;
- output can be reopened and validated.

### Phase 12.7 — Execution feedback and adaptive re-plan

Goal: demonstrate a closed-loop AI orchestrator.

Deliverables:

- collect operational result metrics;
- compare actual result with user goal;
- AI follow-up recommendation when the goal is missed;
- bounded second-pass plan;
- explicit second confirmation.

Acceptance:

- a missed target produces an evidence-based next step;
- successful target completion does not trigger unnecessary re-processing;
- second-pass limits prevent loops;
- audit trail records original plan, result, and revised plan.

### Phase 12.8 — Competition demo polish

Goal: make the AI value obvious to judges within a short demo.

Recommended demo story:

1. Load a large scanned PDF.
2. Show local-only structural analysis.
3. Tell AI: email, under 20 MB, small text readable, splitting allowed.
4. Show AI task summary.
5. Demonstrate Private Mode.
6. Optionally enable visual previews and show the explicit consent boundary.
7. Show recommended, fastest, and smallest scenarios.
8. Confirm the recommended plan.
9. Show execution metrics.
10. Simulate or demonstrate a missed target and AI re-plan.

Acceptance:

- the AI contribution is understandable without reading source code;
- privacy choice is visually obvious;
- model reasoning is grounded in real document/runtime signals;
- the demo works even if Enhanced Mode is skipped;
- stable Phase 11 build remains available as backup.

## Competition positioning

The strongest positioning is not:

> We added AI to a PDF compressor.

It is:

> We built a privacy-first AI orchestrator for document processing. It understands the user’s delivery constraints, reasons over content-blind document structure and runtime capability, optionally inspects consented low-resolution previews, constructs a safe execution strategy, and adapts from real results.

Key judging signals:

- meaningful AI interaction;
- clear model contribution;
- structured outputs;
- privacy-by-default design;
- explicit consent for visual reasoning;
- deterministic safety guardrails;
- actual tool execution;
- adaptive feedback loop;
- user-visible reasoning and audit trail.

## Codex mention

Codex should be mentioned later in the competition submission or engineering story, not used as the central product claim.

Potential wording:

> Codex was used to accelerate implementation, review integration points, and validate the orchestration contracts, while the runtime product itself uses the OpenAI API for user-intent clarification, visual reasoning by consent, structured planning, and adaptive re-planning.

The runtime AI behavior must remain the primary competition feature.

## Testing strategy

Each phase should add focused tests before execution authority expands.

Minimum coverage:

- task-intent schema validation;
- consent defaults and transitions;
- no-preview data boundary;
- preview sample count and dimensions;
- orchestration-plan schema validation;
- unsupported operation rejection;
- engine availability enforcement;
- entitlement enforcement;
- single-file versus split constraint enforcement;
- second-pass loop limit;
- stable fallback when AI is unavailable;
- audit trail completeness.

Manual acceptance should use at least:

- small text PDF;
- large scanned PDF;
- mixed text/image PDF;
- one-file-only goal;
- split-allowed goal;
- Office available;
- Office unavailable;
- Enhanced Mode on;
- Enhanced Mode off.

## Stop conditions

Phase 12 work must stop and revert to the last accepted phase when:

- Phase 11 processing behavior regresses;
- the model can propose unsupported operations;
- preview content is generated without explicit consent;
- stable and experimental storage collide;
- AI output can trigger execution without confirmation;
- re-planning can loop indefinitely;
- the competition demo depends on an unreliable nonessential feature.

## Immediate next step

Begin only with Phase 12.1:

1. create the separate AI Lab build identity;
2. create a separate output folder;
3. confirm both Phase 11 and Phase 12 builds can be loaded independently;
4. do not yet change Smart Planner routing or execution behavior.

Only after that acceptance should Phase 12.2 task interview UI begin.
