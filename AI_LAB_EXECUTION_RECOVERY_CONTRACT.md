# AI Lab Execution Recovery Contract

## Project

PDF Compressor AI Lab / OpenAI Build Week

## Repository and isolation boundary

Primary repository checkout:

`~/pdf-compressor-extension`

Recovery worktree:

`~/pdf-compressor-last-good`

Recovery branch:

`experiment/last-good-ai-build`

The primary branch must not be changed while recovery work is in progress. All architecture recovery, implementation, tests, builds, commits, and Chrome runtime checks must happen only in the isolated worktree and branch above.

## Why this recovery branch exists

The AI Lab runtime accumulated a cascade of sequential postbuild patches around Planner, target-size routing, completion, IndexedDB handoff, split, ZIP, Office fallback, and recovery behavior.

The following historical commits were checked during recovery attempts:

- `512b829`
- `11c006a`
- `8bf5319`
- `f410fb1`

None reliably reproduced the previously observed successful Chrome flow where a compressed PDF exceeding the Email delivery target continued into split and produced a ZIP with multiple PDF parts. Commit archaeology is therefore closed. Recovery must proceed from an explicit contract and one lifecycle owner, not from further historical checkout testing.

## Architectural decision

We are not rewriting the whole product.

We are rebuilding one canonical execution contract and one post-compression lifecycle on the isolated branch because independent patches began competing with one another.

## Canonical workflow

```text
Planner
→ Validated Target Contract
→ Compress
→ Validate Result Size
→ result <= target: Download PDF
→ result > target: Split compressed PDF
→ Validate every part
→ Create ZIP
→ Download ZIP
```

## Non-negotiable completion rule

`renderComplete()` is forbidden until:

1. the compressed result size has been validated against the active target contract; and
2. when the result exceeds the target, split and ZIP creation have fully completed.

A compressed result above the target must never fall back to `Download processed PDF`.

## Email 10 MB contract

For the Email delivery target, the validated contract must include:

```text
targetPartSizeMb = 10
splitEnabled = true
outputMode = single-zip
```

The contract must be immutable after confirmation and remain available until terminal success or terminal failure.

## Planner boundary

Planner recommends a plan. Planner must not:

- complete the workflow;
- choose the final download action;
- call a completion handler;
- bypass the execution coordinator;
- silently replace or discard the validated target contract.

## Execution coordinator ownership

Exactly one execution coordinator must own:

```text
compressed result
→ size gate
→ PDF or split
→ ZIP
→ completion
```

After compression, all size validation and split processing must use the compressed PDF, never the original PDF.

## Forbidden during Gates A-F

- Multiple independent completion handlers.
- Direct completion from Planner, Office fallback, compression callbacks, message listeners, or recovery patches.
- PDF download fallback when the result exceeds the active target.
- Loss or mutation of the validated target contract after confirmation.
- Cosmetic work before functional Gate acceptance.
- New spinner, progress, layout, palette, or unrelated UI patches.
- Additional commit archaeology unless this contract is explicitly amended.
- Manual development inside generated `.output` files.
- Adding another postbuild patch to compensate for an existing postbuild patch.

Generated runtime may be inspected only for smoke-test evidence. Source-of-truth logic must live in maintained source modules.

## Gate sequence

### Gate A — Contract

Email 10 MB creates and stores an immutable validated target contract.

Acceptance:

- exact target is 10 MB;
- split is enabled;
- output mode is `single-zip`;
- invalid Planner data is rejected or normalized at one boundary;
- reset operations cannot accidentally erase an active confirmed contract;
- unit tests prove contract creation, validation, immutability, and lifecycle retention.

### Gate B — Compression handoff

The compressed PDF result is passed to the single execution coordinator.

Acceptance:

- coordinator receives compressed result metadata and persisted bytes reference;
- original selected PDF is not substituted;
- no completion path runs before coordinator ownership begins.

### Gate C — Size gate

Acceptance:

- result within target completes as PDF;
- result above target never exposes PDF download before split;
- decision is deterministic and unit tested.

### Gate D — Split

Acceptance:

- split receives the compressed PDF;
- split request derives its size limit and output mode only from the active contract;
- one dispatch path exists.

### Gate E — Validation

Acceptance:

- every generated PDF part is validated against the target;
- an oversized part causes continued division or an explicit terminal error;
- no invalid ZIP is presented as success.

### Gate F — Completion

Only two successful terminal states are allowed:

1. PDF inside target.
2. ZIP after the compressed result exceeded target and all parts passed validation.

## Mandatory workflow for every Gate

Work on one Gate only:

1. Identify the current state owner and all competing handlers touching that Gate.
2. Remove or disable competing ownership.
3. Add the smallest source-level implementation.
4. Add focused unit tests.
5. Run typecheck and relevant tests.
6. Run `npm run build:ai` once. Do not run `npm run postbuild:ai` separately because npm automatically runs it through the lifecycle and the current patches are not idempotent.
7. Perform a real Chrome runtime test.
8. Commit the accepted Gate.
9. Start the next Gate only after acceptance.

## Current known runtime structure

The normal React Popup runtime is built into a hashed `popup-*.js` chunk.

The AI Lab execution layer is generated separately as:

`.output/chrome-mv3-ai-lab/ai-lab-execution-router.js`

The generated router is currently produced and then modified by a sequence of postbuild scripts, including execution-router, Office fallback, target-size workflow, router-state recovery, rendered-plan fallback, and target-workflow contract patches.

This confirms the recovery root cause: multiple non-idempotent string-rewrite patches compete for lifecycle ownership.

The recovery direction is to move canonical contract and lifecycle logic into maintained source modules and reduce generated postbuild logic to one thin integration boundary.

## Local services

Office Engine:

```bash
cd ~/pdf-compressor-last-good
npm run engine:start
```

Port: `8787`

Planner:

```bash
cd ~/pdf-compressor-last-good
npm run planner:start
```

Port: `8791`

Office health endpoint:

`http://127.0.0.1:8787/api/v1/health`

Planner endpoint:

`POST http://127.0.0.1:8791/api/v1/ai/plan`

## Local dependency note

A historical `npm install` in the recovery worktree failed with `Invalid Version`. `node_modules` may temporarily be a symlink from the primary checkout. The symlink must not be committed. This is an environment constraint, not a reason to resume commit archaeology.

## Session entry rule

At the start of every new implementation session:

1. Read this file from branch `experiment/last-good-ai-build`.
2. State the current Gate.
3. Confirm that the primary branch will not be modified.
4. Make no cosmetic changes.
5. Give the user one exact local command at a time when local action is required.

## Current starting point

Current Gate: **Gate A — Contract**

Before changing implementation code, inspect maintained source and the current postbuild integration only enough to determine:

- where target contract data originates;
- where active contract state is stored;
- which reset paths can erase it;
- which handlers can currently complete processing;
- the minimal source-level seam for one immutable contract owner.

Do not resume broad generated-runtime archaeology. Do not change UI. Do not touch the primary branch.
