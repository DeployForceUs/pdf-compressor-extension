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

## Completed slice: trusted runtime capacity disclosure without invented ETA

Product decision approved by the owner on 2026-07-19:

- show Office Engine capacity to every user after a successful connection;
- use the same trusted capacity in Smart Planner requests;
- do not show processing minutes, relative speed, `pages per minute`, or a
  `Basic`/`Fast` performance class before empirical benchmark calibration.

Implemented behavior:

- Engine health service version `0.3.0` adds a `runtime` object containing
  conservative `effectiveCpuCount`, `effectiveMemoryMb`, the measurement class
  `effective_runtime_limits`, and explicit
  `performanceCalibration: not_calibrated`;
- Linux runtime detection reads cgroup v2 limits, falls back to cgroup v1, and
  takes the lower value between Container limit and host-visible capacity;
- CPU is deliberately reported as a conservative whole-vCPU integer because
  the approved Planner contract accepts an integer CPU count; memory is
  retained to one MiB and converted to GiB only for display/Planner DTO use;
- the Extension validates the optional runtime block before use and displays
  effective vCPU, RAM, maximum concurrency, maximum file size, and the explicit
  uncalibrated state in English and Spanish;
- an older deployed Engine without the additive runtime block remains
  connectable, but the UI reports capacity unavailable and the Planner mapping
  marks Office selection unavailable rather than guessing zeros as real
  capacity;
- the Gateway resolves Office health through the private Docker network for
  every Planner request and replaces client-supplied Engine capabilities with
  trusted live values before the OpenAI call;
- if Office health is disabled, unavailable, malformed, or lacks runtime
  capacity, trusted Gateway capabilities fail closed with
  `officeAvailable=false`; client-provided CPU/RAM cannot restore Office
  eligibility;
- shared and dedicated Kamatera Compose profiles now use explicit configurable
  CPU/RAM limits. Conservative defaults are `1 vCPU / 1536 MB` so a 2 GB shared
  host retains capacity for the Gateway, Nginx, Docker, VPN, and other services;
- the Extension default judge URL now points to the currently verified
  `https://pdf-66-55-75-239.sslip.io` endpoint instead of the stale
  `pdf.aianswerline.live` hostname.

Why this slice is necessary:

- the previous shared Compose file declared `3 CPU / 5 GB` even when the
  Kamatera VM was resized below those values;
- the existing content-free Planner fixtures contained static `4 CPU / 8 GB`
  example values;
- without a trusted live override, the model could receive stale capacity and
  recommend Office Engine on a false performance premise;
- file byte size alone is not a performance proxy: the Canon fixture is only
  about 5.5–6.4 MB but contains 220 pages and remains CPU-sensitive.

Deliberate limitations and claims boundary:

- this is capacity disclosure, not benchmark calibration;
- the UI does not produce an ETA or state that Office Engine is faster than the
  user's computer;
- one observed Canon run is acceptance evidence, not a universal benchmark;
- current Queue disclosure is the configured concurrency limit, not live queue
  depth or host load;
- Local-vs-Office comparison and time estimation remain blocked until the
  required representative fixture matrix identifies both hardware profiles;
- the visible `Generate Smart Plan` action remains separately blocked by the
  missing deterministic MuPDF observation adapter; this slice does not invent
  document-profile values to expose that action prematurely;
- target status is **BLOCKED** until Engine/Gateway Images are rebuilt on the
  resized Kamatera VM and authenticated health confirms the expected effective
  capacity. Local contract status is **PASS** after the validation listed below.

## Completed slice: detached Office processing start acknowledgement

A graphical Chrome test on 2026-07-19 exposed a separate lifecycle regression.
The selected 5.5 MB, 220-page PDF reached Office Engine processing and the
server-side operation appeared to finish quickly, but the popup did not accept
a final result. Instead, Chrome reported:

```text
A listener indicated an asynchronous response by returning true, but the
message channel closed before a response was received
```

Status of that live acceptance attempt: **FAIL**. Disappearance of the Cancel
button is not accepted as proof that the result was downloaded, validated, and
persisted.

Root cause and correction:

- the popup start request was forwarded through the background service worker
  to the offscreen document and its runtime-message response was kept open for
  the entire upload, processing, polling, download, and validation lifecycle;
- popup and service-worker message channels are not a durable transport for a
  multi-minute operation and can close even though the persistent offscreen
  operation continues;
- the offscreen document now returns an immediate `accepted` acknowledgement
  and runs the lifecycle independently;
- progress, completion, and error continue to use the existing independent
  `office:progress`, `office:result`, and `office:error` events;
- active state is claimed before the first asynchronous preflight read so a
  second start cannot enter during initialization, and cancellation tolerates
  the short interval before the Office client exists.

