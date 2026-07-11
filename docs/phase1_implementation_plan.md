# PDF Compressor Browser Extension — Phase 1 Implementation Plan

**Specification:** v3.3.0  
**Phase:** 1 — Basic Infrastructure  
**Target:** Chromium-based browsers  
**Manifest:** V3  
**Status:** Ready for implementation

---

## 1. Objective

Build a stable technical foundation for the PDF Compressor extension without implementing PDF compression, PDF splitting, JPEG2000 support, licensing, limits, paywall, or On-Premise functionality.

Phase 1 must prove that the extension architecture works end to end:

```text
Popup UI
   ↓
Typed Messaging
   ↓
Background Service Worker
   ↓
Offscreen Document
   ↓
IndexedDB
   ↓
Logging / Sentry
```

The result must be a loadable Chrome extension that passes all Phase 1 smoke tests.

---

## 2. Scope

Phase 1 includes:

- WXT project initialization
- Manifest V3 configuration
- Background Service Worker
- React Popup UI
- Zustand state management
- Typed Messaging
- IndexedDB via `idb`
- Offscreen Document creation and smoke test
- CSP configuration
- Basic Sentry initialization
- Build validation
- Chrome manual installation
- Automated and manual smoke tests
- Documentation of known limitations

---

## 3. Out of Scope

Do not implement during Phase 1:

- PDF compression
- PDF splitting
- MuPDF integration
- `pdf-lib` integration
- JPEG2000
- `openjpeg.js`
- JBIG2
- Licensing
- JWT verification
- Daily limits
- Device fingerprinting
- Rate limiting
- Paywall
- Payments
- Production analytics
- On-Premise
- Docker Compose
- MinIO
- Redis
- Enterprise configuration
- Context-menu PDF processing
- File upload flow
- Download flow

Any work outside Phase 1 must be tracked separately and must not block Phase 1 completion.

---

## 4. Definition of Done

Phase 1 is complete only when all items below pass.

### Build

- [ ] `npm install` completes successfully
- [ ] `npm run dev` starts without fatal errors
- [ ] `npm run build` completes successfully
- [ ] Production extension output is generated
- [ ] No TypeScript errors remain
- [ ] No unresolved imports remain

### Chrome Installation

- [ ] Extension loads through `chrome://extensions`
- [ ] Developer mode installation succeeds
- [ ] No Manifest errors are shown
- [ ] No CSP errors are shown
- [ ] Background Service Worker starts

### Popup

- [ ] Popup opens
- [ ] React renders successfully
- [ ] Zustand store initializes
- [ ] Popup shows current health state
- [ ] Popup does not crash after repeated open/close cycles

### Messaging

- [ ] Popup sends a typed `health:check` message
- [ ] Background receives the message
- [ ] Background returns a typed response
- [ ] Popup displays the response
- [ ] Error response is handled gracefully

### Offscreen Document

- [ ] Background creates the Offscreen Document
- [ ] Duplicate creation is prevented
- [ ] Offscreen Document responds to a health-check
- [ ] Offscreen Document can be closed
- [ ] Reopening after close works

### IndexedDB

- [ ] A test `ArrayBuffer` is saved
- [ ] The same `ArrayBuffer` is read back
- [ ] Binary contents match byte-for-byte
- [ ] Test record is deleted
- [ ] Missing record returns `null`
- [ ] Database errors are handled

### Logging / Sentry

- [ ] Logging works in Popup
- [ ] Logging works in Background
- [ ] Logging works in Offscreen
- [ ] Test exception can be captured
- [ ] No PDF bytes or sensitive content are sent
- [ ] Sentry can be disabled by configuration

### Quality

- [ ] Smoke-test checklist is documented
- [ ] README includes setup and run steps
- [ ] Phase 1 limitations are documented
- [ ] No out-of-scope features are partially implemented

---

## 5. Recommended Repository Structure

