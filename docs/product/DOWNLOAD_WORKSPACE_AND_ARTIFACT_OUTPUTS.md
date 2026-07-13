# Download Workspace and Artifact Outputs

Status: Accepted Product Direction

Owner: Product / Architecture

Implementation timing: after current Phase 5 stabilization and Artifact Factory architecture approval

## Executive Summary

PDF Compressor should treat file processing and file delivery as two separate product concerns.

The processing pipeline should execute exactly once:

```text
Input PDF
→ Validate
→ Plan operation
→ Generate final PDF parts
→ Optional compression
→ Validate final PDF parts
```

After that, a separate Artifact Factory should convert the already validated PDF parts into one of several downloadable output forms:

```text
Validated PDF parts
→ Artifact Factory
   ├── Individual PDF files
   ├── One ZIP containing all parts
   └── One ZIP per part
```

The long-term download experience should also keep the user's root Downloads directory clean. The preferred direction is a single application workspace under:

```text
Downloads/PDF Compressor/
```

The extension should explain this behavior once, store the user's preference, and avoid repeatedly asking for confirmation during normal use.

This document defines the product direction. It does not yet authorize changes to manifest permissions, download APIs, folder creation, or automatic multi-download behavior.

## Product Goals

The download and artifact model should support several real user workflows without duplicating PDF processing logic.

### Compress only

```text
75 MB PDF
→ Compress
→ 60 MB PDF
```

The user receives one compressed PDF.

### Compress and split

```text
75 MB PDF
→ Optional compression
→ Split
→ Several validated PDF parts
```

The user may need the parts individually, in one combined archive, or packaged separately.

### Email-ready split

A common use case is an attachment-size limit.

```text
75 MB PDF
→ Compress
→ Still too large
→ Split into final artifacts below the user's target size
→ Send artifacts in separate emails
```

The final artifact may be either a PDF or a per-part ZIP depending on the selected output mode.

### Cloud upload

The same artifact model should later support destinations such as Google Drive, Dropbox, OneDrive, or another upload target without rerunning Split or Compression.

### Archive workflow

A user may prefer one ZIP containing all parts for simple storage, backup, or transfer.

## Core Product Principle

One processing run may produce multiple delivery formats, but the processing pipeline must not run more than once.

### Required invariant

```text
Split executes once.
Compression executes once per final part when enabled.
Validation executes once per final part.
Artifact generation consumes the validated parts.
```

### Explicitly prohibited architecture

```text
Split for Individual PDFs
Split again for One ZIP
Split again for Separate ZIPs
```

That would create duplicated logic, inconsistent outputs, unnecessary CPU and memory use, and higher regression risk.

## Artifact Philosophy

A PDF part and a downloadable artifact are not the same thing.

### PDF part

A PDF part is the final validated PDF output of the processing pipeline.

It has properties such as:

- part number;
- page start;
- page end;
- filename;
- byte size;
- validation status;
- compression diagnostics;
- warnings.

### Downloadable artifact

A downloadable artifact is a user-facing delivery object created from one or more final PDF parts.

Examples:

- one PDF file;
- one ZIP containing all PDF parts;
- one ZIP containing exactly one PDF part.

### Artifact Factory responsibility

The Artifact Factory must:

- consume already validated final PDF parts;
- never regenerate pages;
- never rerun Split planning;
- never rerun compression unless the product explicitly introduces a new future policy;
- preserve ordering and filenames;
- create deterministic artifact metadata;
- provide stable IDs for persistence and download;
- report actual artifact byte sizes;
- produce only artifacts that pass validation.

## Output Modes

## Mode 1: One ZIP containing all parts

This is the existing bulk-download behavior and remains the safest default.

```text
Final PDF parts
→ One combined ZIP
→ One download action
```

Typical use cases:

- archive;
- backup;
- transfer of many parts as one file;
- avoiding repeated browser downloads.

The per-part size limit still applies to PDF parts unless a future artifact-aware rule is explicitly implemented.

The combined ZIP may be larger than the per-part target because it is a bulk-download artifact.

