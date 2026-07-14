# Stage 8 UX and Accessibility Preflight

## Status

Preflight and runtime implementation are complete. Automated validation passed. Manual Chrome accessibility and theme acceptance remains pending.

Canonical Stage 8 is independent of the paused Stage 5 JPEG2000 decision and may proceed without changing Compression, Split, licensing, or artifact-generation business rules.

## Canonical Specification Scope

Specification v3.3.0 defines Stage 8 as:

- keyboard navigation with Tab, Enter, and Escape;
- dark-theme behavior through `prefers-color-scheme`;
- automatic IndexedDB cleanup through `chrome.alarms`.

The specification notes elsewhere that stored records should be removed after 24 hours and that Escape cancels an active compression operation.

## Existing Accessibility Baseline

The popup already provides:

- native buttons, inputs, textareas, labels, radio inputs, and checkboxes for most controls;
- Enter and Space activation on the file dropzone;
- localized labels for visible form controls;
- `role="alert"` on several license and Split errors;
- `aria-live="polite"` on Split artifacts and warnings;
- progressbar roles with numeric `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`;
- a grouped and localized language switcher;
- responsive single-column rules below 420 px;
- native `<details>` semantics for diagnostics.

This is a useful baseline, but it does not complete Stage 8.

## Proven Gaps

### 1. Focus visibility

Only the license-token textarea defines an explicit focus outline. Buttons, number inputs, range input, radio cards, checkboxes, dropzone, diagnostics summary, and dynamically inserted download/cancel buttons have no common `:focus-visible` treatment.

Keyboard users can tab through many controls but cannot reliably see the active focus target.

### 2. Escape cancellation

No global keyboard handler exists. Escape does not call `cancelCompression()` or `cancelSplit()`.

Compression and Split already share a busy lock, so only one active operation can require Escape cancellation at a time.

### 3. Invalid composite semantics

The file dropzone is a `role="button"` with `tabIndex=0`, but it contains native buttons. Interactive controls nested inside another interactive control produce confusing keyboard and screen-reader behavior.

The Split strategy container declares `role="tablist"`, while its buttons use `aria-pressed` instead of `role="tab"` and `aria-selected`. No tab panels or arrow-key tab behavior exist. These controls behave as a single-choice button group, not as tabs.

### 4. Incomplete live status

- Compression and Split progressbars have no accessible name.
- Progress/status text is not consistently exposed through a live region.
- Free cooldown changes every second but is not a live status.
- General PDF and compression errors use only visual styling; they do not consistently use `role="alert"` or an associated error description.
- Successful completion is primarily visual and does not have one consistent announcement boundary.

### 5. Dynamic focus behavior

Cancel, download, retry, warning, and artifact controls appear dynamically. There is no defined focus policy after:

- validation failure;
- operation denial by Free/Pro enforcement;
- cancellation;
- successful completion;
- result deletion.

Implementation must avoid unexpected focus stealing while ensuring that an error caused by the user's action is discoverable.

### 6. Theme behavior

The stylesheet hard-codes `color-scheme: dark` and dark colors. There is no `prefers-color-scheme` query and no light palette.

The specification phrase “dark theme through `prefers-color-scheme`” is best satisfied by an automatic light/dark theme with no new manual preference. This interpretation requires confirmation because the existing product currently presents a dark-only identity.

### 7. IndexedDB retention

The manifest does not request the `alarms` permission. No alarm is registered and no cleanup service exists.

Stored result types differ:

- compression results contain `createdAt` and `updatedAt`;
- Split bundles and artifacts contain `createdAt` and `updatedAt`;
- the selected/source `PdfRecord` contains the source file's `lastModified`, but no storage timestamp.

The source file's `lastModified` cannot be used as retention time. A newly selected old document could otherwise be deleted immediately. Cleaning all stored PDF binaries therefore requires a new storage timestamp for `PdfRecord` and backward-compatible handling of existing records.

## Recommended Implementation Slices

### Slice 1 — Keyboard and semantic foundation

