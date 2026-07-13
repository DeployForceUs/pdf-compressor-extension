# Executive Summary

The exact failing Split sample is `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`, not the earlier scan PDF. The file is byte-stable through selection storage and worker transfer, but `pdf-lib` rejects it before Split planning because the PDF is encrypted. MuPDF opens it successfully and reports 220 pages. The current Split runtime maps that parser failure to `INVALID_PDF`, which is technically too generic for this file.

Root cause classification: `MULTIPLE_CAUSES`.

# Clarified Manual Acceptance Facts

- The general Split pipeline works on a separate one-page control PDF with `range: 1` and `compressAfter: false`.
- `range 1-2` is invalid on that control because page 2 does not exist.
- The failing benchmark file is `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`.
- The same file fails with both by-pages and by-size strategies.
- The user-facing error is always:
  - `Split failed`
  - `Input file is not a valid PDF`
- No ZIP result is created and no Download ZIP button appears.

# Canon Benchmark Identification

| Field | Value |
|---|---|
| Filename | `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf` |
| Absolute path | `/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf` |
| File size | `5,756,013` bytes |
| SHA-256 | `7fb74a770eaf5fd7320b709aeca144d6736d747a2952e95b443662983395aab4` |
| Page count | `220` |

Structure notes:
- Trailer contains `/Encrypt 1438 0 R`.
- `startxref` is present and the file ends with `%%EOF`.
- No `/Linearized`, `/ObjStm`, `/Prev`, or `/Hybrid` markers were found in the file text scan.

# Successful Control PDF

The one-page control PDF succeeds because it is a normal PDF that reaches Split planning and ZIP creation. The Canon benchmark file fails earlier, at the shared source-load boundary. The control does not show the same `/Encrypt` trailer entry.

# Direct pdf-lib Result

Direct load of the Canon benchmark file with `PDFDocument.load(bytes)` fails immediately:

- exception class: `Error`
- exception message: `Input document to \`PDFDocument.load\` is encrypted. You can use \`PDFDocument.load(..., { ignoreEncryption: true })\` if you wish to load the document anyways.`
- stack location: `pdf-lib/cjs/api/errors.js:12` and `pdf-lib/cjs/api/PDFDocument.js:130`

Loading the same bytes with `ignoreEncryption: true` succeeds and reports `220` pages.

# Direct MuPDF Result

MuPDF opens the same bytes successfully:

- open: `PASS`
- `needsPassword()`: `false`
- `wasRepaired()`: `false`
- `countPages()`: `220`

This is not a byte-corruption case.

# IndexedDB Integrity

The popup selection path is shallow by design:

- `validatePdfFile()` checks only extension, MIME type, size, and `%PDF-` signature.
- `persistPdfFile()` writes the file bytes to the selected-PDF record and immediately reads them back.
- The code compares the original bytes against the read-back bytes before setting the selection to `ready`.

Relevant code:
- `src/lib/pdf-validation.ts:40-69`
- `src/entrypoints/popup/main.tsx:826-923`

There is no evidence of IndexedDB byte mutation here. The file becomes `ready` because the storage round-trip passes, not because the PDF has been opened by a parser.

# Worker Transfer Integrity

The Split worker boundary preserves the bytes:

- `runSplitJob()` converts the stored `number[]` into an `ArrayBuffer`.
- `getSplitWorkerGateway()` transfers that buffer to the worker with Comlink.
- A transfer probe on the exact file bytes showed:
  - source `ArrayBuffer.byteLength` before transfer: `5,756,013`
  - source `ArrayBuffer.byteLength` after transfer: `0`
  - worker-side buffer `byteLength`: `5,756,013`
  - SHA-256 before and after transfer: identical

So the failure is not caused by detachment or transfer corruption.

# Split Runtime Trace

Observed path:

1. Popup accepts the file and marks it `Ready`.
2. Background forwards the Split request to offscreen.
3. Offscreen reads the selected PDF record from IndexedDB.
4. Offscreen sends the bytes to the worker.
5. `runSplitJob()` emits:
   - `validating`
   - `planning-parts`
6. The worker enters `createSplitZipArchive()`.
7. `PDFDocument.load(new Uint8Array(request.inputBytes))` throws.
8. The worker never reaches range planning, page copy, part validation, or ZIP creation.

Relevant code:
- `src/lib/offscreen/split-runtime.ts:52-97`
- `src/lib/pdf/split-archive.ts:523-529`
- `src/lib/offscreen/main.ts:429-446`

# Original Exception

Exact failure from `pdf-lib`:

- `Error: Input document to \`PDFDocument.load\` is encrypted. You can use \`PDFDocument.load(..., { ignoreEncryption: true })\` if you wish to load the document anyways.`

This is the real underlying exception. The Split runtime wraps it as `INVALID_PDF`.

# Error Mapping

`INVALID_PDF` is not technically accurate for this document.

The file is a valid encrypted PDF, not a malformed PDF. The current mapping collapses a parser-encryption failure into a generic invalid-PDF message:

- source failure: encrypted document rejected by `pdf-lib`
- runtime mapping: `Input file is not a valid PDF`

That message explains the user symptom, but not the actual condition.

# PDF Structural Findings

- The file is structurally intact enough for MuPDF to open without repair warnings.
- The trailer shows `/Encrypt 1438 0 R`.
- `startxref` points to `5727055`.
- `%%EOF` is present.
- MuPDF reports 220 pages and `wasRepaired() === false`.
- `pdf-lib` only succeeds when `ignoreEncryption: true` is supplied.

This points to encrypted-PDF compatibility, not raw corruption.

# Root Cause

`MULTIPLE_CAUSES`

Why the control PDF succeeds:
- it is a normal unencrypted PDF
- `pdf-lib` loads it
- Split planning proceeds normally

Why the Canon benchmark file fails:
- it is encrypted
- `pdf-lib` rejects it before planning
- the Split runtime turns that parser exception into `INVALID_PDF`

Why this is not transport or storage corruption:
- selection storage round-trips bytes unchanged
- worker transfer preserves the bytes and detaches the sender buffer as expected
- MuPDF opens the file cleanly

Why the UI state is misleading:
- the selection path only performs shallow validation
- `Ready` means the file was stored and read back, not that Split can parse it
- the error label hides the encrypted-PDF detail

Conclusion: the failure is primarily a `pdf-lib` encrypted-PDF incompatibility, compounded by shallow selection validation and generic error mapping.

# Confidence Level

High.

The file identity, encrypted trailer entry, direct `pdf-lib` failure, MuPDF success, transfer integrity, and code-path trace all agree.

# Why the Control PDF Succeeds

The control PDF is not encrypted, so the Split helper can open it, plan pages, build parts, and create ZIP output. The Canon benchmark never reaches those stages because parser load fails first.

# Why the Canon PDF Fails

It is encrypted, `pdf-lib` rejects encrypted inputs by default, and the Split runtime does not supply `ignoreEncryption: true` or any alternate encrypted-PDF path.

# No Fix Implemented

No runtime behavior was changed. No repair, fallback, or validation logic was added.

# Recommended Fix Options

1. Add an explicit encrypted-PDF preflight and show a dedicated user-facing message.
2. Keep `INVALID_PDF` only for structurally malformed inputs, not encrypted ones.
3. If encrypted PDFs must be supported later, add an intentional password or decryption path rather than relying on generic `pdf-lib` load.
4. Consider deep parser validation at selection time if the product wants `Ready` to mean Split-compatible.

# Recommended Next Step

Add a distinct encrypted-PDF compatibility check in the Split preflight path, so the file is classified correctly before the user presses `Split PDF`.
