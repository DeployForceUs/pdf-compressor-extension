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
- health reports conservative effective CPU/RAM capacity: the lower of host
  capacity and Container cgroup limits;
- health reports `performanceCalibration: not_calibrated` until the required
  empirical fixture matrix exists. CPU/RAM disclosure is not an ETA or a
  speedup claim.

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

The deployed CPU and memory limits must be explicit Compose inputs. On a
shared 2 GB smoke-test host, the committed conservative defaults are `1 vCPU`
and `1536 MB`; larger hosts should set higher limits deliberately while leaving
capacity for the Gateway, reverse proxy, Docker, and unrelated services.

## Verify

```bash
npm run engine:test
```

The final deployment acceptance also requires a Docker build and a real public
fixture roundtrip on the target Linux host.

On the shared contest host, run the committed Canon fixture through the full
create/status/download lifecycle with:

```bash
./scripts/smoke-office-engine.sh
```
