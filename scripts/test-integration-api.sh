#!/usr/bin/env bash

set -euo pipefail

API_URL="${LAIDBACKHR_API_URL:-https://www.laidbackhr.cloud}"

read -r -s -p "Paste your new LaidbackHR API credential: " API_TOKEN
printf '\n'

if [[ -z "$API_TOKEN" ]]; then
  echo "No credential supplied."
  exit 1
fi

request() {
  curl --fail-with-body --silent --show-error \
    "$API_URL$1" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Accept: application/json"
}

echo "Testing API access..."
request "/api/v1/integrations/v1/capabilities" >/dev/null
echo "Authentication successful."

echo
echo "Loading the Insights overview..."
if command -v jq >/dev/null 2>&1; then
  request "/api/v1/integrations/v1/insights?view=overview&period=quarter" | jq
else
  request "/api/v1/integrations/v1/insights?view=overview&period=quarter"
  echo
fi

unset API_TOKEN
