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

ENGINE_JOBS_PATH=$(sed -n 's/^ENGINE_JOBS_PATH=//p' "$ENV_FILE" | tail -n 1)
ENGINE_JOBS_PATH=${ENGINE_JOBS_PATH:-/var/lib/pdf-office-engine/jobs}
case "$ENGINE_JOBS_PATH" in
  /var/lib/pdf-office-engine/*) ;;
  *)
    echo "ENGINE_JOBS_PATH must be below /var/lib/pdf-office-engine/." >&2
    exit 1
    ;;
esac
install -d -o 1000 -g 1000 -m 700 "$ENGINE_JOBS_PATH"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  config --quiet

docker compose \
  --env-file "$ENV_FILE" \
  -f "$SCRIPT_DIR/docker-compose.yml" \
  up --build --detach --remove-orphans

echo "Engine started on the configured loopback port."