```text
pdf-compressor-extension/
├── src/
│   ├── entrypoints/
│   │   ├── background.ts
│   │   ├── popup/
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── store.ts
│   │   │   └── styles.css
│   │   └── offscreen/
│   │       ├── index.html
│   │       └── main.ts
│   ├── lib/
│   │   ├── messaging.ts
│   │   ├── offscreen-manager.ts
│   │   ├── storage/
│   │   │   └── indexed-db.ts
│   │   ├── monitoring/
│   │   │   ├── logger.ts
│   │   │   └── sentry.ts
│   │   └── config/
│   │       └── env.ts
│   └── types/
│       └── global.d.ts
├── public/
│   └── icons/
├── tests/
│   ├── unit/
│   └── smoke/
├── docs/
│   ├── PHASE_1_IMPLEMENTATION_PLAN.md
│   ├── PHASE_1_SMOKE_TEST.md
│   └── PHASE_1_KNOWN_LIMITATIONS.md
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. Git Workflow

### Branches

```text
main
develop
feature/phase1-bootstrap
feature/phase1-popup
feature/phase1-messaging
feature/phase1-offscreen
feature/phase1-indexeddb
feature/phase1-sentry
test/phase1-smoke
```

For a small team, a simpler workflow is acceptable:

```text
main
feature/phase1-infrastructure
```

### Commit Style

Use small, focused commits.

Examples:

```text
chore: initialize WXT project
feat: add Manifest V3 configuration
feat: add React popup shell
feat: add Zustand health store
feat: add typed popup-background messaging
feat: add offscreen document manager
feat: add IndexedDB binary smoke test
feat: add Sentry bootstrap
test: add Phase 1 smoke checklist
docs: add Phase 1 setup guide
```

### Pull Request Rule

Each PR must include:

- Summary
- Scope
- Files changed
- Manual test steps
- Known limitations
- Screenshots or logs where relevant
- Confirmation that no out-of-scope features were added

---

## 7. Implementation Sequence

The order matters. Do not start IndexedDB, Sentry, or Offscreen work before the WXT bootstrap and basic Popup/Background flow work.

---

# Task 1 — Initialize the WXT Project

## Goal

Create a clean WXT project with TypeScript and React support.

## Actions

```bash
npm create wxt@latest pdf-compressor-extension
cd pdf-compressor-extension
npm install
```

Select:

```text
Framework: React
Language: TypeScript
Package manager: npm
```

Install Phase 1 dependencies:

```bash
npm install zustand idb @webext-core/messaging @sentry/browser
```

Optional development dependencies:

```bash
npm install -D vitest @types/chrome
```

## Verify

```bash
npm run dev
```

Expected:

- WXT dev server starts
- Extension build directory appears
- No fatal errors

## Deliverables

- `package.json`
- `tsconfig.json`
- initial WXT structure
- `.gitignore`
- initial README

## Acceptance Criteria

- [ ] Project installs
- [ ] Dev server starts
- [ ] TypeScript works
- [ ] React entrypoint works
- [ ] First commit is created

---

# Task 2 — Configure Manifest V3

## Goal

Define only the permissions required for Phase 1.

## Recommended `wxt.config.ts`

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'PDF Compressor',
    version: '0.1.0',
    description: 'Local PDF processing extension',
    manifest_version: 3,
    permissions: [
      'storage',
      'offscreen',
    ],
    action: {
      default_title: 'PDF Compressor',
    },
  },
});
```

Do not add yet:

```text
activeTab
scripting
downloads
notifications
alarms
contextMenus
host_permissions
```

Those permissions belong to later phases unless technically required.

## Security Rule

Apply least privilege.

Every permission must have a documented reason.

## Acceptance Criteria

- [ ] Manifest uses V3
- [ ] Only Phase 1 permissions exist
- [ ] Extension loads without Manifest warnings
- [ ] Permission rationale is documented

---

# Task 3 — Create Background Service Worker

## Goal

Create the Background coordinator.

## Required Responsibilities

- initialize logging
- initialize Sentry
- register typed message handlers
- coordinate Offscreen Document lifecycle
- expose health state
- expose IndexedDB smoke-test endpoint

## Recommended Health Response

```typescript
export interface HealthResponse {
  ok: boolean;
  context: 'background';
  version: string;
  timestamp: number;
}
```

