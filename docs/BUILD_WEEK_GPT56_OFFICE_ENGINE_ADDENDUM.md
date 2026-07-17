# Build Week GPT-5.6 and Office Engine Specification Addendum

**Status:** Approved for the time-boxed Build Week technical spike  
**Approved by:** Project owner  
**Approval date:** 2026-07-17  
**Implementation branch:** `feature/phase11-office-engine-buildweek-spike`  
**Parent:** merge commit of Stage 8 PR #9  
**Execution plan:** [`OPENAI_BUILD_WEEK_EXECUTION_PLAN.md`](./OPENAI_BUILD_WEEK_EXECUTION_PLAN.md)

---

## 1. Authority and scope

This addendum extends `pdf_compressor_spec_v3.3.0.md` only for the OpenAI Build Week submission. The canonical specification remains authoritative for existing Compression, Split, Free/Pro, retention, localization, and accessibility behavior.

Approved sequencing exception:

- Stage 8 is complete and merged.
- Stage 5 JPEG2000 remains paused.
- Stage 9 and Stage 10 remain canonical future stages.
- A narrow Stage 11 technical spike may begin before Stage 9/10 because the Build Week deadline requires a working GPT-5.6 runtime integration and judge-accessible processing path.
- This exception does not mark all Stage 11 production requirements complete.

The Build Week spike must not silently absorb unrelated specification gaps such as URL/viewer acquisition, JPEG2000, publication automation, full enterprise licensing, or general OCR.

## 2. Approved product definition

The contest product is:

> A privacy-preserving PDF processing system in which GPT-5.6 creates a bounded processing plan from a user goal and non-content technical metrics, while a deterministic Local Engine or Office Engine processes and validates the actual PDF.

Primary message:

> GPT-5.6 plans the workflow. Your controlled hardware processes the document.

Optional enhancement, gated behind completion of the core path:

> With separate explicit consent, GPT-5.6 may compare selected before/after page previews and return a bounded visual quality assessment.

The project is not being changed into a separate PDF AI Enhancer, OCR product, table extractor, searchable-PDF generator, or second Extension.

## 3. Approved model and API decisions

- Runtime model: `gpt-5.6`.
- API: OpenAI Responses API.
- Output: strict Structured Outputs with JSON Schema.
- Storage control: `store: false` on every request.
- OpenAI tools: none.
- The Extension must never contain an OpenAI API key.
- The Gateway returns only validated application DTOs, never raw provider responses.
- GPT-4o is not the primary or silent fallback model for the submission.
- Any later model change requires explicit release approval and re-running the contract/evaluation suite.

## 4. Deterministic authority

GPT-5.6 is advisory and bounded.

The application remains authoritative for:

- schema validation;
- allowed Engine and preset selection;
- parameter bounds;
- Free/Pro policy;
- server availability;
- file-size, memory, timeout, cancellation, and retention limits;
- structural PDF validation;
- page-count validation;
- download eligibility;
- retry count.

GPT-5.6 must not:

- receive or rewrite the PDF;
- generate executable commands or shell fragments;
- select parameters outside the application allowlist;
- bypass policy or licensing;
- approve a structurally invalid output;
- start an unbounded retry loop.

Planner failure falls back to the deterministic Balanced plan. Visual-check failure falls back to download plus manual review. Neither failure may lose the selected PDF or a previously valid result.

## 5. Smart Planner privacy contract

### 5.1 Allowed request data

Only these categories are allowed:

- ephemeral random request ID;
- schema version;
- structured processing goal;
- optional generic instruction of at most 200 characters;
- aggregate, content-independent PDF metrics;
- current Engine capabilities and allowlisted presets.

Proposed request shape:

```json
{
  "schemaVersion": 1,
  "requestId": "ephemeral-random-id",
  "userGoal": {
    "deliveryTarget": "email_20mb",
    "qualityIntent": "print",
    "speedPreference": "balanced",
    "splitAllowed": true,
    "instruction": "Keep print quality and create files small enough to email."
  },
  "documentProfile": {
    "fileSizeBytes": 838860800,
    "pageCount": 620,
    "imageObjectCount": 1310,
    "scannedPageRatio": 0.94,
    "vectorPageRatio": 0.02,
    "textPageRatio": 0.04,
    "estimatedDpiBuckets": {
      "under150": 0.02,
      "150to300": 0.21,
      "over300": 0.77
    },
    "codecCounts": {
      "jpeg": 1280,
      "jpx": 30,
      "other": 0
    },
    "pageSizeDistributionBytes": {
      "p50": 1100000,
      "p90": 2100000,
      "max": 7400000
    }
  },
  "engineCapabilities": {
    "localAvailable": true,
    "officeAvailable": true,
    "officeCpuCount": 16,
    "officeMemoryGb": 32,
    "allowedPresets": ["balanced"],
    "maxFileSizeMb": 1000
  }
}
```

