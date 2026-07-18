# Stage 11 Build Week Execution Report

Status: **in progress**  
Branch: `feature/phase11-office-engine-buildweek-spike`  
Scope authority: `BUILD_WEEK_GPT56_OFFICE_ENGINE_ADDENDUM.md`

## Completed slice: authenticated Extension-to-Office connection

Implemented:

- an authenticated Gateway proxy for Office health, create, status, result, and
  cancellation routes;
- exact method/path allowlisting and removal of the browser Authorization header
  before requests reach the unauthenticated private Engine;
- streaming PDF upload and result download without buffering the PDF in Nginx or
  the Gateway;
- a 1024 MB Nginx upload bound, private Docker service discovery, and a
  310-second proxy timeout matching the bounded Engine lifecycle;
- an Extension Office client that requires HTTPS outside explicit loopback
  development and rejects malformed health, job, error, and result responses;
- device-local connection settings, optional per-origin browser permission, a
  connection test, password-masked access token field, and disconnect flow;
- explicit per-document upload confirmation; no Office upload occurs merely by
  connecting the Engine;
- an offscreen/background processing lifecycle that survives popup closure,
  polls progress, supports cancellation, downloads the result, revalidates PDF
  signature and page count locally, and persists the result in the existing
  retention-controlled compression store;
- a content-blind Smart Planner API client that validates the request before
  network access and locally revalidates every executable plan returned by the
  Gateway;
- English and Spanish disclosures that distinguish Local, Office, and Smart
  Plan data boundaries and remove the obsolete claim that every mode is offline.

The Smart Planner client is intentionally not exposed as an executable popup
action yet. The approved addendum still does not define deterministic MuPDF
rules for page classification, DPI estimation, or per-page byte estimation.
The Extension therefore does not fabricate zeros or synthetic metrics for real
documents. Recording those rules and implementing the observation adapter
remains the release-blocking step before the visible `Generate Smart Plan`
action can truthfully use a selected PDF.

## Completed slice: Smart Planner contract and API boundary

Implemented:

- exact, unknown-key-rejecting Smart Planner request contract;
- recursive rejection of binary values, data URLs, forbidden content fields, identity fields, and metadata fields;
- structured goal allowlists supplied by trusted application policy rather than invented in model output;
- free-text instruction disabled by default and bounded to 200 printable characters when explicitly enabled;
- safe projection of validated requests into a new exact DTO before serialization;
- dynamic strict `ProcessingPlan` JSON Schema using only active allowlisted presets;
- strict numeric enums limited to the product-owner-approved Balanced tuple (`quality=65`, `dpi=144`, `targetPartSizeMb=20`);
- canonical existing Split strategy `by-max-size` rather than the incompatible draft value `max-size`;
- structural plan validation plus local capability, entitlement, Split, retry, and numeric policy validation;
- mandatory execution block while the approved numeric policy is absent;
- server-side Responses API client defaulting to `gpt-5.6`, configurable at deployment through `OPENAI_MODEL`, with `store: false`, low reasoning effort, no tools, and strict Structured Output;
- response handling for HTTP failures, rate limits, network errors, incomplete responses, refusals, invalid JSON, and invalid plans;
- deterministic fallback signal that keeps the existing Local Engine settings and never executes model-generated parameters;
- framework-neutral `/api/v1/plans` gateway handler with required injected authorization and rate-limit policies, JSON-only input, byte limits, timeout cancellation, no-store responses, and redacted fallback errors;
- tests proving that the API key is carried only in the Authorization header;
- build inspection proving the OpenAI endpoint and test secret are absent from the Chrome Extension bundle.

No PDF, page image, preview, extracted text, filename, document metadata, license token, account identity, or device fingerprint is accepted by the Smart Planner request validator.

## Completed slice: content-blind profile aggregation boundary

Implemented:

- an exact, unknown-key-rejecting structural observation contract;
- one unique, contiguous observation requirement for every page;
- aggregation of approved page classification ratios, DPI buckets, codec counts, image-object counts, and page-size percentiles;
- cancellation checks before and throughout aggregation so a partial profile is never returned;
- rejection tests for filename, extracted text, image-byte fields, duplicate pages, and incomplete page sets;
- output restricted to the existing `SmartPlannerDocumentProfile` contract.

The approved addendum defines the allowed aggregate metrics but does not define the deterministic MuPDF rules that classify a page as `scanned`, `vector`, or `text`, estimate per-page byte size, or estimate DPI without rendering or extracting content. Those rules were not guessed. The new builder accepts only already classified structural observations; the MuPDF observation adapter remains a separate pending slice that requires the classification rules to be recorded first.

