# Kamatera Contest Deployment

This pack deploys the current Office Engine health/capabilities slice behind
automatic HTTPS. It does not provision a Kamatera VM and does not yet enable
PDF upload or GPT planning; those routes remain closed until their policies are
approved and implemented.

## VM prerequisites

- Ubuntu 22.04 or 24.04 LTS, x86-64;
- recommended contest size: 8 vCPU, 16 GB RAM, 100 GB SSD;
- Docker Engine with Docker Compose v2;
- Git and a public IPv4 address;
- DNS A/AAAA record for the demo hostname pointing to the VM;
- inbound TCP 80/443 and UDP 443; SSH restricted to the owner;
- outbound HTTPS for container pulls, TLS issuance, GitHub, and later OpenAI.

## First deployment

```bash
git clone --branch feature/phase11-office-engine-buildweek-spike \
  https://github.com/DeployForceUs/pdf-compressor-extension.git
cd pdf-compressor-extension
cp deploy/kamatera/.env.example deploy/kamatera/.env
nano deploy/kamatera/.env
./deploy/kamatera/deploy.sh
```

Set only the real `DEMO_DOMAIN` in `.env`. The file is ignored by Git.

## Update

```bash
cd pdf-compressor-extension
git pull --ff-only
./deploy/kamatera/deploy.sh
```

## Current public surface

- `GET|HEAD /api/v1/health` is proxied to the Engine.
- Every other route returns `503`.
- The Engine is reachable only through the private Docker network.
- Caddy access logging is not enabled, preventing paths, query strings, and
  document names from entering proxy logs.

`OPENAI_API_KEY` is intentionally absent. When the Gateway runtime is added,
the key must be entered directly on the VM through the approved secret-store
procedure, never committed or placed in a Docker Image.

Before final judging deployment, pin container images by digest and run the
Docker smoke test on the actual Kamatera VM.