This changes message transport only. It does not change PDF privacy, processing
parameters, retention, result validation, authentication, or the explicit
upload-confirmation boundary. Local correction status is **PASS** after the
validation listed below. Graphical Chrome re-test is **BLOCKED** until the new
extension bundle is pulled, rebuilt, and reloaded. The live capacity disclosure
remains separately **BLOCKED** because the screenshot still reports
`Capacity: unavailable from this Engine version`, proving that the target Engine
Image has not yet been rebuilt with the additive runtime-health contract.

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

The trusted runtime-capacity slice additionally passed on 2026-07-19:

```text
npm run check
npm run engine:test                                      # 17/17 passed
NPM_CONFIG_CACHE=/tmp/npm-gateway-validate npm run gateway:test
npm run build
npm run check:worker-boundary
phase11 TypeScript suites (esbuild bundles + node --test) # 20/20 passed
JSON.parse for both locale files
rg "api.openai.com|OPENAI_API_KEY|test-openai-key-not-real" .output/chrome-mv3
git diff --check
```

The new tests cover cgroup limits lower than host capacity, host capacity lower
than cgroup limits, host-only fallback, strict health parsing, legacy-Engine
fail-closed behavior, trusted capability replacement, and Gateway resolver
failure. No secret marker was found in the production extension bundle.

The detached Office start-channel correction additionally passed on 2026-07-19:

```text
npm run check
npm run engine:test                                      # 17/17 passed
NPM_CONFIG_CACHE=/tmp/npm-gateway-validate npm run gateway:test
npm run build
npm run check:worker-boundary
phase11 TypeScript suites (esbuild bundles + node --test) # 22/22 passed
```

The two additional tests prove that the start acknowledgement is returned
before the Office task completes and that an unexpected detached rejection is
reported without retroactively rejecting the accepted start request.

Target Docker rebuild, live health verification, and graphical Chrome
acceptance remain **BLOCKED** until this commit is deployed; no target result is
claimed by the local validation above.

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

1. Pull and rebuild the production Extension, reload the unpacked MV3 bundle,
   repeat the confirmed 220-page Office run, and verify progress, result
   download, local validation, persistence, and the absence of a runtime-message
   channel error.
2. Rebuild Engine and Gateway Images on the target VM, confirm authenticated
   health reports the intended effective capacity, and record `PASS` or `FAIL`.
3. On the temporary test configuration, set explicit Container limits that
   leave host reserve, then repeat the 220-page roundtrip and record duration as
   an observed configuration-specific result, not a universal benchmark.
4. Complete the required representative benchmark matrix before adding any ETA,
   speedup, or Local-vs-Office comparison claim.
5. Obtain contest-project access to `gpt-5.6`, then repeat the content-free
   Planner fixture as a final compatibility check. Development smoke tests use
   the deployment-selected lower-cost model.
6. Record deterministic MuPDF page-classification, DPI-estimation, and
   page-size-estimation rules, then implement the structural observation
   adapter without text extraction or page rendering.

## Specification compliance

- Existing Local Compression and Split behavior: **Fully matches specification**; this slice does not modify their runtime path.
- Canonical Split identifier `by-max-size`: **Fully matches specification** and current implementation.
- Smart Planner request privacy boundary: **Extends specification** under the approved Build Week addendum.
- Strict `ProcessingPlan` and Responses API client: **Extends specification** under the approved Build Week addendum.
- Content-blind aggregate profile builder: **Extends specification** under the approved Build Week addendum; the MuPDF observation adapter is intentionally incomplete until its deterministic classification rules are approved.
- AI-generated numeric planning: **Extends specification** under the approved addendum; only the exact approved Balanced tuple can pass the deterministic policy.
- Office Engine health/capabilities: **Fully matches the approved Build Week slice** locally; target-container verification remains pending.
- Effective runtime capacity disclosure: **Extends specification** using the
  already approved Planner capability fields; it adds trusted health sourcing
  and user-visible disclosure without adding a performance claim.
- Empirical ETA and Local-vs-Office performance comparison: **Partially matches
  specification** because they remain intentionally disabled until the required
  benchmark matrix exists.
- Office Engine execution: **Fully matches the approved bounded Build Week slice** locally; authenticated hosted fixture acceptance remains pending.
- Optional Visual Quality Check: **Requires future specification update** and remains outside the critical path.
- Authenticated Gateway Office proxy: **Fully matches the approved Build Week slice**; live TLS deployment remains pending.
- Extension Office connection, confirmation, progress, cancellation, validation, and result persistence: **Partially matches specification** pending graphical Chrome and live TLS acceptance.
- Extension Smart Planner API client: **Partially matches specification**; the content-blind MuPDF observation adapter and visible plan action remain intentionally blocked by the missing deterministic profiling rules.
