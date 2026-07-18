#!/usr/bin/env sh
set -eu

BASE_URL=${OFFICE_ENGINE_URL:-http://127.0.0.1:8787}
INPUT=${1:-fixtures/local/Easy-PhotoPrintEditor_V1.10.0_Win_Mac_EN_V01.pdf}
OUTPUT=${2:-/tmp/office-engine-smoke-result.pdf}
CREATE_RESPONSE=$(mktemp)
STATUS_RESPONSE=$(mktemp)
HEADERS=$(mktemp)
trap 'rm -f "$CREATE_RESPONSE" "$STATUS_RESPONSE" "$HEADERS"' EXIT

if [ ! -f "$INPUT" ]; then
  echo "Fixture not found: $INPUT" >&2
  exit 1
fi

for command in curl pdfinfo python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command" >&2
    exit 1
  fi
done

HEALTH=$(curl --fail --silent --show-error "$BASE_URL/api/v1/health")
printf '%s' "$HEALTH" | python3 -c '
import json, sys
health = json.load(sys.stdin)
if health.get("readiness") != "ready":
    raise SystemExit("Office Engine is not ready")
print("Engine ready:", health["engine"]["processor"], health["engine"]["processorVersion"])
'

INPUT_BYTES=$(wc -c < "$INPUT" | tr -d ' ')
INPUT_PAGES=$(pdfinfo "$INPUT" | awk '/^Pages:/ {print $2}')
echo "Input: $INPUT_BYTES bytes, $INPUT_PAGES pages"

CREATE_STATUS=$(curl --silent --show-error \
  --output "$CREATE_RESPONSE" \
  --write-out '%{http_code}' \
  --header 'Content-Type: application/pdf' \
  --data-binary "@$INPUT" \
  "$BASE_URL/api/v1/compress")

if [ "$CREATE_STATUS" != "202" ]; then
  echo "Job creation failed with HTTP $CREATE_STATUS:" >&2
  cat "$CREATE_RESPONSE" >&2
  exit 1
fi

JOB_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["jobId"])' < "$CREATE_RESPONSE")
echo "Job: $JOB_ID"

ATTEMPT=0
while [ "$ATTEMPT" -lt 160 ]; do
  curl --fail --silent --show-error \
    "$BASE_URL/api/v1/jobs/$JOB_ID" \
    > "$STATUS_RESPONSE"
  STATUS=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' < "$STATUS_RESPONSE")
  case "$STATUS" in
    completed) break ;;
    cancelled)
      echo "Job was cancelled." >&2
      exit 1
      ;;
  esac
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if [ "$STATUS" != "completed" ]; then
  echo "Job did not complete before the smoke-test deadline." >&2
  exit 1
fi

RESULT_KIND=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["kind"])' < "$STATUS_RESPONSE")
RESULT_REASON=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["reason"])' < "$STATUS_RESPONSE")

curl --fail --silent --show-error \
  --dump-header "$HEADERS" \
  --output "$OUTPUT" \
  "$BASE_URL/api/v1/jobs/$JOB_ID/result"

OUTPUT_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
OUTPUT_PAGES=$(pdfinfo "$OUTPUT" | awk '/^Pages:/ {print $2}')

if [ "$OUTPUT_PAGES" != "$INPUT_PAGES" ]; then
  echo "Page-count mismatch: input=$INPUT_PAGES output=$OUTPUT_PAGES" >&2
  exit 1
fi

echo "Result: $RESULT_KIND ($RESULT_REASON)"
echo "Output: $OUTPUT_BYTES bytes, $OUTPUT_PAGES pages"
echo "Saved to: $OUTPUT"
