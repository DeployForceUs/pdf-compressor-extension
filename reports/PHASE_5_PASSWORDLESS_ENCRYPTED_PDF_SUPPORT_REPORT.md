# Summary

This slice adds controlled Split support for passwordless encrypted PDFs only. The exact Canon benchmark file `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf` is accepted when `pdf-lib` rejects the default load because the document is encrypted, MuPDF opens the same bytes without requiring a password, and `PDFDocument.load(bytes, { ignoreEncryption: true })` succeeds. Password-required PDFs still fail with a dedicated `ENCRYPTED_PDF` error. Malformed PDFs still fail as `INVALID_PDF`.

# Root Cause Reference

The forensic report confirmed the Canon benchmark file contains an `/Encrypt` trailer entry, opens in MuPDF, and is rejected by default `pdf-lib` load. The runtime was mapping that encryption-specific failure to `INVALID_PDF`, which was too generic for this class of document.

Reference: `reports/PHASE_5_CANON_SPLIT_EDGE_CASE_FORENSIC.md`

# Compatibility Policy

Split now follows this rule:

1. Try `PDFDocument.load(bytes)`.
2. If it succeeds, continue unchanged.
3. If it fails because the PDF is encrypted, inspect the source with MuPDF.
4. If MuPDF reports `needsPassword() === true`, reject with `ENCRYPTED_PDF`.
5. If MuPDF reports `needsPassword() === false`, retry with `PDFDocument.load(bytes, { ignoreEncryption: true })`.
6. If the retry succeeds, continue Split normally.
7. If the retry fails, return `INVALID_PDF` only when the source is actually malformed.

This keeps passwordless encrypted PDFs supported without broadening support to password-protected documents.

# Source Loader Design

Added a narrow Split source loader in `src/lib/pdf/split-source-loader.ts`.

Behavior:

- default load path remains `pdf-lib` without special flags
- encrypted fallback is isolated in one helper
- MuPDF is injected from the caller, so the browser bundle does not pull in the native Node module
- the same helper validates generated split parts with both `pdf-lib` and MuPDF

# Encryption Detection

Encryption detection is explicit:

- `pdf-lib` encryption failure is recognized through `EncryptedPDFError` and the stable encrypted-load message
- MuPDF decides whether the file actually requires a password
- the Split runtime distinguishes `ENCRYPTED_PDF` from `INVALID_PDF`

# MuPDF Password Check

For the Canon benchmark file:

- `MuPDF open`: pass
- `needsPassword()`: false
- `wasRepaired()`: false
- page count: 220

For the password-protected local fixture:

- `MuPDF open`: pass
- `needsPassword()`: true
- Split rejects with `ENCRYPTED_PDF`

# pdf-lib Retry Behavior

Observed behavior for the Canon benchmark file:

- `PDFDocument.load(bytes)` fails with the encrypted-document error
- `PDFDocument.load(bytes, { ignoreEncryption: true })` succeeds
- page count remains 220

This is the compatibility gate used by the new Split path.

# Canon Benchmark Results

Exact file:

- filename: `Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`
- absolute path: `/Users/dmitriikarpov/Downloads/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01-compressed (1).pdf`
- size: `5,756,013` bytes
- SHA-256: `7fb74a770eaf5fd7320b709aeca144d6736d747a2952e95b443662983395aab4`
- page count: `220`

The same exact file now passes Split source loading through the passwordless-encrypted compatibility path.

# By Pages Results

Tested with `pagesPerPart: 20`.

Result:

- parts created: 11
- final range: 201-220
- every output part reopened successfully
- aggregate page coverage: 220 pages
- ZIP archive round-trip succeeded

# By File Size Results

Tested with `maxPartSizeBytes: 1 * 1024 * 1024`.

Result:

- split completed successfully
- more than one output part was produced
- every part reopened successfully
- aggregate page coverage: 220 pages
- output parts remained unencrypted

# Manual Selection Results

