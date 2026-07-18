#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/.env"
SITE_NAME="pdf-office-engine-contest"
AVAILABLE_PATH="/etc/nginx/sites-available/$SITE_NAME"
ENABLED_PATH="/etc/nginx/sites-enabled/$SITE_NAME"
TEMP_PATH=$(mktemp)

cleanup() {
  rm -f "$TEMP_PATH"
}
trap cleanup EXIT

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing deploy/kamatera-shared/.env." >&2
  exit 1
fi

DEMO_DOMAIN=$(sed -n 's/^DEMO_DOMAIN=//p' "$ENV_FILE" | tail -n 1)
OFFICE_ENGINE_PORT=$(sed -n 's/^OFFICE_ENGINE_PORT=//p' "$ENV_FILE" | tail -n 1)

case "$DEMO_DOMAIN" in
  ""|*[!A-Za-z0-9.-]*)
    echo "DEMO_DOMAIN must be a plain DNS hostname." >&2
    exit 1
    ;;
esac

case "$OFFICE_ENGINE_PORT" in
  ""|*[!0-9]*)
    echo "OFFICE_ENGINE_PORT must be an integer." >&2
    exit 1
    ;;
esac

sed \
  -e "s/__DEMO_DOMAIN__/$DEMO_DOMAIN/g" \
  -e "s/__OFFICE_ENGINE_PORT__/$OFFICE_ENGINE_PORT/g" \
  "$SCRIPT_DIR/nginx-site.conf.template" > "$TEMP_PATH"

install -m 0644 "$TEMP_PATH" "$AVAILABLE_PATH"
ln -sfn "$AVAILABLE_PATH" "$ENABLED_PATH"

if ! nginx -t; then
  rm -f "$ENABLED_PATH" "$AVAILABLE_PATH"
  nginx -t
  echo "Nginx configuration rejected and rolled back." >&2
  exit 1
fi

systemctl reload nginx
echo "Nginx site installed for $DEMO_DOMAIN."
