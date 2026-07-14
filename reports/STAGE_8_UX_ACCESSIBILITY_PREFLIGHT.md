# Stage 8 UX and Accessibility Preflight

## Status

Preflight is complete. Runtime implementation has not started.

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

## Decisions Required Before Runtime Changes

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

## Recommended Decisions

Approve A, B, and C as recommended. Together they produce predictable privacy behavior, minimal permissions, and automatic accessibility without introducing new user settings.

## SPECIFICATION COMPLIANCE

- Native keyboard navigation and visible focus: **Fully matches specification**.
- Escape cancellation of the active operation: **Fully matches specification**.
- Corrected ARIA semantics and live announcements: **Extends specification** to meet the stated accessibility goal.
- Automatic light/dark adaptation through `prefers-color-scheme`: **Fully matches specification** under the recommended interpretation.
- `prefers-reduced-motion` support: **Extends specification**.
- 24-hour cleanup through `chrome.alarms`: **Fully matches specification**.
- Adding a source-record persistence timestamp: **Extends specification** as the data-model requirement needed to enforce the stated retention rule safely.
- Excluding license, counters, and preferences from binary cleanup: **Requires future specification update** for an explicit retention boundary.
