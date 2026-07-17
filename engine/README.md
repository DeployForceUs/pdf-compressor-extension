# Office Engine — Health/Capabilities Slice

This is the first Build Week Docker Office Engine slice. It exposes service
health and explicit capabilities while PDF processing remains closed until the
Balanced command and numeric policy are approved through benchmarks.

## Start

```bash
docker compose up --build -d
curl http://127.0.0.1:8787/api/v1/health
```

The default Compose binding is loopback-only. The Contabo judge deployment must
place an authenticated TLS reverse proxy in front of it; changing the binding
to a public interface without that control is prohibited.

Expected readiness is currently `blocked` and `processingAvailable` is `false`.
`POST /api/v1/compress` returns `503 processing_unavailable`. This is an
intentional release gate, not a processing implementation.

The Engine container does not need `OPENAI_API_KEY`. The later AI Gateway reads
that value only from the server secret store.

## Local contract test

```bash
npm run engine:test
```

The Docker smoke test must run in an environment with Docker before this slice
is accepted for deployment.
