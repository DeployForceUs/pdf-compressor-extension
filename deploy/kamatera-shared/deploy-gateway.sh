#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/.env"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Create deploy/kamatera-shared/.env from .env.example." >&2
  exit 1
fi

OPENAI_SECRET=$(sed -n 's/^OPENAI_API_KEY_SECRET_PATH=//p' "$ENV_FILE" | tail -n 1)
JUDGE_SECRET=$(sed -n 's/^JUDGE_ACCESS_TOKEN_SECRET_PATH=//p' "$ENV_FILE" | tail -n 1)
OPENAI_SECRET=${OPENAI_SECRET:-/etc/pdf-office-engine/secrets/openai_api_key}
JUDGE_SECRET=${JUDGE_SECRET:-/etc/pdf-office-engine/secrets/judge_access_token}

for secret in "$OPENAI_SECRET" "$JUDGE_SECRET"; do
  if [ ! -s "$secret" ]; then
    echo "Missing or empty secret file: $secret" >&2
    exit 1
  fi
done

if [ -z "$(sed -n '1p' "$OPENAI_SECRET")" ] || [ -z "$(sed -n '1p' "$JUDGE_SECRET")" ]; then
  echo "Secret files must contain a non-empty value on the first line." >&2
  exit 1
fi

# Compose on the target host implements file secrets as bind mounts and cannot
# remap uid/gid. Node runs as uid 1000 in the container, so make only that uid
# able to read the two mounted files. The root-only parent directory still
# prevents traversal by unprivileged host users.
chown 1000:1000 "$OPENAI_SECRET" "$JUDGE_SECRET"
chmod 0400 "$OPENAI_SECRET" "$JUDGE_SECRET"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  -f "$SCRIPT_DIR/docker-compose.gateway.yml" \
  config --quiet

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  -f "$SCRIPT_DIR/docker-compose.gateway.yml" \
  up --build --detach planner-gateway

echo "Planner Gateway started on the configured loopback port."