## Required Handlers

```text
health:check
offscreen:open
offscreen:close
offscreen:health
storage:smoke-test
logging:test-error
```

## Acceptance Criteria

- [ ] Service Worker starts
- [ ] Startup is logged
- [ ] Handler registration succeeds
- [ ] Health check returns correct data
- [ ] Unknown errors are caught and logged

---

# Task 4 — Build the React Popup

## Goal

Create a minimal technical status UI.

## Popup Content

The Popup should show:

```text
PDF Compressor
Phase 1 Infrastructure

Background: Checking...
Offscreen: Not started
IndexedDB: Not tested
Logging: Ready

[Run Health Check]
[Open Offscreen]
[Test IndexedDB]
[Test Logging]
```

Do not design the final product UI yet.

This is an engineering control panel for Phase 1 validation.

## Required States

```typescript
type CheckStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'error';
```

## Acceptance Criteria

- [ ] Popup renders
- [ ] No runtime errors
- [ ] Buttons trigger store actions
- [ ] Statuses update
- [ ] Errors are visible
- [ ] Popup survives repeated reopening

---

# Task 5 — Add Zustand Store

## Goal

Centralize Popup state.

## Suggested Store Shape

```typescript
interface InfrastructureState {
  backgroundStatus: CheckStatus;
  offscreenStatus: CheckStatus;
  indexedDbStatus: CheckStatus;
  loggingStatus: CheckStatus;
  lastError: string | null;

  checkBackground: () => Promise<void>;
  openOffscreen: () => Promise<void>;
  testIndexedDb: () => Promise<void>;
  testLogging: () => Promise<void>;
  reset: () => void;
}
```

## Rules

- Store must not contain PDF business logic
- Store must not store binary files
- Store must expose explicit async actions
- UI must remain thin

## Acceptance Criteria

- [ ] Store initializes
- [ ] Actions update states correctly
- [ ] Errors do not crash Popup
- [ ] State is easy to inspect

---

# Task 6 — Implement Typed Messaging

## Goal

Create compile-time-safe communication between Popup, Background, and Offscreen.

## Suggested Protocol

```typescript
interface ProtocolMap {
  'health:check': () => Promise<{
    ok: boolean;
    context: 'background';
    version: string;
    timestamp: number;
  }>;

  'offscreen:open': () => Promise<{
    ok: boolean;
    created: boolean;
  }>;

  'offscreen:close': () => Promise<{
    ok: boolean;
  }>;

  'offscreen:health': () => Promise<{
    ok: boolean;
    context: 'offscreen';
  }>;

  'storage:smoke-test': () => Promise<{
    ok: boolean;
    bytesWritten: number;
    bytesRead: number;
    deleted: boolean;
  }>;

  'logging:test-error': () => Promise<{
    ok: boolean;
    captured: boolean;
  }>;
}
```

## Error Contract

Use structured errors.

```typescript
interface AppError {
  code: string;
  message: string;
  context?: string;
}
```

Recommended codes:

```text
BACKGROUND_UNAVAILABLE
OFFSCREEN_CREATE_FAILED
OFFSCREEN_NOT_AVAILABLE
INDEXED_DB_WRITE_FAILED
INDEXED_DB_READ_FAILED
INDEXED_DB_DELETE_FAILED
SENTRY_CAPTURE_FAILED
UNKNOWN_ERROR
```

## Acceptance Criteria

- [ ] Types are shared
- [ ] No untyped `any` payloads
- [ ] Popup receives correct typed responses
- [ ] Errors use stable codes
- [ ] Message names are documented

---

# Task 7 — Implement Offscreen Document Manager

## Goal

Create and manage the Offscreen Document from Background.

## Required Functions

```typescript
export async function hasOffscreenDocument(): Promise<boolean>
export async function openOffscreenDocument(): Promise<boolean>
export async function closeOffscreenDocument(): Promise<void>
```

## Required Behavior

- prevent duplicate creation
- handle race conditions
- return existing document state
- close cleanly
- log lifecycle transitions

## Suggested Creation Reason

Use an appropriate Chrome reason supported by the current platform implementation.