## Mode 2: Individual PDF files

Each final PDF part becomes its own downloadable artifact.

```text
Final PDF parts
→ PDF artifact 1
→ PDF artifact 2
→ PDF artifact N
```

Typical use cases:

- sending several emails;
- attaching each part independently;
- uploading parts individually;
- opening or sharing only one range.

The UI should expose one explicit Download action per PDF artifact.

Automatic mass download is not required for the first implementation.

## Mode 3: Separate ZIP for each PDF part

Each final PDF part is packaged into its own ZIP.

```text
PDF part 1 → ZIP 1
PDF part 2 → ZIP 2
PDF part N → ZIP N
```

Each ZIP must contain exactly one deterministic PDF filename.

Typical use cases:

- mail systems or recipients that prefer archives;
- transfer rules that treat ZIP differently from PDF;
- separate delivery packages per page range.

The product must not assume ZIP reduces the PDF size. Actual ZIP bytes must be measured.

## Output Mode Independence

The output mode must not affect:

- page extraction;
- Split planning unless final-artifact size semantics require it;
- optional compression policy;
- validation rules;
- warning generation;
- page ordering;
- page coverage.

The same final PDF parts should feed all three modes.

## Canonical Artifact Model

The preferred future model is a parent result with child artifacts.

```typescript
type SplitOutputMode =
  | "individual-pdfs"
  | "single-zip"
  | "separate-zips";

type SplitResult = {
  id: string;
  sourceRecordId: string;
  outputMode: SplitOutputMode;
  partsCount: number;
  originalSize: number;
  totalArtifactSize: number;
  warnings: SplitWarning[];
  artifactIds: string[];
  createdAt: number;
  updatedAt: number;
};

type DownloadArtifact = {
  id: string;
  resultId: string;
  partNumber?: number;
  pageStart?: number;
  pageEnd?: number;
  filename: string;
  mimeType: "application/pdf" | "application/zip";
  byteSize: number;
  outputMode: SplitOutputMode;
  createdAt: number;
  updatedAt: number;
};
```

Binary payloads should remain in IndexedDB. Runtime messaging should return metadata and stable IDs only.

## Saved Metric

The user-facing Saved value must be based only on the final downloadable artifacts.

```text
totalArtifactSize = sum(all final artifact byte sizes)
savedBytes = max(originalSize - totalArtifactSize, 0)
```

For each output mode:

- `single-zip`: total size is the combined ZIP size;
- `individual-pdfs`: total size is the sum of final PDF artifacts;
- `separate-zips`: total size is the sum of all per-part ZIP artifacts.

Intermediate part sizes, candidate compressed sizes, and diagnostic totals must not drive the user-facing Saved metric.

## By File Size Semantics

The size limit must ultimately apply to the final artifact the user intends to send or upload.

### Individual PDF mode

The limit should apply to the final selected PDF part after optional `compressAfter` and fallback.

### Single combined ZIP mode

The limit should continue to apply to individual PDF parts. The combined ZIP is a bulk artifact and may exceed the limit.

### Separate ZIP mode

The ideal rule is:

```text
Candidate page range
→ Build PDF part
→ Optional compression
→ Create one-part ZIP
→ Measure actual ZIP bytes
→ Adjust page boundary
```

Until this final-artifact-aware planning is implemented, the product must not claim that every separate ZIP respects the configured limit.

If a ZIP exceeds the requested maximum, the UI should show a clear warning rather than silently misrepresenting the result.

## Download Workspace

The preferred long-term workspace is:

```text
Downloads/
└── PDF Compressor/
```

This avoids cluttering the root Downloads directory with many generated artifacts.

### Future structure

```text
Downloads/
└── PDF Compressor/
    ├── Compressed/
    ├── Split/
    ├── Merged/
    ├── OCR/
    └── Converted/
```

The subfolder structure is a future implementation decision. The top-level product name should remain short, recognizable, and suitable for future features.

Recommended top-level folder name:

```text
PDF Compressor
```

## First-Run Experience

The extension should not repeatedly ask the user about the workspace.

On the first relevant download, show one product-level explanation:

