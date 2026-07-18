# Office Engine — Balanced Processing Slice

The Build Week Office Engine accepts one PDF at a time and executes the
approved deterministic Balanced Ghostscript path. It never sends PDF content
to OpenAI; the Smart Planner and processing service are separate containers.

## Bounded contract

- raw `application/pdf` request body, maximum 1 GiB;
- one active job per Engine instance;
- five-minute processing timeout;
- 15-minute result retention;
- page-count and PDF-open validation with Poppler;
- compressed output accepted only when it is valid, page-preserving, and
  smaller than the input;
- original PDF returned after processing failure, timeout, invalid output, or
  size regression.

```http
GET  /api/v1/health
POST /api/v1/compress
GET  /api/v1/jobs/{jobId}
GET  /api/v1/jobs/{jobId}/result
POST /api/v1/jobs/{jobId}/cancel
```

## Start

```bash
docker compose up --build -d
curl http://127.0.0.1:8787/api/v1/health
```

The Compose binding is loopback-only. A hosted judge path requires an
authenticated TLS reverse proxy; never bind the Engine directly to a public
interface. The Engine itself does not receive an OpenAI API key.

## Verify

```bash
npm run engine:test
```

The final deployment acceptance also requires a Docker build and a real public
fixture roundtrip on the target Linux host.