- Add a shared high-contrast `:focus-visible` ring for every interactive control.
- Remove nested interactive semantics from the dropzone while retaining drag-and-drop and the native file button.
- Convert Split strategy selection to a labelled single-choice group using native radios or a correctly described pressed-button group.
- Preserve native Tab order; do not introduce positive `tabIndex` values.
- Add Escape cancellation for the active Compression or Split operation.
- Preserve normal browser Escape behavior when no operation is active.

### Slice 2 — Announcements and focus recovery

- Give both progressbars localized accessible names and value text.
- Add one polite live status per operation instead of announcing every visual fragment.
- Make actionable errors assertive and associate field errors with their controls.
- Return focus to the initiating action after cancellation or deletion when that control still exists.
- On errors, focus a stable error summary only when the failure follows a user action.
- Do not automatically move focus on ordinary progress updates.

### Slice 3 — Automatic color scheme

- Refactor visual colors into CSS custom properties.
- Keep the current palette for `prefers-color-scheme: dark`.
- Add a readable light palette for `prefers-color-scheme: light`.
- Add `prefers-reduced-motion` handling for nonessential transitions or progress animation introduced by the UI.
- Test both themes at the popup's normal width and browser text zoom.

### Slice 4 — 24-hour IndexedDB cleanup

- Add the minimal `alarms` permission.
- Create one idempotent cleanup alarm from the background context.
- Run cleanup on install/startup and on the recurring alarm.
- Delete expired compression results.
- Delete expired Split bundles and all referenced artifacts atomically.
- Add a persisted timestamp to source `PdfRecord` before including selected/source PDFs in cleanup.
- Never delete license state, Free usage counters, quality settings, or other `chrome.storage.local` preferences.
- Treat cleanup failures as nonfatal and never interrupt an active operation.

### Slice 5 — Validation

- Add unit tests for retention cutoff, legacy records, Split bundle/artifact consistency, and cleanup idempotency.
- Add DOM-level tests for semantic roles, accessible names, Escape behavior, and focus restoration.
- Run TypeScript, production build, Worker-boundary guard, and existing Stage 4/6/7 regression tests.
- Manually validate keyboard-only operation in Chrome in English and Spanish.
- Manually validate light, dark, and increased-text configurations.

## Scope Boundaries

Stage 8 must not:

- alter Free or Pro allowances;
- change license verification;
- change Compression or Split algorithms;
- introduce Stage 3 URL acquisition;
- implement Stage 5 JPEG2000;
- add Playwright or the full cross-browser matrix assigned to Stage 9;
- redesign the popup information architecture beyond changes required for accessibility and theming.

## Decision Record

### Decision A — Theme interpretation

Recommended:

> Follow the operating-system/browser preference automatically: retain the current dark palette for dark preference and add a light palette for light preference. Do not add a manual theme selector in Stage 8.

Alternative:

> Keep the extension dark-only and use `prefers-color-scheme` only to confirm dark preference. This is a narrower reading and provides no visible adaptation for light preference.

### Decision B — Cleanup scope

Recommended:

> The 24-hour retention rule applies to every PDF binary stored in IndexedDB: selected/source PDF, compressed result, Split bundle, and Split artifacts. License, counters, and settings are excluded.

Alternative:

> Delete only generated Compression and Split results. Retain the selected/source PDF until the user replaces or removes it.

### Decision C — Retention timestamp

Recommended:

> Expiration is 24 hours after `updatedAt`/last successful persistence. Reading or downloading a result does not extend retention.

Alternative:

> Reading or downloading refreshes retention. This adds write activity and makes the privacy lifetime less predictable.

## Original Recommendation

Approve A, B, and C as recommended. Together they produce predictable privacy behavior, minimal permissions, and automatic accessibility without introducing new user settings.

## Approved Decisions

Approved on 2026-07-14:

- follow `prefers-color-scheme` automatically, with the existing dark palette and a new light palette;
- delete every PDF binary stored in IndexedDB after 24 hours, including source, Compression, Split bundle, and Split artifacts;
- calculate expiry from the last successful persistence/update, without extending retention on read or download;
- exclude license state, Free usage counters, quality, language, and other user settings from PDF-binary cleanup.