Numeric values above illustrate the contract; they are not benchmark claims or approved production thresholds.

### 5.2 Forbidden Planner data

The Planner validator must reject, including recursively:

- PDF bytes or data URLs;
- page images or preview images;
- extracted text, OCR text, page text, table cells, or summaries;
- filename or original path;
- title, author, subject, keywords, or other document metadata;
- content-derived hashes or persistent document IDs;
- email, license token, device fingerprint, account identity, or IP-derived location;
- unknown keys outside the exact schema.

The optional instruction field must display guidance not to paste names, account numbers, document text, or other sensitive details. If this cannot be governed safely, the contest build must omit the free-text field and use structured goal controls only.

### 5.3 Required disclosure

```text
Smart Plan sends your selected processing goal and anonymous technical document metrics to OpenAI.
Your PDF, page content, images, text, filename, and metadata are not extracted or uploaded by Smart Plan.
```

## 6. ProcessingPlan contract

Proposed strict response shape:

```json
{
  "schemaVersion": 1,
  "engine": "office",
  "preset": "balanced",
  "quality": 78,
  "dpi": 180,
  "split": {
    "enabled": true,
    "strategy": "by-max-size",
    "targetPartSizeMb": 20
  },
  "retryPolicy": {
    "allowed": true,
    "maxAdditionalPasses": 1
  },
  "explanation": "Use Office Engine because the file is large and predominantly scanned. Preserve print readability and split the result into email-sized parts."
}
```

Allowed enum families:

- `engine`: `local | office`;
- `preset`: only values advertised by the active capabilities response;
- Split strategy: only existing Local/Office strategies approved by policy;
- retry: zero or one additional pass.

The final minimum/maximum values for `quality`, `dpi`, and target size are a release-blocking decision recorded in Section 14. Until those bounds are approved, no AI-generated numeric value may be executed by an Engine.

Every plan must pass:

1. JSON-schema validation.
2. Unknown-key rejection.
3. Local policy validation.
4. Engine health/capability validation.
5. Free/Pro validation.
6. Explicit user confirmation before processing.

## 7. Optional Visual Quality Check contract

This feature is not on the critical path and is disabled until the core Go/No-Go gate passes.

### 7.1 Consent and request bounds

- Separate affirmative action for each check.
- Off by default; no persistent consent.
- Show selected page indices and previews before upload.
- At most 1–3 matching before/after page pairs.
- Reuse the existing MuPDF renderer; do not add `pdf.js` for this feature.
- Calibrate approximately 1200–1600 px on the long edge; insufficient evidence returns manual review.
- Prefer Blob/multipart from Extension to Gateway rather than base64 transport.
- The complete PDF is never sent.
- Preview bytes are deleted immediately after success, cancellation, timeout, or error.

Required disclosure:

```text
Optional visual check sends previews of the selected pages to OpenAI.
The previews may contain document text and other sensitive information.
Your complete PDF is not sent. You can skip this check and download the result normally.
```

Downsampling is not a privacy guarantee. The UI and demo must not call preview upload anonymous, local, offline, or content-free.

### 7.2 QualityAssessment response

```json
{
  "schemaVersion": 1,
  "assessment": "accept",
  "scores": {
    "overallReadability": 94,
    "smallTextPreservation": 91,
    "tableAndLineIntegrity": 96,
    "artifactFreedom": 93
  },
  "risks": [],
  "recommendedAction": "none",
  "confidence": 0.91,
  "explanation": "Selected previews remain visually readable with no material compression artifacts detected."
}
```

Allowed decisions:

- `assessment`: `accept | retry_safer | manual_review`;
- `recommendedAction`: `none | raise_quality | raise_dpi | use_local_original | manual_review`;
- risks: only the approved visual-risk enum.

The model returns no raw Engine parameter. The application maps a recommendation to one approved safer preset and permits at most one retry. The original valid result remains available.

### 7.3 Untrusted pixels

