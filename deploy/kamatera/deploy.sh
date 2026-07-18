#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/.env"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Create deploy/kamatera/.env from .env.example and set DEMO_DOMAIN." >&2
  exit 1
fi

if grep -q 'pdf-demo.example.com' "$ENV_FILE"; then
  echo "Replace the example DEMO_DOMAIN before deployment." >&2
  exit 1
fi

DEMO_DOMAIN=$(sed -n 's/^DEMO_DOMAIN=//p' "$ENV_FILE" | tail -n 1)
case "$DEMO_DOMAIN" in
  ""|*[!A-Za-z0-9.-]*)
    echo "DEMO_DOMAIN must be a plain DNS hostname." >&2
    exit 1
    ;;
esac

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  config --quiet

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  up --build --detach --remove-orphans

echo "Deployment started. Verify https://$DEMO_DOMAIN/api/v1/health after DNS and TLS are ready."