```text
PDF Compressor can organize generated files in:

Downloads/PDF Compressor/

This keeps your Downloads folder clean.

[Continue]
[Settings]
```

After the user selects Continue:

- store the preference;
- do not show the same product prompt again;
- use the configured workspace behavior for future downloads;
- allow the user to change the preference later.

This prompt is a product explanation, not a substitute for any browser or operating-system permission dialog.

## Settings Direction

A future setting may be:

```text
Download location

[x] Organize generated files in Downloads/PDF Compressor
```

Possible future options:

- use application workspace;
- use normal browser Downloads behavior;
- ask where to save each export;
- reset first-run download preference.

The first implementation should remain simple and reversible.

## Browser Constraints

The final implementation must be verified against current Chrome Extension behavior before permissions or APIs are added.

## Blob and anchor downloads

The current Blob plus `<a download>` pattern supports one explicit user-triggered download.

It does not provide reliable silent folder creation or clean multi-artifact organization.

## `chrome.downloads`

Potential benefits:

- deterministic relative paths;
- filenames such as `PDF Compressor/Split/document_part_001.pdf`;
- better support for application-managed download organization.

Potential costs:

- additional manifest permission;
- Chrome Web Store permission review considerations;
- user trust implications;
- interaction with browser download settings.

No permission should be added without a dedicated preflight and explicit approval.

## File System Access API

Potential benefits:

- user explicitly chooses a directory;
- application may write multiple files to that selected directory during an authorized session;
- good control over workspace location.

Potential constraints:

- availability and behavior across browsers;
- user gesture requirements;
- permission persistence rules;
- extension popup lifetime;
- additional UX complexity.

This requires a separate compatibility investigation.

## Multiple downloads

Automatic multi-download can trigger browser prompts or blocking.

The initial multi-artifact implementation should use one explicit Download button per artifact.

Automatic Download All and folder creation remain separate future features.

## Browser download settings

If the user has enabled a browser setting such as asking where to save every file, system dialogs may still appear. The extension cannot promise to suppress browser-controlled prompts.

## Email Workflow

Example product flow:

```text
Source PDF: 75 MB
Email target: 25 MB per message

Compress
→ 60 MB
→ Still too large

Split and optionally compress each part
→ Final validated parts

Choose output mode:
→ Individual PDFs
or
→ Separate ZIPs

Download each artifact
→ Send in separate emails
```

The product must use actual final artifact sizes rather than assuming compression or ZIP packaging will reduce size.

## Artifact Factory Architecture

The preferred architecture is a dedicated Artifact Factory layer after final part validation.

```text
Input PDF
→ Validation
→ Split planner
→ PDF part generation
→ Optional per-part compression
→ Final PDF part validation
→ Artifact Factory
   ├── IndividualPdfArtifactBuilder
   ├── CombinedZipArtifactBuilder
   └── PerPartZipArtifactBuilder
→ Artifact persistence
→ Metadata publication
→ User-triggered download
```

### Artifact Factory inputs

- ordered final PDF parts;
- output mode;
- source document stem;
- warnings;
- cancellation checker;
- progress reporter.

### Artifact Factory outputs

- ordered artifact metadata;
- artifact binary payloads for persistence;
- total artifact byte size;
- packaging warnings;
- deterministic filenames.

### Artifact Factory must not own

- Split planning;
- page extraction;
- image recompression;
- password policy;
- source PDF parsing;
- final PDF selection policy;
- license checks.

## Persistence Direction

The preferred model is:

```text
Split result parent record
+
N child artifact records
```

Why:

- avoids embedding many large binaries in one record;
- allows independent artifact reads;
- allows one button per artifact;
- allows atomic publication after all artifacts persist successfully;
- supports future cloud-upload state per artifact;
- keeps parent metadata small;
- makes cleanup and migration explicit.

A result should become visible to the Popup only after every expected artifact is persisted successfully.

On failure:

- do not publish partial success;
- remove newly written child artifacts;
- preserve any previous valid result until replacement is complete;
- map quota failure to `STORAGE_QUOTA_EXCEEDED`.

