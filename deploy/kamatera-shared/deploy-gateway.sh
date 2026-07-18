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

# Compose can apply non-root uid/gid/mode to environment-sourced secrets. It
# cannot remap file-sourced secrets because those are host bind mounts.
OPENAI_API_KEY=$(sed -n '1p' "$OPENAI_SECRET")
JUDGE_ACCESS_TOKEN=$(sed -n '1p' "$JUDGE_SECRET")
if [ -z "$OPENAI_API_KEY" ] || [ -z "$JUDGE_ACCESS_TOKEN" ]; then
  echo "Secret files must contain a non-empty value on the first line." >&2
  exit 1
fi
export OPENAI_API_KEY JUDGE_ACCESS_TOKEN

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
