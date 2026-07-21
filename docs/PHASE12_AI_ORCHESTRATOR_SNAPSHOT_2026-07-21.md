# Phase 12 AI Orchestrator — Snapshot

Date: 2026-07-21
Branch: `feature/phase12-ai-orchestrator`
Repository: `DeployForceUs/pdf-compressor-extension`
Build output: `.output/chrome-mv3-ai-lab`
Stable commercial output: `.output/chrome-mv3`

## 1. What this branch is

This branch is the competition-only AI Lab flow for OpenAI Build Week. It is intentionally separated from the commercial extension.

The commercial product remains the privacy-first PDF Compressor with deterministic local processing and optional Office Engine support. The competition branch adds a guided AI-planning experience on top of the existing PDF pipeline.

Core product principle:

> AI decides. Deterministic engine executes. PDF content stays local.

The AI Planner must receive only content-blind structural metrics and user intent. It must not receive PDF bytes, filename, extracted text, page images, previews, or document content.

## 2. Current workflow

The popup uses three permanent top-level stages:

1. `Upload PDF`
2. `Local Analysis`
3. `Define Goal`

There is no fourth top-level stage. Goal refinement and the recommendation screen stay inside `Define Goal`.

### Stage 1 — Upload PDF

Two input paths are available:

- local PDF picker / drag-and-drop;
- public PDF link loader.

The PDF link loader supports:

- normal HTTP/HTTPS PDF links;
- Google Drive view links in `/file/d/.../view` format;
- Google Drive direct download links in `uc?export=download&id=...` format;
- Google Drive redirect handling through `drive.usercontent.google.com`.

Behavior:

- `Load PDF` becomes active only for a valid HTTP/HTTPS URL;
- Enter works;
- optional host permissions are requested;
- the download happens locally in the extension;
- the result is validated by checking the `%PDF-` signature;
- nothing is uploaded.

Confirmed manually:

- ordinary Google Drive view link works;
- direct Google Drive download link works;
- redirect-domain permission works.

### Immediate link-loading transition

When `Load PDF` is pressed, the UI immediately switches to `2 · Local Analysis` and shows the existing spinner while downloading and validating the file.

The actual download and validation logic is not skipped. Only the perceived dead pause on the upload screen was removed.

A brief intermediate dark state may still flash during the transition. This is accepted for the competition build and is not a priority unless it breaks the flow.

### Stage 2 — Automatic Local Analysis

Current screen copy:

- `Automatic Local Analysis`
- privacy disclosure explaining that only content-blind structural metrics are prepared;
- spinner during analysis;
- final summary with page count, image-object count, scanned/text/vector ratios;
- CTA: `Continue to Define Goal`.

Confirmed example:

- 56 pages;
- 50 image objects;
- scanned 0%;
- text 100%;
- vector 0%.

The local analysis is real and uses the existing content-blind profiler.

### Stage 3 — Define Goal

Initial choices:

- `Send by email`
- `Upload to a portal`
- `Print`
- `Archive`
- `Reduce file size`
- `Something else`

The visual layout is approved. The screen is compact, clear, and should not be redesigned before the competition unless a functional bug appears.

## 3. Goal branches implemented

### Send by email

Refinement options:

- 10 MB
- 20 MB
- 25 MB
- Custom

Custom accepts a numeric target size and supports Enter.

### Upload to a portal

Refinement options:

- 10 MB
- 20 MB
- 50 MB
- Custom

### Print

Refinement options:

- Standard
- High quality

### Archive

Refinement options:

- Smaller file
- Preserve quality

### Reduce file size

Refinement options:

- Light
- Balanced
- Maximum

### Something else

Provides a short free-text field and a `Build plan` action.

## 4. Recommendation screen

Every branch reaches the same shared `Recommended Plan` screen.

Current behavior:

- recommendations are generated immediately by local templates;
- `Back` returns to the relevant refinement screen;
- `Process PDF` is present as the final CTA;
- actual deterministic execution is not yet connected from this competition flow.

