#!/usr/bin/env bash
# scripts/ci/record-fix-attempt.sh
# Records failed fix attempts in GitHub Issues for tracking and human escalation.

set -euo pipefail

RUN_ID="${1:-unknown}"

echo "⚠️ Recording failed fix attempt for run $RUN_ID..."

ISSUES_FILE=$(find output/reports -name "${RUN_ID}.issues.json" 2>/dev/null | head -n 1 || true)
if [ -z "$ISSUES_FILE" ] || [ ! -f "$ISSUES_FILE" ]; then
  echo "ℹ️ No issues file found for run $RUN_ID. Nothing to record."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1 || [ -z "${GH_TOKEN:-}" ]; then
  echo "ℹ️ gh CLI unavailable or unauthenticated. Skipping remote issue recording."
  exit 0
fi

# Extract fingerprints
FINGERPRINTS=$(grep -o '"fingerprint": *"[^"]*"' "$ISSUES_FILE" | sed -E 's/.*"([^"]+)".*/\1/' || true)

for fp in $FINGERPRINTS; do
  [ -z "$fp" ] && continue
  echo "🔍 Checking failure history for fingerprint $fp..."

  EXISTING_ISSUE=$(gh issue list --label fix-failed --search "$fp" --json number -q '.[0].number' 2>/dev/null || true)

  if [ -n "$EXISTING_ISSUE" ]; then
    echo "📌 Issue #$EXISTING_ISSUE exists for $fp. Incrementing attempt count..."
    gh issue comment "$EXISTING_ISSUE" --body "Autonomous fix attempt failed again in run \`$RUN_ID\`."
    
    # Check total comments to see if attempts >= 2
    COMMENT_COUNT=$(gh issue view "$EXISTING_ISSUE" --json comments -q '.comments | length' 2>/dev/null || echo "1")
    if [ "$COMMENT_COUNT" -ge 1 ]; then
      echo "🚨 Attempts >= 2. Applying 'needs-human' label to #$EXISTING_ISSUE..."
      gh issue edit "$EXISTING_ISSUE" --add-label "needs-human"
    fi
  else
    echo "📝 Creating new fix-failed issue for $fp..."
    gh issue create \
      --title "Fix failed: error fingerprint $fp" \
      --label "fix-failed" \
      --body "Automated fix attempt failed for scrape run \`$RUN_ID\`.\n\n<!-- fp:$fp -->"
  fi
done

echo "✅ Failure tracking recorded."
exit 0