Example structure:

```typescript
await chrome.offscreen.createDocument({
  url: 'offscreen/index.html',
  reasons: ['WORKERS'],
  justification: 'Run local extension background processing',
});
```

The exact supported `reasons` value must be validated during implementation.

## Offscreen Health Handler

The Offscreen Document must respond with:

```typescript
{
  ok: true,
  context: 'offscreen',
  timestamp: Date.now()
}
```

## Acceptance Criteria

- [ ] Offscreen opens
- [ ] Second open call does not create duplicate
- [ ] Health check works
- [ ] Close works
- [ ] Reopen works
- [ ] Lifecycle is logged

---

# Task 8 — Configure CSP

## Goal

Ensure Manifest V3-compatible local script execution.

## Rules

- No remote scripts
- No `unsafe-eval`
- No inline executable scripts
- All JavaScript must be bundled locally
- Sentry must not require remote code execution
- WASM-specific CSP changes are postponed until MuPDF integration unless needed now

## Validate

Check:

```text
chrome://extensions
Service Worker console
Popup DevTools
Offscreen DevTools
```

## Acceptance Criteria

- [ ] No CSP errors
- [ ] Popup loads
- [ ] Background loads
- [ ] Offscreen loads
- [ ] No remote scripts are used

---

# Task 9 — Implement IndexedDB Wrapper

## Goal

Create a small binary storage abstraction.

## Suggested Record

```typescript
interface BinaryRecord {
  id: string;
  data: ArrayBuffer;
  mimeType: string;
  createdAt: number;
}
```

## Required Functions

```typescript
saveBinary(
  id: string,
  data: ArrayBuffer,
  mimeType: string
): Promise<void>

getBinary(
  id: string
): Promise<BinaryRecord | null>

deleteBinary(
  id: string
): Promise<void>
```

## Smoke-Test Flow

1. Create a deterministic byte array:

```typescript
new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252])
```

2. Save it as an `ArrayBuffer`
3. Read it back
4. Compare byte-for-byte
5. Delete it
6. Confirm the record no longer exists

## Expected Result

```typescript
{
  ok: true,
  bytesWritten: 8,
  bytesRead: 8,
  deleted: true
}
```

## Edge Cases

- duplicate ID
- missing record
- empty `ArrayBuffer`
- transaction failure
- database unavailable
- quota error

## Acceptance Criteria

- [ ] Write works
- [ ] Read works
- [ ] Binary equality passes
- [ ] Delete works
- [ ] Missing record returns `null`
- [ ] Errors are normalized

---

# Task 10 — Add Logging Abstraction

## Goal

Avoid direct scattered `console.log` usage.

## Suggested API

```typescript
logger.info(message, context?)
logger.warn(message, context?)
logger.error(message, error?, context?)
logger.debug(message, context?)
```

## Required Context Fields

```typescript
interface LogContext {
  component?: 'popup' | 'background' | 'offscreen' | 'storage';
  operation?: string;
  requestId?: string;
}
```

## Security Rules

Never log:

- PDF bytes
- file contents
- full file paths
- tokens
- license keys
- Authorization headers
- user-provided sensitive text

## Acceptance Criteria

- [ ] Shared logger exists
- [ ] All three contexts use it
- [ ] Errors contain component and operation
- [ ] Sensitive values are excluded

---

# Task 11 — Add Basic Sentry Initialization

## Goal

Prove that errors can be captured without exposing user data.

## Configuration

Use environment variables.

```text
WXT_PUBLIC_SENTRY_DSN=
WXT_PUBLIC_SENTRY_ENABLED=false
```

## Rules

- disabled by default in local development
- enabled only when DSN is configured
- no PDF data in events
- no request body collection
- no user identity collection
- no breadcrumbs containing file names unless explicitly sanitized

## Test Error

Add a development-only action:

```typescript
throw new Error('PHASE_1_TEST_ERROR');
```

Capture it through the shared monitoring wrapper.

## Acceptance Criteria