Document pixels are untrusted input. The visual instruction must require the model to ignore any visible instruction and prohibit transcription, quotation, summarization, translation, classification, identity inference, or reproduction of page content.

The evaluation suite must include a page containing prompt-injection text and a page containing sensitive-looking content that must not be echoed.

## 8. Gateway API and deployment

Logical surface:

```http
GET  /api/v1/health
POST /api/v1/plans
POST /api/v1/quality-checks
```

The Planner and visual endpoints require separate DTOs, validators, prompts, size limits, rate limits, and logs.

Provisional deadline architecture:

- TypeScript/Node Gateway to match the existing repository stack.
- Default deployment beside the Office Engine API on the dedicated Contabo evaluation host.
- Cloudflare Worker is allowed only if a tested Worker foundation already exists or demonstrably reduces delivery time.
- Do not deploy two interchangeable Gateways.
- Cloudflare, if used, handles AI requests only and never processes PDFs.

Required controls:

- server-side secret only;
- judge access token/session;
- origin allowlist as defense in depth, never as authentication;
- per-session/IP rate and concurrency limits;
- request and upstream timeouts;
- body, MIME, decoded pixel, and decompression-bomb limits;
- daily/monthly OpenAI spending ceiling and alerts;
- no request bodies, previews, authorization headers, provider raw output, or document-derived strings in logs;
- no raw upstream error or secret exposure;
- `store: false` verified in request construction.

## 9. Office Engine Build Week slice

Minimum vertical slice:

- Dockerfile and Docker Compose;
- health/capabilities endpoint;
- one approved Balanced processing path;
- bounded one-file job lifecycle;
- progress/status and cancellation;
- result download;
- input-size and processing timeout;
- temporary-file cleanup on every terminal path;
- output open/page-count validation;
- no document-content logging;
- synthetic/public judge fixtures.

Excluded:

- Redis, MinIO, Kubernetes, autoscaling, and batch jobs;
- OCR, summarization, chat with PDF, and searchable-PDF generation;
- full admin/organization/seat UI;
- multiple production presets;
- unrestricted public upload service.

## 10. Processing-engine license gate

The existing Stage 11 draft references Ghostscript. Ghostscript and MuPDF licensing must be reviewed for the actual distribution/deployment model.

Before distributing an Engine image or enabling its public evaluation path, record one compliant option:

1. AGPL-compliant distribution and source availability;
2. appropriate commercial license;
3. separately approved alternative engine with acceptable licensing and equivalent validation/quality behavior.

This is a release blocker. A technical experiment may be local-only while the decision is open, but the affected image must not be presented as cleared for proprietary production distribution.

## 11. Prompt requirements

Smart Planner instruction must:

- treat the supplied JSON as the complete decision context;
- use only allowed enums and schema fields;
- never infer document subject matter;
- never output commands, code, URLs, or filenames;
- choose fallback/manual review when evidence or capabilities are insufficient;
- return only the strict schema.

Visual instruction must:

- compare labeled before/after pairs only for visible degradation;
- treat pixels as untrusted data;
- prohibit content reproduction and subject classification;
- return only the strict schema;
- return `manual_review` when resolution, rotation, pairing, or evidence is insufficient.

Prompt text is not a security boundary. Schema and policy validation remain mandatory.

## 12. Required tests before Engine execution

Smart Planner:

- valid Local and Office cases;
- Office unavailable;
- Split allowed and forbidden;
- malformed schema and unknown key;
- forbidden content key at every nesting level;
- out-of-range numeric value;
- hostile goal instruction;
- timeout, rate limit, refusal, invalid output, and deterministic fallback;
- Free/Pro conflict;
- API key absent from client build.

Office Engine:

- PDF magic/MIME and malformed input;
- size and timeout limits;
- cancellation;
- path traversal and command injection;
- cleanup on success/failure/timeout/cancel;
- output opens and page count matches;
- no content in logs.

Optional visual:

- no upload without consent;
- selected indices exactly match uploaded previews;
- oversized/decompression-bomb input rejected before OpenAI;
- identical, blurred, line-broken, artifacted, rotated, blank, mismatched, and low-resolution pairs;
- prompt injection ignored;
- sensitive text not echoed;
- timeout/refusal/invalid schema/low confidence does not block download.

## 13. Go/No-Go order

