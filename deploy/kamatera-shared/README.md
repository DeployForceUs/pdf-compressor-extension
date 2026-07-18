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
- the optional Planner Gateway binds only to `127.0.0.1:8790`, reads secrets
  from non-root Docker secret mounts (not container environment variables), and
  applies a 32 KB body limit, 30-second upstream timeout, and global
  10-request/minute contest limit.

## Prepare

```bash
cp deploy/kamatera-shared/.env.example deploy/kamatera-shared/.env
nano deploy/kamatera-shared/.env
```

Set a dedicated DNS hostname and leave port `8787` unless it conflicts.

Existing `.env` files created before the Planner Gateway was added also need:

```dotenv
PLANNER_GATEWAY_PORT=8790
OPENAI_API_KEY_SECRET_PATH=/etc/pdf-office-engine/secrets/openai_api_key
JUDGE_ACCESS_TOKEN_SECRET_PATH=/etc/pdf-office-engine/secrets/judge_access_token
```

## Start health-only Engine

```bash
./deploy/kamatera-shared/deploy.sh
curl http://127.0.0.1:8787/api/v1/health
```

Do not run this step on the current 1-vCPU/1-GB VM. Resize it first to at least
4 vCPU, 8 GB RAM, and 60 GB disk.

## Start the authenticated GPT-5.6 Planner Gateway

Create a dedicated Build Week OpenAI project key and a random judge token.
Enter both values directly on the server; never paste either value into chat or
commit them to Git. Store only the raw secret value in each file:

```bash
install -d -m 700 /etc/pdf-office-engine/secrets
install -m 600 /dev/null /etc/pdf-office-engine/secrets/openai_api_key
install -m 600 /dev/null /etc/pdf-office-engine/secrets/judge_access_token
nano /etc/pdf-office-engine/secrets/openai_api_key
nano /etc/pdf-office-engine/secrets/judge_access_token
./deploy/kamatera-shared/deploy-gateway.sh
curl http://127.0.0.1:8790/api/v1/health
npm run gateway:smoke
```

The Planner accepts content-free aggregate metrics only. Its result remains
non-executable until the separate Engine numeric policy is approved.

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