- [ ] Initialization works in Popup
- [ ] Initialization works in Background
- [ ] Initialization works in Offscreen
- [ ] Test exception is captured
- [ ] Disabled mode does not fail
- [ ] Sensitive data is sanitized

---

# Task 12 — Build the Phase 1 Smoke Test

## Goal

Provide one repeatable validation flow.

## Manual Smoke Test

### Preflight

```bash
npm install
npm run build
```

### Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the WXT build output
5. Confirm no errors

### Popup Test

1. Open Popup
2. Click `Run Health Check`
3. Confirm Background = Success

### Offscreen Test

1. Click `Open Offscreen`
2. Confirm Offscreen = Success
3. Trigger second open
4. Confirm no duplicate error
5. Close Offscreen
6. Reopen Offscreen

### IndexedDB Test

1. Click `Test IndexedDB`
2. Confirm:
   - write passed
   - read passed
   - bytes matched
   - delete passed

### Logging Test

1. Click `Test Logging`
2. Confirm local log
3. Confirm Sentry event when enabled
4. Confirm no sensitive payload

### Stability Test

Repeat 10 times:

```text
Open Popup
Run Health Check
Close Popup
```

Expected:

- no crash
- no duplicated listeners
- no stuck state
- no unhandled Promise rejection

---

## 8. Automated Tests

Phase 1 does not need a large test suite, but it should include targeted tests.

### Unit Tests

Recommended:

```text
indexed-db.spec.ts
logger.spec.ts
offscreen-manager.spec.ts
store.spec.ts
```

### Integration Tests

Recommended:

```text
popup-background-messaging.spec.ts
background-offscreen-health.spec.ts
indexed-db-smoke.spec.ts
```

### Minimum Coverage Target

Do not optimize for a high percentage.

Target critical behavior:

- messaging contracts
- binary persistence
- error normalization
- Offscreen lifecycle
- store state transitions

---

## 9. Task Breakdown by Day

### Day 1

- initialize WXT
- configure TypeScript
- configure Manifest V3
- create repository
- create branch
- verify Chrome installation

### Day 2

- create Background
- create Popup
- add Zustand
- add initial health UI

### Day 3

- implement typed messaging
- implement Background health check
- handle structured errors
- run Popup ↔ Background smoke test

### Day 4

- create Offscreen entrypoint
- implement Offscreen manager
- implement health check
- test open/close/reopen

### Day 5

- implement IndexedDB wrapper
- implement binary smoke test
- add error handling
- validate binary equality

### Day 6

- add logger
- add Sentry wrapper
- add sanitized test error
- verify all contexts

### Day 7

- final smoke test
- fix regressions
- update README
- add limitations document
- create Phase 1 completion report

Estimated duration:

```text
1 developer: 5–7 working days
2 parallel developers: 3–5 working days
```

Parallel development reduces elapsed time only if integration ownership is clear.

---

## 10. Parallel Development Plan

Because two independent implementations are being created, both teams must use the same frozen acceptance criteria.

### Shared Inputs

Both implementations receive:

- same specification v3.3.0
- same Phase 1 scope
- same Definition of Done
- same smoke-test checklist
- same Node.js version
- same Chrome version
- same test byte array for IndexedDB
- same required message names

### Independent Choices Allowed

Each team may choose:

- internal file organization
- helper abstractions
- UI styling
- test framework
- logger internals
- exact store implementation details

### Not Allowed

Teams must not change:

- Phase 1 scope
- Definition of Done
- required health endpoints
- binary smoke-test requirements
- security requirements
- minimum Chrome installation criteria

### Final Comparison Scorecard

| Category | Weight |
|---|---:|
| Build reliability | 15% |
| Chrome installation | 10% |
| Typed Messaging | 15% |
| Offscreen lifecycle | 15% |
| IndexedDB correctness | 15% |
| Error handling | 10% |
| Security and CSP | 10% |
| Code clarity | 5% |
| Documentation | 5% |

Total: 100%.

---

## 11. Risks and Mitigations

### Risk 1 — Offscreen API mismatch

**Problem:** Chrome Offscreen reasons and behavior may differ from assumptions.

**Mitigation:**