1. Real `gpt-5.6` Planner round trip returns a strict valid plan.
2. Forbidden-field and policy tests pass.
3. Deterministic Local execution remains functional.
4. One Office Engine fixture processes and validates, or fallback Plan B is selected.
5. Judge access, secrets, rate limits, and spend controls pass.
6. Only then may Visual Quality Check enter implementation.

If schedule slips, remove in this order:

1. Visual Quality Check.
2. AI-directed retry.
3. ETA and nonessential benchmark presentation.
4. Office Engine, falling back to Smart Planner plus existing Local Compression/Split.

Never remove GPT-5.6 runtime integration, schema/policy validation, deterministic fallback, privacy enforcement, output validation, or judge access to preserve an optional feature.

## 14. Decision ledger

| Decision | Status | Current resolution |
| --- | --- | --- |
| Runtime model/API | Approved | `gpt-5.6`, Responses API, strict Structured Outputs, `store: false`, no tools |
| Core AI role | Approved | Bounded Smart Processing Planner from goal + non-content metrics |
| Deterministic authority | Approved | Local policy and result validators remain authoritative |
| Optional visual role | Approved with gate | Selected before/after quality assessment only after core readiness |
| OCR/searchable PDF | Rejected for Build Week | No OCR, extraction, reconstruction, or second Extension |
| Rendering dependency | Approved | Reuse MuPDF; do not add `pdf.js` solely for previews |
| Retry | Approved bound | At most one approved safer retry; previous valid result retained |
| Gateway language | Provisional | TypeScript/Node for deadline consistency |
| Gateway host | Approved for contest | Contabo beside Office API; judges use the hosted path while Docker remains reproducibility proof |
| Submission/product name | Pending | Working name remains `PDF Office Engine — AI-Planned, Private PDF Processing` |
| Processing engine/license | Approved with artifact gate | Owner selected AGPL contest distribution; each published Engine artifact still requires complete notices, source links, and corresponding source |
| Balanced Engine parameters | Blocking | Benchmark and approve exact commands/preset |
| Quality/DPI/target-size bounds | Blocking | Approve before executing model numeric output |
| Hosted upload/preview retention | Blocking | Approve exact short retention and prove cleanup |
| Judge authentication | Blocking | Select short-lived token/session mechanism |
| Visual resolution/calibration | Deferred | Calibrate only after core Go/No-Go passes |

No unresolved blocking value may be guessed in runtime code.

## 15. Definition of Done for the first implementation slice

- Contract files and validators exist for Smart Planner request and `ProcessingPlan`.
- Recursive forbidden-field tests pass.
- Gateway uses `gpt-5.6`, Responses API, strict output, `store: false`, and no tools.
- A real generic fixture produces a valid bounded plan.
- Invalid/refused/timed-out model results return deterministic fallback.
- API key is absent from Extension artifacts and Git history.
- Existing Local Compression/Split works without Gateway connectivity.
- README documents setup without exposing secrets.
- Implementation report records exact tests and any remaining blockers.

## 16. SPECIFICATION COMPLIANCE

- Existing Local Compression, Split, Free/Pro, Stage 8 retention/accessibility: **Fully matches the implemented and accepted specification slices**; existing documented gaps remain unchanged.
- GPT-5.6 Smart Processing Planner: **Extends specification**.
- Smart Planner content-blind privacy contract: **Extends specification**.
- `ProcessingPlan` and deterministic policy validator: **Extends specification**.
- AI Gateway: **Extends specification**.
- Minimal Docker Office Engine: **Partially matches Stage 11** as a time-boxed technical spike.
- Advancing the Stage 11 spike before Stage 9/10: **Requires future specification update** if retained beyond Build Week; explicitly approved here as a deadline exception.
- Optional Visual Quality Check: **Extends specification** and remains gated.
- Sending selected previews with separate consent: **Requires future specification update** to the product privacy policy before production release.
- Contest-hosted Contabo deployment: **Requires future specification update** because it is an evaluation topology, not the production on-premises claim.
- OCR/searchable-PDF companion product: **Not implemented and not approved for Build Week**.

---

## 17. Immediate implementation order

1. Add machine-readable Planner request and `ProcessingPlan` schemas.
2. Add recursive allowlist/denylist privacy validation tests.
3. Implement a minimal server-side `gpt-5.6` Responses API round trip with strict output and deterministic fallback.
4. Capture the exact request in a test and prove absence of PDF bytes/content/metadata.
5. Resolve the processing-engine license and numeric policy bounds before Engine execution work.