## Download UX

### Single ZIP

Show one Download ZIP button.

### Individual PDFs

Show a compact ordered list:

```text
Part 1
Pages 1-20
8.2 MB
[Download PDF]
```

### Separate ZIPs

Show a compact ordered list:

```text
Part 1 ZIP
Pages 1-20
8.3 MB
[Download ZIP]
```

Long lists may use a scrollable or collapsed result area, but unrelated Popup sections should not be redesigned as part of the first implementation.

## Future Licensing

The architecture must not depend on license state.

All output modes should exist as product capabilities.

Future licensing should only control access or visibility, for example:

```text
One ZIP with all parts          Free or Pro decision later
Individual PDF files            Free or Pro decision later
Separate ZIP for each part      Free or Pro decision later
```

Feature gating must not create different processing pipelines.

## Future Artifact Generators

The Artifact Factory may later support:

- PDF plus OCR text;
- PDF plus JSON metadata;
- cloud upload receipts;
- Google Drive export;
- Dropbox export;
- OneDrive export;
- email attachment preparation;
- TAR or another archive format;
- signed delivery package;
- preview package.

These must remain optional generators consuming the same validated PDF parts.

## Open Questions

The following topics remain unresolved and require dedicated preflight work:

1. Should the application use `chrome.downloads`?
2. What exact permission language will users see?
3. Will Chrome Web Store review consider the permission justified?
4. Can the extension safely create `PDF Compressor/...` relative download paths across supported platforms?
5. How does Chrome behave when Ask where to save each file is enabled?
6. Should users be able to rename the workspace?
7. Should each job receive its own subfolder?
8. Should Split use one shared folder or a timestamped/document-specific folder?
9. How should filename collisions be handled?
10. Should individual download actions remain available even when workspace organization is enabled?
11. Should a Download All action be added later?
12. How should Firefox and Safari handle the same product direction?
13. Should final-ZIP-aware by-size planning be required before Separate ZIP mode is advertised as email-ready?
14. Which output modes, if any, become Pro features?

## Recommended Delivery Sequence

### Step 1: Artifact Factory architecture

- introduce output-mode contract;
- introduce parent result plus child artifact model;
- preserve current single-ZIP behavior as default;
- no folder changes.

### Step 2: Individual PDF artifacts

- persist parts separately;
- show one Download button per PDF;
- no automatic multi-download.

### Step 3: Separate ZIP artifacts

- create one ZIP per part;
- validate each ZIP and contained PDF;
- show one Download button per ZIP.

### Step 4: Artifact-aware by-size semantics

- measure the final selected artifact;
- adjust page boundaries where required;
- emit warnings when a single page cannot fit.

### Step 5: Download workspace preflight

- evaluate `chrome.downloads`;
- evaluate File System Access API;
- confirm browser behavior and permission impact;
- select one implementation.

### Step 6: Download workspace implementation

- first-use explanation;
- persisted setting;
- `Downloads/PDF Compressor/` organization where supported;
- fallback behavior where unsupported.

### Step 7: Licensing decisions

- decide Free and Pro access after complete functionality is validated;
- apply feature gates without changing artifact architecture.

## Acceptance Direction

The future implementation should be considered successful when:

- Split and Compression execute once;
- the same validated parts feed all output modes;
- artifact metadata is deterministic;
- binary data never travels through Chrome runtime messaging;
- each artifact downloads independently;
- partial artifact sets never appear as success;
- current single-ZIP behavior remains backward compatible;
- Saved uses final artifact bytes;
- output-mode policy is independent of licensing;
- folder organization does not create repeated product prompts;
- browser-controlled permission dialogs are represented honestly.

## Decision

Accepted Product Direction.

The product will move toward:

```text
One processing pipeline
→ Artifact Factory
→ Multiple output modes
→ Optional organized Download workspace
```

All three output modes are intended to be fully implemented before final Free versus Pro decisions.

The download workspace direction is:

```text
Downloads/PDF Compressor/
```

Implementation remains gated by a dedicated browser-capability and permission preflight.
