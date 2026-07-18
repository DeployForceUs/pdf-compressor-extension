# Kamatera Shared-Server Deployment

Use this profile when the Kamatera VM already runs Nginx and other services.
It does not bind container ports 80/443 and does not start Caddy.

Current safety state:

- Engine binds only to `127.0.0.1:8787` by default;
- only `/api/v1/health` is exposed by the Nginx template;
- every unfinished route returns `503`;
- proxy access logging is disabled;
- the current upload limit is 1 MB because upload processing is not enabled;
- no OpenAI key or judge-access token is stored in Git.

## Prepare

```bash
cp deploy/kamatera-shared/.env.example deploy/kamatera-shared/.env
nano deploy/kamatera-shared/.env
```

Set a dedicated DNS hostname and leave port `8787` unless it conflicts.

## Start health-only Engine

```bash
./deploy/kamatera-shared/deploy.sh
curl http://127.0.0.1:8787/api/v1/health
```

Do not run this step on the current 1-vCPU/1-GB VM. Resize it first to at least
4 vCPU, 8 GB RAM, and 60 GB disk.

## Install Nginx site and TLS

After DNS points to the VM:

```bash
./deploy/kamatera-shared/install-nginx-site.sh
certbot --nginx -d YOUR_DEMO_DOMAIN
```

The Nginx installer validates configuration before reload and removes its new
site if validation fails. It does not modify the existing
`aianswerline.live` site.

## Update

```bash
git pull --ff-only
./deploy/kamatera-shared/deploy.sh
```