Important limitation:

The current recommendation is not produced by OpenAI yet. That is why it appears instantly and currently feels less like an AI decision.

This is the next major implementation step.

## 5. Navigation and reset behavior

The three top stages remain visible at all times.

- active stage: blue gradient;
- completed stage: dark cold blue;
- green is reserved for final successful download;
- no primary scrolling or popup-size growth should be introduced.

`1 · Upload PDF` is designed as a full workflow reset.

A bug was found where returning to stage 1 produced a black/empty screen. A narrow competition-only fix was added so stage 1 reloads the popup and restores the full base upload window, including:

- dropzone;
- local file picker;
- PDF link field.

No other workflow behavior was intentionally changed by that fix.

## 6. Session behavior

The AI Lab popup starts fresh each time it opens.

- `selected-pdf` is cleared during AI Lab startup;
- technical IndexedDB data may remain while the current processing operation is active;
- commercial persistence behavior is unchanged.

## 7. Competition architecture

### Local side

The browser performs:

- PDF selection/download;
- PDF signature validation;
- document profiling;
- content-blind metric preparation;
- final deterministic PDF execution.

### Planner side

The intended Planner request contains:

- page count;
- image-object count;
- scanned/text/vector ratios;
- local runtime capability;
- available engine capabilities;
- selected user goal;
- target size or quality preference;
- approved numeric policy and allowed presets.

It must not contain document content.

### OpenAI role

OpenAI should:

- interpret the user's goal;
- evaluate size/quality trade-offs;
- choose a permitted deterministic plan;
- provide a concise explanation;
- return structured output validated against the planner contract.

OpenAI must not directly process or receive the PDF.

## 8. Current branch-specific postbuild approach

Most competition UI additions are currently applied through AI Lab postbuild scripts into `.output/chrome-mv3-ai-lab`.

This is intentionally fast for the competition but fragile compared with source-level React implementation.

Do not refactor these runtime patches before the competition unless they block functionality. Source migration can happen after the competition.

Current postbuild chain includes:

- AI Lab marker;
- palette;
- English-only mode;
- workflow navigation;
- clean-session reset;
- PDF link loader;
- PDF link visibility and reinstall fixes;
- Google Drive redirect permissions;
- immediate linked-PDF analysis transition;
- email goal flow;
- all remaining goal branches;
- upload-stage reset verification.

## 9. Relevant recent commits

Workflow/session foundation:

- `5ae935f` — own AI Lab workflow state in React
- `0a9258c` — leave AI Lab workflow control to React
- `309d8aa` — reset AI Lab PDF before popup startup
- `5af7d13` — enforce clean AI Lab popup session

PDF link loader:

- `f28b570` — add PDF link loading
- `e9b3dae` — include PDF link input
- `68b6a73` — keep PDF link field visible
- `b3bd14b` — show PDF link field
- `5b64b60` — normalize Google Drive links
- `e42f4c0` — reinstall link after React redraw
- `80831d8` — keep link across redraws
- `d10add4` — preserve Google Drive regex escapes
- `39340b0` — make reinstall patch idempotent
- `26f1c9c` — request Google Drive redirect-host permission
- `5dc4c44` — allow Google Drive redirect host

Immediate analysis transition:

- `a08fe0a` — show analysis spinner immediately for linked PDFs
- `7e1dd4f` — apply immediate linked-PDF analysis transition

Goal flows:

- `a50f630` — add email target-size flow
- `ea5fdbc` — apply email goal flow
- `e0f4a25` — complete all AI Lab goal branches
- `7d9ebe6` — enable all AI Lab goal branches

Upload reset fix:

- `e370d7a` — restore upload screen from workflow reset
- `b54cc17` — verify upload stage reset

## 10. Preflight for tomorrow

Run from the Mac:

```bash
cd ~/pdf-compressor-extension || exit 1

git fetch origin
git checkout feature/phase12-ai-orchestrator
git pull --ff-only

git status --short
npm run check
npm run build:ai
```

