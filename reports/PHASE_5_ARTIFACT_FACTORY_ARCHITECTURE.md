# Executive Summary

> **Canonical numbering:** This historical Phase 5 Split report belongs to specification Stage 6. See [`../docs/PHASE_ROADMAP.md`](../docs/PHASE_ROADMAP.md).
The current Split implementation is a single-result pipeline: it plans, builds, optionally compresses, validates, and then persists one ZIP archive. That contract is stable, but it is too narrow for the requested output redesign.

The right extension is a dedicated `ArtifactFactory` stage that runs only after the final PDF parts have already been produced and validated exactly once. The factory should never re-split, re-compress, or re-validate parts. It should only convert finalized parts into downloadable artifacts for the selected output mode.

Recommended architecture: `ArtifactFactory` with a parent `SplitResultBundle` record and child artifact records. This preserves the single-execution invariant, keeps runtime messaging binary-free, and supports all three output modes without duplicated split logic.

# Current Architecture
The current pipeline is linear:

1. Input PDF is loaded and validated.
2. Split strategy is planned.
3. PDF parts are generated from the source document.
4. Optional `compressAfter` runs per part.
5. Each final part is validated.
6. All parts are packed into one ZIP.
7. A single `SplitResultRecord` is persisted.
8. The popup restores one result and offers one download action.

Relevant current shapes:

- `SplitResultRecord` stores one `ArrayBuffer` named `data`.
- `SplitResultMetadata` exposes one `zipBlobId`.
- `split-results` persistence stores one record under one key.
- Popup download reads one ZIP blob from IndexedDB and creates one download.
- Progress and warning events are already per-part, but the final result is one artifact.

# Weaknesses
The current model is optimized for a single ZIP output and becomes brittle when expanded to multiple artifact types.

1. The result model conflates split output with one downloadable blob.
2. Persistence assumes one stored binary payload per split job.
3. The popup restore path assumes one record and one download button.
4. Messaging would become awkward if it tried to transport binary blobs for multiple outputs.
5. By-file-size semantics are currently tied to part generation, not to the size of the downloadable artifact.

In short, the split engine is already properly isolated, but the output layer is not.

# Artifact Factory Design
Use a dedicated `ArtifactFactory` rather than `ArtifactBuilder` or `ArtifactPipeline`.

Why `ArtifactFactory`:

- It describes the job correctly: turning finalized PDF parts into output artifacts.
- It implies creation from an already complete input set, not further processing.
- It keeps the split engine upstream and immutable.

Proposed model:

`ValidatedSplitBundle` -> `ArtifactFactory` -> `SplitArtifactBundle`

`SplitArtifactBundle` should contain:

- bundle id
- source file metadata
- split strategy metadata
- validation summary
- warnings
- output mode
- `artifacts: SplitArtifact[]`

Each `SplitArtifact` should contain:

- id
- kind: `pdf` | `zip`
- filename
- mimeType
- pageRange
- partNumber
- byteLength
- storage key / blob id
- download label
- status

The factory should be pure with respect to split logic: it receives finalized part bytes and returns artifact descriptors plus persistence instructions.

# Storage Design
Recommend parent + child records.

Parent record:

- one `SplitResultBundle` record
- holds job metadata, output mode, summary stats, warnings, and the ordered artifact manifest
- no raw binary blobs

Child records:

- one record per artifact
- stores the actual bytes for that artifact
- keyed by artifact id

Why this is the right storage model:

- avoids duplicating part bytes inside a giant parent record
- supports per-artifact download and cleanup
- supports restore after popup reopen
- keeps IndexedDB access simple and explicit
- allows future output modes without changing the split engine again

A single record is too narrow once there are multiple outputs. A fully normalized parent/child model is the cleanest boundary.

# Messaging Design
Runtime messaging should expose manifests only, never binary blobs.

Recommended flow:

1. Split worker returns a `SplitArtifactBundle` manifest plus storage ids.
2. Offscreen persists child artifact bytes to IndexedDB.
3. Popup receives the manifest and renders available artifacts.
4. Each download action requests one artifact by id from storage.

