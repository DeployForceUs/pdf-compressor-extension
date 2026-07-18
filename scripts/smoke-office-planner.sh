#!/usr/bin/env sh
set -eu

BASE_URL=${PLANNER_GATEWAY_URL:-http://127.0.0.1:8790}
FIXTURE=${1:-fixtures/planner/office-available-request.json}
TOKEN_FILE=${JUDGE_ACCESS_TOKEN_SECRET_PATH:-/etc/pdf-office-engine/secrets/judge_access_token}
RESPONSE=$(mktemp)
trap 'rm -f "$RESPONSE"' EXIT

if [ ! -f "$FIXTURE" ]; then
  echo "Planner fixture not found: $FIXTURE" >&2
  exit 1
fi
if [ ! -s "$TOKEN_FILE" ]; then
  echo "Judge token file is missing or empty." >&2
  exit 1
fi

TOKEN=$(sed -n '1p' "$TOKEN_FILE")
HTTP_STATUS=$(curl --silent --show-error \
  --output "$RESPONSE" \
  --write-out '%{http_code}' \
  --header "Authorization: Bearer $TOKEN" \
  --header 'Content-Type: application/json' \
  --data-binary "@$FIXTURE" \
  "$BASE_URL/api/v1/plans")
unset TOKEN

if [ "$HTTP_STATUS" != "200" ]; then
  echo "Planner request failed with HTTP $HTTP_STATUS:" >&2
  cat "$RESPONSE" >&2
  exit 1
fi

python3 - "$RESPONSE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    response = json.load(stream)

print(json.dumps(response, indent=2))
if response.get("kind") != "plan":
    raise SystemExit("Planner did not return a plan")
plan = response.get("plan", {})
if plan.get("engine") != "office":
    raise SystemExit("Planner did not select Office Engine")
if response.get("executionAllowed") is not True:
    raise SystemExit("Planner plan was blocked by deterministic policy")
print("AI Planner selected the verified Office Engine path.")
PY