Tested with the valid range order:

- `1-5`
- `6-12`
- `13`
- `14-30`

Result:

- parts created: 4
- input order preserved
- each part reopened successfully
- aggregate page coverage for the exercised ranges was correct

# Output Encryption Assessment

Generated Split parts are unencrypted.

Validation for output parts:

- `%PDF-` header present
- `pdf-lib` reopen pass
- MuPDF reopen pass
- expected page count preserved
- no password requirement

# Error Taxonomy

Current Split error mapping:

- `INVALID_PDF`: malformed input, bad parser state, or genuinely invalid PDF
- `ENCRYPTED_PDF`: encrypted and password-required source
- `PART_VALIDATION_FAILED`: generated part failed reopen or page-count checks

# Invalid PDF Behavior

Malformed PDFs still fail as `INVALID_PDF`.

The compatibility loader does not retry `ignoreEncryption` for arbitrary parser errors. It only retries when the failure is specifically the encrypted-document case.

# Password-Protected PDF Behavior

Password-protected PDFs remain unsupported in this slice.

Observed behavior:

- MuPDF reports `needsPassword() === true`
- Split returns `ENCRYPTED_PDF`
- no partial ZIP or part output is created

# Regression Matrix

| Case | Result |
|---|---|
| Normal unencrypted PDF | Default `PDFDocument.load` path unchanged |
| Malformed PDF | `INVALID_PDF` |
| Password-protected PDF | `ENCRYPTED_PDF` |
| Canon benchmark PDF | Supported through ignore-encryption retry |
| By-pages split | Pass |
| By-size split | Pass |
| Manual ranges | Pass |
| `compressAfter: false` | Unchanged |
| `compressAfter: true` | Still compatible in the tested path |
| ZIP persistence | Pass |
| Split cancellation behavior | Preserved |

# Page Count UI Regression Follow-up

The popup still does not display page count at selection time.

Current state:

- `SelectedPdfSnapshot` has no `pageCount` field
- selection persistence stores file metadata and storage verification only
- the file-details UI renders name, size, validation status, and selected state, but not page count

This is a separate UI/state follow-up and was not changed in this slice.

# Manual Chrome Validation Required

Automated validation is complete, but the manual Chrome acceptance pass is still required for the release gate:

- select the exact Canon file in the popup
- verify by-pages with 20 pages per part
- verify by-size with 1 MB
- verify one valid manual selection
- download and open the ZIP
- open several output parts
- confirm password-required PDFs show `ENCRYPTED_PDF`

# Files Changed

- `src/lib/pdf/split-source-loader.ts`
- `src/lib/pdf/split-archive.ts`
- `src/lib/pdf/split-errors.ts`
- `src/entrypoints/popup/main.tsx`
- `src/locales/en/translation.json`
- `src/locales/es/translation.json`
- `tests/phase5_slice9_passwordless_encrypted_split.test.ts`
- `reports/PHASE_5_PASSWORDLESS_ENCRYPTED_PDF_SUPPORT_REPORT.md`

# Risks

- Manual Chrome acceptance is not yet re-run in this commit state.
- Page count display remains a UI gap and can still confuse users about readiness.
- Passworded PDFs are intentionally still rejected.

# Acceptance Checklist

- [x] Exact Canon benchmark identified
- [x] Default `pdf-lib` failure classified as encryption, not malformed input
- [x] MuPDF passwordless check validated
- [x] `ignoreEncryption: true` retry validated
- [x] Password-required PDF rejected with `ENCRYPTED_PDF`
- [x] Canon by-pages split validated
- [x] Canon by-size split validated
- [x] Canon manual split validated
- [x] Output parts reopen successfully
- [x] `npm run check`
- [x] `npm run build`
- [x] Focused compatibility test passed
- [ ] Manual Chrome acceptance pass

# Git

Branch target: `feature/phase5-pdf-split`

Status at report time: working tree not yet committed
