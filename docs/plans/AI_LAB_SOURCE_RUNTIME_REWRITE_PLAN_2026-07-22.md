# AI Lab Clean Source Runtime Rewrite Plan

Date: 2026-07-22
Branch: `experiment/last-good-ai-build`
Status: execution plan

## Decision

Stop extending AI Lab execution behavior through generated postbuild patch scripts.

The target architecture is a normal source-built runtime compiled by WXT/TypeScript. Runtime behavior must live under `src/`, be imported by the popup entrypoint, be typechecked, unit tested, and bundled once by `wxt build --mode ai-lab`.

Postbuild may remain temporarily for static presentation-only work during migration, but it must not own business logic, workflow state, routing, persistence, completion, compression handoff, split dispatch, validation, or network configuration.

## Why this rewrite is required

The current `postbuild:ai` chain runs more than twenty sequential scripts that mutate generated output. Several scripts touch the same workflow and execution surfaces. This creates hidden ordering dependencies, competing owners, non-idempotent patches, stale defaults, and runtime behavior that TypeScript cannot verify.

The rewrite is not a cosmetic refactor. It replaces ambiguous runtime ownership with one explicit source-level execution system.

## Non-negotiable product contract

Canonical lifecycle:

`Planner -> Validated Target Contract -> Compress -> Validate Result Size -> PDF success OR Split compressed PDF -> Validate every part -> ZIP success`

Only two successful terminal states are allowed:

1. A compressed PDF whose byte size is at or below the active target.
2. A ZIP created from the compressed PDF after every generated part passes target validation.

Forbidden:

- completing from the compression start response;
- completing directly from a raw `compression:result` event before coordinator ownership;
- splitting the original selected PDF instead of the persisted compressed result;
- exposing PDF download before the target-size decision;
- presenting a ZIP before every part is validated;
- allowing Planner, UI components, message listeners, or postbuild scripts to complete execution independently.

## Target source architecture

### 1. Domain layer

Create `src/lib/ai-runtime/domain/`:

- `target-contract.ts`
  - immutable validated target contract;
  - target bytes derived once from confirmed user goal;
  - split policy and output mode;
  - no UI or browser dependencies.

- `execution-state.ts`
  - discriminated union for the complete workflow state machine;
  - legal state transitions only;
  - terminal states represented explicitly.

- `execution-events.ts`
  - typed internal events accepted by the reducer/coordinator;
  - no DOM CustomEvent contract as the primary source of truth.

- `execution-errors.ts`
  - stable typed error codes and terminal/non-terminal classification.

### 2. Coordinator

Create `src/lib/ai-runtime/execution-coordinator.ts`.

There will be exactly one execution owner: `AiExecutionCoordinator`.

Responsibilities:

- accept a validated target contract;
- begin compression through an injected compression port;
- claim compression result metadata;
- read and verify persisted compressed bytes by record ID;
- compare actual compressed byte length with target bytes;
- complete as PDF only when inside target;
- dispatch split only with the compressed PDF reference;
- validate every split artifact;
- continue division or fail explicitly when a part exceeds target;
- create and expose ZIP only after complete validation;
- publish state snapshots to the UI;
- ignore stale events from previous execution IDs;
- enforce cancellation and reset semantics.

The coordinator must not render UI and must not know React.

### 3. Ports/adapters

Create `src/lib/ai-runtime/ports.ts` with narrow interfaces:

- `CompressionPort`
- `CompressedResultStore`
- `SplitPort`
- `SplitArtifactStore`
- `PlannerPort`
- `RuntimeConfigPort`
- `ExecutionTelemetryPort`

Create adapters under `src/lib/ai-runtime/adapters/` using existing messaging and IndexedDB modules.

No coordinator code may call `browser.runtime.sendMessage`, IndexedDB helpers, `fetch`, or DOM APIs directly.

### 4. Planner and runtime configuration

Create source-owned runtime configuration:

- `src/lib/ai-runtime/runtime-config.ts`
- persisted through `browser.storage.local`;
- explicit Planner and Office base URLs;
- environment defaults selected at build time;
- no hard-coded localhost values inside generated scripts;
- no localStorage-based hidden overrides;
- URL validation at one boundary.

Planner response validation remains strict, but route-specific checks must be route-specific. A local recommendation must not be rejected because Office presets are unavailable.

Planner failure must produce an explicit planning failure/fallback state. It must never silently start processing.

### 5. React integration

Create `src/entrypoints/popup/ai-lab/`:

- `use-ai-execution.ts`
- `AiLabWorkflow.tsx`
- stage components with presentation-only responsibilities.

React subscribes to coordinator state and sends user intents. React does not own workflow transitions.

The existing popup may continue to render legacy non-AI tools, but the AI Lab path must enter through the source-built `AiLabWorkflow` component.

### 6. Observability

Every execution snapshot includes:

- `executionId`;
- `owner: "ai-execution-coordinator"`;
- current state;
- active contract ID;
- selected source record ID;
- compressed result record ID when available;
- target bytes;
- actual result bytes when available;
- last transition;
- timestamp.

Development logs are emitted from the coordinator through a telemetry port. Logs must prove ownership and artifact identity without exposing PDF content.

## State machine

Required states:

- `idle`
- `contract_ready`
- `planning`
- `plan_ready`
- `compressing`
- `claiming_compressed_result`
- `validating_compressed_result`
- `splitting`
- `validating_split_parts`
- `creating_zip`
- `completed_pdf`
- `completed_zip`
- `cancelling`
- `cancelled`
- `failed`

Each transition must be implemented through one reducer/transition function and exhaustively tested.

Direct transitions from `compressing` to either terminal state are forbidden.

## Migration strategy

The rewrite will be performed beside the legacy AI Lab implementation. We will not delete the current runtime until the source implementation passes parity and Chrome acceptance.

A temporary build flag selects the implementation:

- `legacy-patched`
- `source-runtime`

Default remains `legacy-patched` until the source runtime reaches final cutover acceptance. The flag must be source-owned and visible in build metadata.

## Execution phases

### Phase 0 — Baseline and freeze

Goal: prevent further drift while the source runtime is built.

Work:

- record current branch HEAD;
- preserve the existing recovery contract;
- declare execution-related postbuild scripts frozen;
- inventory every script that touches Planner, execution routing, target workflow, completion, split, and download;
- add a guard test that fails if new execution postbuild scripts are appended.

Acceptance:

- inventory committed;
- current legacy build still builds;
- no runtime behavior changes.

### Phase 1 — Domain contracts and state machine

Work:

- implement target contract in TypeScript source;
- implement execution state union;
- implement legal transition reducer;
- port existing Gate A invariants;
- add exhaustive transition tests.

Acceptance:

- invalid transitions fail deterministically;
- contract immutability and lifecycle retention pass;
- `npm run check` passes;
- no browser or DOM dependency in domain tests.

### Phase 2 — Coordinator skeleton and Gate B handoff

Work:

- implement coordinator with injected fake ports;
- compression start and result correlation by `executionId`;
- claim metadata and persisted compressed bytes reference;
- reject original selected PDF substitution;
- prohibit completion before ownership.

Acceptance:

- focused Gate B tests pass;
- stale/mismatched result events are ignored or fail safely;
- coordinator snapshot proves compressed artifact ownership;
- no size decision yet beyond entering validation state.

### Phase 3 — Deterministic size gate

Work:

- compare verified persisted byte length against contract target;
- complete as PDF only when inside target;
- route oversized result to split preparation;
- prohibit download exposure before decision.

Acceptance:

- boundary tests for below/equal/above target;
- result above target never enters `completed_pdf`;
- deterministic behavior across repeated runs.

### Phase 4 — Split compressed artifact

Work:

- implement split adapter;
- derive split limit/output mode only from active contract;
- pass compressed result record, never selected source;
- one split dispatch path.

Acceptance:

- identity tests prove compressed input;
- duplicate split dispatch is impossible;
- cancellation and stale split result tests pass.

