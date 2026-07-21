# Phase 12 — Visual Direction and Explainable AI UX Addendum

## Why this matters

The current Phase 12 concept is strong functionally, but the AI layer can still look too hidden and too procedural for a demo or judging context.

To make the AI contribution more visible, the orchestrator should not only return a recommendation, but also explain the reasoning path through a compact, visually clear interaction model.

This addendum adds:

1. a **visual direction** for the AI Orchestrator experience;
2. an **explainable workflow layer**;
3. an optional **preview-aware mode**;
4. a reusable **SVG workflow asset** for docs, pitch, and UI support.

## Visual direction

Use a polished, high-contrast, dark premium look inspired by the approved reference aesthetic.

### Style goals

- dark navy / near-black background;
- luminous blue accents;
- soft glow around key metrics and active states;
- large, elegant numbers and concise labels;
- minimal clutter;
- “AI is thinking” should feel premium, not technical or noisy.

### Primary UI intent

The user should feel:

- upload is simple;
- AI is assisting;
- recommendation is reasoned;
- next action is obvious.

## New UX principle: minimal start, guided intelligence after upload

Phase 12 should keep the initial upload surface extremely simple.

### Recommended flow

1. User uploads PDF.
2. System shows only essential file facts.
3. Local structural analysis starts automatically; no extra Analyze button is required unless implementation constraints later justify it.
4. AI Orchestrator asks for the task in a lightweight guided way.
5. AI returns:
   - detected document profile;
   - recommended execution path;
   - rationale;
   - expected trade-offs;
   - optional follow-up questions only if needed.

This avoids overwhelming the user before the file exists, while still making the AI interaction visible and meaningful.

## Dual AI modes

Support two modes in Phase 12 planning.

### Mode A — Privacy-first / No Preview

Used by default.

AI receives:

- content-blind structural metrics;
- runtime capability;
- user-selected task constraints;
- destination goals.

AI does **not** receive:

- file content;
- preview image;
- filename text;
- OCR text.

### Value

- strongest privacy story;
- safe default;
- consistent with current Planner direction.

### Mode B — Preview-assisted / Explicit consent only

Optional and opt-in.

AI may receive a very limited document preview signal only after explicit user consent.

This can include:

- 1–2 raster previews;
- or lightweight derived preview metadata.

### Value

- stronger contextual planning;
- better explanation quality;
- judges can more clearly see where AI adds intelligence.

### Important

The UI must clearly show:

- what is sent;
- what is not sent;
- why preview mode may improve the recommendation.

## Explainable AI panel

The AI response should not be a single recommendation sentence only.

Add an explanation card with compact sections.

### 1. Goal understood

Example:

- Reduce file size for email;
- Keep print readability;
- Avoid cloud upload unless explicitly approved.

### 2. What AI detected

Example:

- 220 pages;
- scanned-heavy;
- image-dominant;
- large file size;
- local machine capability: medium / fast;
- controlled Office Engine available.

### 3. Recommended path

Example:

- Local Engine / Office Engine;
- balanced preset;
- target approximately 20 MB split parts;
- moderate DPI / quality profile.

### 4. Why this path

Example:

- scanned content benefits from image recompression;
- split needed for email-size delivery;
- Office Engine preferred if large file plus healthy controlled server;
- local path remains valid when privacy or availability is prioritized.

### 5. Trade-offs

Example:

- smaller size versus image quality;
- local speed versus server speed;
- privacy-first versus preview-assisted accuracy.

This is the core piece that makes the AI visibly useful.

## Guided task capture

Instead of free-form prompting only, use structured interaction first.

### Recommended input model

#### Primary goal

- email send;
- archive;
- print;
- share online;
- reduce size only.

#### File size target

- no target;
- under 20 MB;
- under 25 MB;
- custom.

#### Quality priority

- highest quality;
- balanced;
- smallest file.

#### Processing preference

- local only;
- prefer local;
- controlled server allowed.

#### Optional advanced toggle

- allow AI preview assistance.

### Optional free-text field

> Anything else the AI should know?

This gives the model structure while preserving flexibility.

## SVG workflow asset

Create and maintain a reusable `AI Orchestrator Workflow` SVG/PNG asset for:

- plan documentation;
- branch README;
- demo deck;
- judge-facing explanation;
- future UI onboarding.

### Content of the workflow

1. Upload PDF;
2. Local structural analysis;
3. Runtime capability detection;
4. User task capture;
5. AI orchestration decision;
6. Recommended plan;
7. User confirmation;
8. Local / Office execution;
9. Result plus rationale.

### Approved visual direction

The workflow should follow the approved dark-blue premium theme:

- near-black background;
- deep navy panels;
- electric blue highlights;
- subtle glow;
- large luminous step numbers;
- crisp white text;
- compact rounded cards;
- clear vertical flow;
- minimal visual noise.

The approved workflow concept contains:

- `Upload PDF`;
- `Automatic Local Analysis`;
- `What do you need to do with this PDF?`;
- quick chips for `Email`, `Portal Upload`, `Reduce Size`, `Print`, and `Custom`;
- `Optional Preview Consent`;
- `AI Orchestrator`;
- a `Decision Inputs` panel;
- `Recommendation`;
- an `Example Plan` panel;
- `Local Engine` or `Office Engine`;
- `User Confirmation`;
- `Process PDF`.

## Phase 12 scope update

Add the following to the Phase 12 deliverables.

### Deliverable A — Visual orchestration shell

- refined Smart Planner / AI Orchestrator card styling;
- premium dark theme;
- visible explanation sections;
- clearer hierarchy of metrics and recommendation.

### Deliverable B — Guided AI interaction

- lightweight task form;
- structured goal capture;
- optional free-text clarification;
- compact reasoning output.

### Deliverable C — Dual privacy modes

- no-preview default mode;
- preview-assisted opt-in mode;
- explicit disclosure text.

### Deliverable D — Explainability

- `Why this recommendation` block;
- `Trade-offs` block;
- `What was used / not used` disclosure.

### Deliverable E — Reusable workflow graphic

- SVG source asset;
- optional PNG export;
- included in `docs/plans` or `docs/assets`.

## Suggested implementation priority

1. Guided task capture;
2. Explainable AI response schema;
3. Visual restyling of recommendation card;
4. Dual-mode privacy switch;
5. SVG workflow asset integration;
6. Optional preview-assisted mode.

## Judge/demo value

This addition improves the competition story because it makes the AI contribution legible:

- AI is not just present in the architecture;
- AI is visibly reasoning about goals and constraints;
- privacy is a first-class product feature;
- the system demonstrates orchestration, not just classification;
- the UI explains why a plan was chosen.

That makes the Build Week demo feel more intentional and more AI-native.

## Relationship to the main Phase 12 plan

This document is a normative addendum to `docs/plans/PHASE12_AI_ORCHESTRATOR_PLAN.md`.

Its visual, explainability, guided-interaction, and dual-mode requirements are accepted Phase 12 scope and should be treated as part of the implementation plan rather than as optional design notes.