Messages should carry:

- output mode
- artifact ids
- filenames
- mime types
- byte lengths
- page ranges
- summary statistics

Messages should not carry:

- raw artifact bytes
- ZIP payloads
- PDF part blobs

This keeps the worker boundary stable and avoids Transferable churn for multi-artifact output.

# Download Design
Each artifact needs its own download action.

Recommended behavior:

- Individual PDF mode: one download button per part.
- One ZIP mode: one download button for the single ZIP artifact.
- Separate ZIP-per-part mode: one download button per ZIP artifact.

Do not add automatic multi-download or folder creation in this phase.
Do not rely on `chrome.downloads` for the architecture decision; the popup can still use object URLs for local downloads if that remains the existing pattern.

The download helper should accept an artifact id, load that artifact from storage, validate the bytes, and create exactly one download.

# Output Modes
All three output modes should be implemented as ArtifactFactory strategies, not as alternate split pipelines.

1. Individual PDF files

- artifact count equals finalized part count
- each artifact is the validated PDF part bytes
- no ZIP packaging

2. One ZIP with all parts

- one artifact only
- artifact bytes are the ZIP archive of all final parts
- this is the current behavior and should remain the default

3. Separate ZIP per part

- one ZIP artifact per finalized part
- each artifact packages exactly one PDF part
- useful for email delivery or per-part handoff

This keeps split generation single-pass and moves all variation into the artifact layer.

# Future Licensing
Licensing should remain orthogonal to artifact architecture.

The output mode should be selectable in the product model regardless of license gating. Future gating can then disable UI access to one or more modes without changing the split engine or artifact factory.

Recommended rule:

- the artifact model always supports all three modes
- licensing only controls whether the popup exposes a given mode

That keeps monetization out of the core data contract.

# By File Size Semantics
The correct place for future artifact-aware size planning is after validated PDF-part generation but before final artifact persistence, inside or adjacent to `ArtifactFactory`.

Reason:

- by-size split planning currently determines page grouping from PDF part sizes
- downloadable artifact size can differ from PDF part size depending on output mode
- ZIP output is especially sensitive to packaging overhead

Recommended rule:

- split planning continues to operate on PDF-part byte size
- artifact-aware size checks are applied only when a specific output mode makes them relevant
- if a future requirement is “max downloadable artifact size,” the sizing policy must be mode-aware

Do not move this concern into the page planner unless the planner itself is being changed to model artifact bytes.

# Recommended Slices
Smallest shippable slices with rollback safety:

1. Introduce an internal `SplitArtifactBundle` manifest type and keep the current ZIP behavior as the only emitted mode.
2. Persist child artifact records alongside the parent split result, still exposing only the ZIP UI.
3. Add `Individual PDF files` as a second output mode using the same finalized parts.
4. Add `Separate ZIP per part` as a third output mode using the same finalized parts.
5. Add licensing gates on top of the existing artifact model, without changing the engine.

Each slice should preserve:

- one split execution
- one compression execution per eligible part
- one validation pass per final part
- one artifact generation pass per selected output mode

# Risks
The main risks are structural, not algorithmic.

- storage growth if all artifacts are persisted eagerly
- restore complexity when the popup reopens mid-job or after completion
- duplicate cleanup bugs if parent and child records are not deleted together
- confusion if the UI exposes artifact download actions before persistence completes
- future size-limit semantics becoming ambiguous if artifact mode is ignored

These are manageable if the manifest/child-record boundary is introduced early.

# Final Recommendation
Implement a single `ArtifactFactory` backed by a parent `SplitResultBundle` and child artifact records.

That is the architecture I would ship:

- one split execution
- one validation execution
- one artifact-generation layer
- multiple output modes without duplicate split logic
- binary-free runtime messaging
- per-artifact download actions

This is a clear conditional go: the design is sound and compatible with the current codebase, but it should be introduced as a contract migration rather than a UI tweak.