### Phase 5 — Part validation and ZIP completion

Work:

- validate every part byte length and PDF signature;
- handle oversized part by continued division when supported or explicit terminal error;
- create ZIP only after complete validation;
- expose `completed_zip` only after ZIP persistence succeeds.

Acceptance:

- one invalid part prevents success;
- no partial or invalid ZIP is downloadable;
- all terminal success invariants pass.

### Phase 6 — Source Planner/config/network path

Work:

- move Planner client and config into source adapters;
- remove runtime URL injection scripts from the source-runtime path;
- use extension permissions and a documented server CORS contract;
- preserve deterministic fallback behavior;
- add contract tests for local and Office routes.

Acceptance:

- no localhost assumption unless selected explicitly by configuration;
- Planner endpoint and Office endpoint are independently configurable;
- network failures produce typed planner/connection states;
- Chrome runtime reaches compression without hidden console overrides.

### Phase 7 — React source UI integration

Work:

- connect AI Lab stages to coordinator snapshots;
- render buttons strictly from state capabilities;
- remove DOM-query routing and CustomEvent ownership from source-runtime mode;
- preserve current accepted UI text/layout unless necessary for correctness.

Acceptance:

- UI cannot display a terminal download in a non-terminal state;
- navigation/reset behavior is state-driven;
- React component tests cover each state.

### Phase 8 — Real Chrome acceptance

Run a fixed acceptance matrix:

1. Small PDF, target above compressed size -> PDF success.
2. Large PDF, target below compressed size -> split -> validated ZIP success.
3. Compression result record mismatch -> explicit failure, no download.
4. Oversized generated part -> continued split or explicit failure, no ZIP.
5. Planner unavailable -> visible fallback/failure, no processing.
6. Cancellation during compression.
7. Cancellation during split.
8. Popup close/reopen during active execution.
9. Repeated execution after reset.

Evidence required for each case:

- coordinator state trace;
- artifact record IDs;
- target and actual byte sizes;
- final UI screenshot;
- downloaded artifact validation.

### Phase 9 — Cutover and deletion

Only after Phase 8 acceptance:

- make `source-runtime` the default;
- remove execution-related postbuild scripts from `postbuild:ai`;
- delete legacy generated execution files and their codemod tests;
- retain only genuinely static build-time transformations temporarily;
- update `verify:ai` to fail if forbidden generated runtime files appear;
- remove feature flag after one accepted build.

Acceptance:

- `npm run build:ai` is idempotent;
- running build twice produces equivalent tracked/source behavior;
- no generated execution router is injected;
- TypeScript owns all execution behavior;
- full Chrome matrix passes after clean install.

## Postbuild classification

### Must be removed from execution path

- orchestrator debug runtime injection;
- Planner runtime injection;
- recommendation presenter runtime injection;
- execution router injection;
- target-size workflow injection;
- target-size detection/router-state fixes;
- rendered-plan fallback completion patch;
- target-workflow contract runtime injection;
- any script that attaches competing execution event listeners or calls completion.

### May remain temporarily

Only presentation/static transformations that do not own state or behavior, such as palette/build label work, and only until they are migrated normally into source CSS/components.

## Test policy

Every phase follows this sequence:

1. identify ownership and competing handlers;
2. add the smallest source implementation;
3. add focused unit tests;
4. run `npm run check`;
5. run relevant tests;
6. run `npm run build:ai` once;
7. perform real Chrome runtime test when the phase touches runtime behavior;
8. commit accepted phase;
9. continue only after acceptance.

No `postbuild:ai` command is run separately.

## Commit policy

One accepted phase per commit series. Commit prefixes:

- `test(ai-runtime): ...`
- `feat(ai-runtime): ...`
- `refactor(ai-runtime): ...`
- `chore(ai-runtime): ...`

Infrastructure changes must not be mixed into coordinator/domain commits.

## Immediate next action

Start Phase 0 only.

Produce the execution postbuild ownership inventory and a guard test. Do not change runtime behavior, endpoints, Planner logic, UI, or server configuration in Phase 0.