## Completed slice: bounded Balanced Office Engine runtime

Implemented:

- dependency-free Node HTTP service and Docker/Compose packaging;
- `GET /api/v1/health` with explicit versions, limits, readiness, and capabilities;
- the complete create/status/result/cancel one-file API lifecycle;
- the owner-approved 1 GiB input, five-minute timeout, 15-minute retention, and one-concurrent-job limits;
- Ghostscript Balanced processing plus Poppler page-count/open validation;
- upload-time and processing-output size enforcement;
- startup, cancellation, shutdown, and retention cleanup;
- strict acceptance only for valid, page-preserving, smaller output;
- original-PDF fallback after processing failure, timeout, invalid output, page-count mismatch, or size regression;
- loopback-only default Compose binding for placement behind the future authenticated TLS proxy;
- non-root, read-only container, dropped Linux capabilities, `no-new-privileges`, bounded resources, and container health check;
- structured request logs that classify routes without recording raw URLs, query strings, filenames, request bodies, or secret state;
- contract tests for health, content-blind logging, limits, compression acceptance, fallback, timeout, and cancellation.

The service remains loopback-only until the authenticated judge proxy is
enabled and a real server fixture roundtrip passes. The target Docker build must
also record its exact Debian Ghostscript/Poppler package versions before the
contest artifact is tagged.

Target-host acceptance on 2026-07-18 processed the 6,398,446-byte, 220-page
Canon fixture through the create/status/download API. Ghostscript `10.00.0`
produced a validated 4,303,869-byte result with all 220 pages, saving 2,094,577
bytes (32.7%). Independent visual comparison remains required before treating
this server-specific result as a quality acceptance artifact.

## Completed slice: Balanced calibration harness

Implemented a reproducible synthetic scanned fixture generator and a fixed
four-candidate Ghostscript matrix. The first calibration proved output-open and
page-count validation and produced distinct compression results after disabling
JPEG pass-through and explicitly setting Distiller image dictionaries. Exact
results and limitations are recorded in
`PHASE_11_BALANCED_BENCHMARK_CALIBRATION.md`. Numeric execution remains blocked
until the required real/public fixture matrix and visual review are complete.

The canonical 220-page Canon fixture was also measured. It is print-allowed
but owner-permission encrypted, opens successfully after processing, and
preserves all 220 pages. Every candidate increased output size, establishing
that Office processing needs a deterministic size-regression guard and should
not replace the original for this text/vector profile. This result does not
approve numeric bounds.

The resulting deterministic output-artifact policy is implemented and tested:
only an open, page-count-preserving, strictly smaller output may replace the
original. Invalid, mismatched, equal-size, or larger output retains the original
valid file.

## Completed slice: Kamatera deployment pack

Implemented a Git-driven contest deployment pack with a hardened internal
Engine container, private backend network, Caddy automatic HTTPS, public health
route, and closed-by-default handling for every unfinished endpoint. The pack
contains no API key or access token. Deployment remains health-only until the
Gateway and bounded processing routes pass their respective gates.

The inspected target VM already hosts Nginx, Python, PostgreSQL, and an Amnezia
Docker container. A separate shared-server profile therefore binds the Engine
to loopback, reuses Nginx, leaves the existing site untouched, disables proxy
access logs, and exposes only health while all unfinished routes remain closed.

## Validation

Passed locally against the clean contest worktree:

```text
npm run check
npm run engine:test
npm run engine:fixture -- /tmp/pdf-office-synthetic-24p.pdf
npm run engine:benchmark -- /tmp/pdf-office-synthetic-24p.pdf /tmp/results
node --import tsx tests/phase11_smart_planner_contract.test.ts
node --import tsx tests/phase11_openai_smart_planner_client.test.ts
node --import tsx tests/phase11_smart_planner_gateway.test.ts
node --import tsx tests/phase11_content_blind_profile_builder.test.ts
npm run build
npm run check:worker-boundary
rg "api.openai.com|server-secret-test-key" .output  # no matches
git diff --check
```

The authenticated connection slice additionally passed:

```text
npm run check
npm run build
npm run engine:test
node --test tests/phase11_planner_gateway_runtime.test.mjs
phase11_office_engine_client.test.ts (esbuild bundle + node --test)
phase11_office_processing_runtime.test.ts (esbuild bundle + node --test)
phase11_smart_planner_api_client.test.ts (esbuild bundle + node --test)
npm run check:worker-boundary
rg "api.openai.com|OPENAI_API_KEY|test-openai-key-not-real" .output/chrome-mv3
git diff --check
```

