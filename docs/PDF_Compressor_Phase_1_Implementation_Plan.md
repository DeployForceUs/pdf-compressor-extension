# PDF Compressor Browser Extension — Phase 1 Implementation Plan

**Specification:** v3.3.0-MVP  
**Phase:** 1 — Basic Infrastructure  
**Branch:** `feature/phase1-infrastructure`

## Objective

Build a stable technical foundation for the extension without implementing PDF business logic.

## Scope

- WXT initialization
- React + TypeScript
- Manifest V3
- Background Service Worker
- React Popup
- Zustand store
- Typed Messaging
- IndexedDB via `idb`
- Offscreen Document
- CSP
- Logging
- Optional Sentry
- Build and smoke-test validation

## Out of scope

- PDF compression
- PDF splitting
- MuPDF
- `pdf-lib`
- JPEG2000
- licensing
- limits
- paywall
- payments
- On-Premise
- Enterprise features

## Recommended implementation order

### 1. Bootstrap

- initialize WXT with React and TypeScript;
- install only Phase 1 dependencies;
- verify `npm run dev`;
- verify `npm run build`.

Suggested dependencies:

```bash
npm install zustand idb @webext-core/messaging @sentry/browser
```

### 2. Manifest V3

Use least privilege.

Initial permissions:

```text
storage
offscreen
```

Do not add host permissions or unrelated permissions.

### 3. Background Service Worker

Responsibilities:

- initialize Logging;
- initialize optional Sentry;
- register typed message handlers;
- expose health check;
- manage Offscreen lifecycle;
- expose IndexedDB smoke test.

Required handlers:

```text
health:check
offscreen:open
offscreen:close
offscreen:health
storage:smoke-test
logging:test-error
```

### 4. Popup UI

Create a minimal engineering status panel, not the final product UI.

Display:

```text
Background status
Offscreen status
IndexedDB status
Logging status
Last error
```

Actions:

```text
Run Health Check
Open Offscreen
Close Offscreen
Test IndexedDB
Test Logging
```

### 5. Zustand

Store only infrastructure state.

Suggested statuses:

```typescript
type CheckStatus = 'idle' | 'running' | 'success' | 'error';
```

Do not store PDF files or binary data in Zustand.

### 6. Typed Messaging

Use shared compile-time-safe contracts.

Minimum response contracts:

```typescript
interface HealthResponse {
  ok: boolean;
  context: 'background' | 'offscreen';
  timestamp: number;
}
```

Use stable error codes instead of raw exceptions in the UI.

### 7. Offscreen Document

Required behavior:

- open from Background;
- prevent duplicate creation;
- handle concurrent create calls;
- respond to health check;
- close cleanly;
- reopen after close.

Validate the exact supported Chrome Offscreen reason during implementation.

### 8. IndexedDB

Required functions:

```typescript
saveBinary(id, data, mimeType)
getBinary(id)
deleteBinary(id)
```

Smoke-test data:

```typescript
new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252])
```

Smoke-test flow:

1. save the `ArrayBuffer`;
2. read it back;
3. compare bytes;
4. delete it;
5. confirm missing record returns `null`.

Expected result:

```typescript
{
  ok: true,
  bytesWritten: 8,
  bytesRead: 8,
  deleted: true
}
```

### 9. Logging

Provide a thin shared logger:

```typescript
logger.info(message, context?)
logger.warn(message, context?)
logger.error(message, error?, context?)
logger.debug(message, context?)
```

Never log file bytes, file contents, secrets, tokens, or sensitive user data.

### 10. Sentry

Use configuration:

```text
WXT_PUBLIC_SENTRY_ENABLED=false
WXT_PUBLIC_SENTRY_DSN=
```

Requirements:

- disabled by default;
- no failure when disabled;
- no user identity;
- no PDF content;
- sanitize events before sending.

### 11. CSP

Requirements:

- no remote scripts;
- no `eval`;
- no `unsafe-eval`;
- no inline executable scripts;
- all code bundled locally.

### 12. Validation

Run:

```bash
npm install
npm run dev
npm run build
```

Manual Chrome smoke test:

1. open `chrome://extensions`;
2. enable Developer mode;
3. load unpacked build output;
4. confirm no Manifest or CSP errors;
5. open Popup;
6. run Background health check;
7. open, check, close, and reopen Offscreen;
8. run IndexedDB smoke test;
9. run Logging test;
10. repeat Popup open/close cycle ten times.

## Definition of Done

- [ ] clean install succeeds
- [ ] dev mode starts
- [ ] production build succeeds
- [ ] extension loads in Chrome
- [ ] Popup renders
- [ ] typed Popup ↔ Background messaging works
- [ ] Offscreen lifecycle works
- [ ] IndexedDB byte comparison passes
- [ ] test record is deleted
- [ ] Logging works in Popup, Background, and Offscreen
- [ ] optional Sentry does not leak sensitive data
- [ ] no CSP violations
- [ ] no unnecessary permissions
- [ ] no out-of-scope features
- [ ] implementation report created
- [ ] smoke-test report created

## Required reports

```text
reports/phase1_implementation_report.md
reports/phase1_smoke_test_report.md
```

Each report must distinguish:

- implemented and verified;
- implemented but not manually verified;
- blocked;
- out of scope.

## Codex operating rule

Before modifying files:

1. inspect the repository;
2. report current state and blockers;
3. propose a concise implementation plan.

Then implement Phase 1, run available validation, and report actual results. Do not claim Chrome manual validation unless it was genuinely performed.