Expected final postbuild verification messages include:

- `AI Lab Google Drive redirect permission verified`
- `AI Lab linked-PDF immediate analysis transition verified`
- `AI Lab all goal flows verified`
- `AI Lab upload stage reset verified`

The Vite warning about chunks larger than 500 kB is currently non-blocking.

After build:

1. Open `chrome://extensions`.
2. Reload the AI Lab extension.
3. Confirm it points to `.output/chrome-mv3-ai-lab`.

## 11. Manual smoke test for tomorrow

Do not change code until this smoke test passes.

### Upload/reset

1. Open popup — full upload screen appears.
2. Load a local PDF.
3. Go through analysis and Define Goal.
4. Press `1 · Upload PDF`.
5. Confirm the full upload screen returns, not a black screen.

### PDF link

1. Test a normal Google Drive `/file/d/.../view` link.
2. Test a direct `uc?export=download&id=...` link.
3. Confirm immediate transition to the analysis spinner.
4. Confirm local analysis completes.

### Goal branches

Click every goal and verify:

- refinement screen appears;
- custom inputs work;
- Enter works where expected;
- recommendation screen appears;
- Back returns to the correct branch;
- Back again returns to the six-goal menu.

## 12. Plan for tomorrow

### Priority 1 — Connect the real AI Planner

Replace the immediate local recommendation template with a real Planner request.

The sequence should be:

1. User selects the goal and refinement.
2. Show the existing recommendation-area spinner immediately.
3. Build a content-blind request from the existing local profile plus the selected goal.
4. Send it through the Planner Gateway.
5. Call OpenAI using structured output.
6. Validate the returned plan against allowed deterministic policies.
7. Render the returned recommendation and explanation.

No artificial delay should be added. The waiting state must correspond to real work.

### Priority 2 — AI waiting experience

During the real Planner call, show short real status transitions such as:

- preparing privacy-safe profile;
- connecting to AI Planner;
- evaluating size and quality trade-offs;
- building recommended plan.

Do not implement a theatrical character-by-character typewriter effect. Prefer progressive appearance of real recommendation sections after the response arrives.

### Priority 3 — Unify goal-to-contract mapping

Map all six UI branches into one normalized `userGoal` object.

Examples:

- email / portal → delivery target plus target size;
- print → quality intent;
- archive → preservation preference;
- reduce size → compression aggressiveness;
- something else → free-text intent with safe normalization.

The AI call must use one common contract, not six unrelated implementations.

### Priority 4 — Failure behavior

If Planner Gateway or OpenAI fails:

- show an inline error on the recommendation screen;
- preserve the selected goal/refinement;
- allow retry;
- allow Back;
- never lose the loaded PDF;
- never silently fall back while claiming the result is AI-generated.

A clearly labeled deterministic fallback may be added only if time allows.

### Priority 5 — Final execution wiring

After the real AI recommendation is stable:

- connect `Process PDF` to the approved deterministic plan;
- confirm the execution route is local or Office Engine according to the validated plan;
- show the final successful download state in green.

This comes after the AI recommendation path, not before.

## 13. What not to do tomorrow

- Do not redesign the approved visual layout.
- Do not add Gmail, Apple Mail, or Yahoo icons.
- Do not add a fourth top-level workflow stage.
- Do not send PDF content to OpenAI.
- Do not expose OpenAI credentials in the extension.
- Do not refactor the postbuild architecture before the competition.
- Do not change the commercial `.output/chrome-mv3` build.
- Do not spend time polishing the accepted brief intermediate dark transition unless it becomes functional breakage.

## 14. Definition of success for the next session

Tomorrow's session is successful when:

1. the current UI passes full preflight and smoke testing;
2. every goal produces a normalized Planner request;
3. OpenAI returns a validated structured recommendation;
4. the UI visibly waits for the real AI response;
5. the recommendation reflects both the actual document profile and the selected user goal;
6. no document content leaves the device;
7. failure and retry behavior are clear;
8. the commercial build remains untouched.