The build contains no OpenAI endpoint or API-key marker. A graphical Chrome
acceptance pass and a live TLS roundtrip remain required because this execution
environment does not include a Chrome/Chromium binary.

The first Worker-boundary attempt was run before a build and correctly failed because `.output` did not exist. It passed after `npm run build` generated the production bundle.

Docker CLI is not installed in the current execution environment, so
`docker compose config`, Image build, and container smoke testing were not run.
They remain required before deployment; no Docker runtime result is claimed.

API contract references checked on 2026-07-17:

- [GPT-5.6 Sol model](https://developers.openai.com/api/docs/models/gpt-5.6-sol) — the `gpt-5.6` alias, Responses API, reasoning, and Structured Outputs are supported;
- [Create a model response](https://developers.openai.com/api/reference/resources/responses/methods/create/) — `store`, `text.format` with strict `json_schema`, and Responses request/response fields.

## Current blockers and next actions

The shared-server deployment now includes an authenticated, loopback-only
Planner Gateway runtime. It bundles the existing strict Smart Planner contract,
reads the OpenAI key and judge token from Docker secret files, limits requests
to 32 KB and 10 per minute, applies a 30-second upstream timeout, and logs only
random request ID, route, method, status, and duration. A content-free fixture
and smoke command are included. Local runtime tests prove health,
authentication, sanitized fallback, and absence of secret values in logs.

The first real content-free roundtrip completed on 2026-07-18 through the
loopback-only Kamatera Gateway using deployment-selected `gpt-5-mini`. It
returned HTTP 200 and a strict `ProcessingPlan`; no document content or secret
was included in the request or retained in this report. Execution was correctly
blocked because the returned numeric values have not passed the separately
required numeric policy. This validates billing, secret loading, authorization,
the Responses API boundary, Structured Output parsing, and deterministic
post-model policy enforcement without claiming that processing is approved.

1. Build the Engine container on the target server, record exact Debian package versions, and run a real fixture through the complete API lifecycle.
2. Add the authenticated TLS judge proxy without exposing the loopback Engine port directly.
3. Connect the Extension consent/disclosure UI and Office Engine client to the verified hosted contract.
4. Configure `OPENAI_API_KEY` only in the server/deployment secret store according to `OPENAI_API_KEY_HANDLING.md`; never in Extension code, GitHub source, logs, or request payloads.
5. Obtain contest-project access to `gpt-5.6`, then repeat the same content-free fixture as a final compatibility check. Development smoke tests use the deployment-selected lower-cost model.
6. Connect the Extension consent/disclosure UI now that the server boundary, real roundtrip, and fallback tests pass.
7. Record deterministic MuPDF page-classification, DPI-estimation, and page-size-estimation rules, then implement the structural observation adapter without text extraction or page rendering.

## Specification compliance

- Existing Local Compression and Split behavior: **Fully matches specification**; this slice does not modify their runtime path.
- Canonical Split identifier `by-max-size`: **Fully matches specification** and current implementation.
- Smart Planner request privacy boundary: **Extends specification** under the approved Build Week addendum.
- Strict `ProcessingPlan` and Responses API client: **Extends specification** under the approved Build Week addendum.
- Content-blind aggregate profile builder: **Extends specification** under the approved Build Week addendum; the MuPDF observation adapter is intentionally incomplete until its deterministic classification rules are approved.
- AI-generated numeric planning: **Extends specification** under the approved addendum; only the exact approved Balanced tuple can pass the deterministic policy.
- Office Engine health/capabilities: **Fully matches the approved Build Week slice** locally; target-container verification remains pending.
- Office Engine execution: **Fully matches the approved bounded Build Week slice** locally; authenticated hosted fixture acceptance remains pending.
- Optional Visual Quality Check: **Requires future specification update** and remains outside the critical path.
- Authenticated Gateway Office proxy: **Fully matches the approved Build Week slice**; live TLS deployment remains pending.
- Extension Office connection, confirmation, progress, cancellation, validation, and result persistence: **Partially matches specification** pending graphical Chrome and live TLS acceptance.
- Extension Smart Planner API client: **Partially matches specification**; the content-blind MuPDF observation adapter and visible plan action remain intentionally blocked by the missing deterministic profiling rules.
