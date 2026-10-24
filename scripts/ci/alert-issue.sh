#!/usr/bin/env bash
set -euo pipefail

CI_RUN_URL="${1:-https://github.com}"
EXIT_CODE="${2:-1}"

echo "Checking for existing scrape-alert issues..."

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "⚠️ gh CLI not found; skipping alert issue creation."
  exit 0
fi

EXISTING_ISSUE=$(gh issue list --label "scrape-alert" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")

BODY="### 🚨 Scrape Alert Failure

- **CI Run:** ${CI_RUN_URL}
- **Exit Code:** ${EXIT_CODE}
- **Timestamp:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")

Please inspect the run artifacts and error telemetry for root cause analysis."

if [ -n "$EXISTING_ISSUE" ]; then
  echo "Appending alert to existing issue #${EXISTING_ISSUE}..."
  gh issue comment "$EXISTING_ISSUE" --body "$BODY"
else
  echo "Creating new scrape-alert issue..."
  gh issue create \
    --title "Scrape failure alert ($(date -u +"%Y-%m-%d"))" \
    --label "scrape-alert" \
    --body "$BODY"
fi