- validate against the installed Chrome version
- use the smallest possible health test
- isolate Offscreen creation behind one manager
- document browser-specific behavior

### Risk 2 — Service Worker suspension

**Problem:** MV3 Background can stop between events.

**Mitigation:**

- do not keep essential state only in memory
- make handlers idempotent
- reopen Offscreen when required
- persist only necessary durable state

### Risk 3 — Duplicate Offscreen creation

**Problem:** Parallel calls may create race conditions.

**Mitigation:**

- use a module-level creation Promise
- check existing contexts before creation
- serialize create calls

### Risk 4 — Sentry privacy conflict

**Problem:** Monitoring can contradict the product privacy promise.

**Mitigation:**

- disabled by default
- no file content
- no file bytes
- no user identity
- sanitize all events
- document telemetry explicitly

### Risk 5 — Scope creep

**Problem:** Teams start implementing compression too early.

**Mitigation:**

- freeze scope
- reject out-of-scope PRs
- track later work in backlog
- require Phase 1 DoD before Phase 2

### Risk 6 — Overengineering

**Problem:** Too many abstractions before real processing exists.

**Mitigation:**

- prefer thin wrappers
- avoid generic frameworks
- no production-grade orchestration yet
- implement only what smoke tests require

---

## 12. Security Checklist

- [ ] Manifest permissions are minimal
- [ ] No remote code execution
- [ ] No `eval`
- [ ] No `unsafe-eval`
- [ ] No remote script imports
- [ ] Sentry is optional
- [ ] No sensitive user data in logs
- [ ] IndexedDB test data is deleted
- [ ] Message payloads are validated
- [ ] Errors do not expose internals to the UI
- [ ] Development-only actions are disabled in production

---

## 13. Documentation Deliverables

At Phase 1 completion, repository must contain:

### `README.md`

Must include:

- project purpose
- prerequisites
- install
- dev run
- production build
- Chrome load instructions
- smoke-test instructions
- troubleshooting

### `docs/PHASE_1_SMOKE_TEST.md`

Must include:

- exact steps
- expected results
- screenshots or logs
- pass/fail table

### `docs/PHASE_1_KNOWN_LIMITATIONS.md`

Must state:

- no PDF processing yet
- no file upload yet
- no download yet
- no licensing yet
- no production telemetry policy yet
- no cross-browser validation yet unless tested

### `docs/PHASE_1_COMPLETION_REPORT.md`

Must include:

- completed tasks
- build result
- test result
- known issues
- unresolved blockers
- recommended next step

---

## 14. Final Phase 1 Verification Table

| Check | Expected Result | Status |
|---|---|---|
| `npm install` | Success | Pending |
| `npm run dev` | Success | Pending |
| `npm run build` | Success | Pending |
| Chrome load | No errors | Pending |
| Popup render | Success | Pending |
| Background health | Success | Pending |
| Typed Messaging | Success | Pending |
| Offscreen open | Success | Pending |
| Offscreen health | Success | Pending |
| Offscreen close | Success | Pending |
| Offscreen reopen | Success | Pending |
| IndexedDB write | Success | Pending |
| IndexedDB read | Byte match | Pending |
| IndexedDB delete | Success | Pending |
| Logger | Success | Pending |
| Sentry test | Success or disabled by config | Pending |
| CSP | No violations | Pending |
| Repeated Popup test | Stable | Pending |
| Documentation | Complete | Pending |

---

## 15. Exit Criteria

Phase 1 can be marked complete when:

1. all mandatory Definition of Done items pass;
2. no P0 or P1 bugs remain;
3. extension builds from a clean checkout;
4. another person can follow README and load the extension;
5. smoke test passes on at least one supported Chrome version;
6. Phase 1 completion report is committed;
7. work on Phase 2 begins only after explicit approval.

---

## 16. Next Phase

After Phase 1 approval, proceed to Phase 2 from specification v3.3.0.

Do not automatically begin Phase 2 in the same branch.

Create a new branch:

```text
feature/phase2-localization
```

Before implementation, define:

- exact Phase 2 scope
- acceptance criteria
- test plan
- migration impact
- dependencies on Phase 1