## Runtime Implementation

### Keyboard and semantics

- Added a shared high-contrast `:focus-visible` ring for interactive controls.
- Removed button semantics and keyboard activation from the dropzone container; the native file button remains the keyboard entry point and drag-and-drop remains available.
- Reclassified Split strategies from an invalid tablist to a labelled pressed-button group.
- Added document-level Escape cancellation for the active Compression or Split operation while preserving normal Escape behavior when idle.
- Added focus recovery to the initiating action after cancellation reaches a non-busy state.
- Added localized accessible names and value text to both progressbars.
- Added polite status announcements for operation state and Free cooldown, and assertive semantics for general PDF/Compression errors.

### Automatic theme

- Changed the document to support light and dark color schemes.
- Retained the current dark palette as the default/dark presentation.
- Added a light palette under `prefers-color-scheme: light` without adding a new preference or selector.
- Added `prefers-reduced-motion` rules for nonessential animation and transitions.

### PDF retention

- Added the minimal `alarms` manifest permission.
- Added an idempotent background cleanup run at service-worker startup and a recurring hourly alarm.
- Enforced an exact 24-hour cutoff from the last successful persistence/update.
- Added `createdAt` and `updatedAt` storage metadata to source `PdfRecord` writes.
- Migrated legacy source records without timestamps by stamping them at first cleanup instead of deleting them immediately.
- Deleted every expired source and Compression record found in their IndexedDB stores.
- Deleted expired Split bundles and their referenced artifacts in one transaction, plus expired legacy and orphan artifact records.
- Did not modify timestamps when reading or downloading.
- Did not touch license state, Free counters, quality, language, or other `chrome.storage.local` settings.
- Treated cleanup failures as nonfatal background warnings.

## Automated Validation

Passed on 2026-07-14:

- `npm run check`;
- `npm run build`;
- `npm run check:worker-boundary`;
- `node --import tsx tests/phase8_retention_accessibility.test.ts`;
- Stage 7 foundation, ES256 license, enforcement, and quality/device-policy regression tests;
- selected-PDF persistence, Split Worker transfer-boundary, and storage-quota regression tests;
- production manifest assertion for the `alarms` permission;
- `git diff --check`.

The Stage 8 test proves expiration of source, Compression, Split bundle, and Split artifact data; atomic artifact removal; idempotent repeated cleanup; and safe legacy source timestamp migration. It also asserts the corrected semantics, Escape boundary, accessible progress names, focus CSS, automatic light theme, and reduced-motion rule.

## Manual Chrome Acceptance Required

Before merging, validate in the unpacked production build:

1. Complete file selection, Compression, Split, cancellation, result download, and result deletion using only Tab, Shift+Tab, Enter/Space, and Escape.
2. Confirm visible focus on every actionable control and focus recovery after Escape cancellation.
3. Confirm screen-reader announcements for operation status, errors, completion, and cooldown in English and Spanish.
4. Toggle the operating-system/browser light and dark preference and confirm readable contrast at normal size and increased text zoom.
5. Confirm existing Compression, Split, Free-limit, and Pro-license behavior remains unchanged.

## SPECIFICATION COMPLIANCE

- Native keyboard navigation, visible focus, and Escape cancellation: **Fully matches specification**.
- Corrected ARIA semantics, accessible progress names, live announcements, and focus recovery: **Extends specification** to meet the stated accessibility goal.
- Automatic light/dark adaptation through `prefers-color-scheme`: **Fully matches specification** under the approved interpretation.
- `prefers-reduced-motion` support: **Extends specification**.
- 24-hour cleanup through `chrome.alarms`: **Fully matches specification**.
- Source-record persistence timestamps and safe legacy migration: **Extends specification** as the data-model requirement needed to enforce the stated retention rule safely.
- Excluding license, counters, and preferences from binary cleanup: **Requires future specification update** for an explicit retention boundary.
- Manual screen-reader, theme, text-zoom, and keyboard acceptance: **Partially matches specification** until the listed Chrome checks are completed.
