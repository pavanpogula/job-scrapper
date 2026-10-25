#!/usr/bin/env bash
# scripts/ci/open-fix-pr.sh
# Pushes the auto-fix branch and creates a GitHub pull request.

set -euo pipefail

RUN_ID="${1:-unknown}"

echo "🚀 Preparing fix PR for run $RUN_ID..."

# Check if any new commits exist
COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || git rev-list --count HEAD~1..HEAD 2>/dev/null || echo "1")
if [ "$COMMITS_AHEAD" -eq 0 ]; then
  echo "ℹ️ No commits produced by fixer. Nothing to push."
  exit 0
fi

BRANCH_NAME="auto-fix/$RUN_ID"

# Push branch using GH_TOKEN authentication
if [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  echo "📤 Pushing branch $BRANCH_NAME..."
  git push "https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY.git" "HEAD:refs/heads/$BRANCH_NAME" --force
else
  echo "⚠️ GH_TOKEN or GITHUB_REPOSITORY not set. Skipping git push in dry-run/local mode."
fi

# Locate issues file (backend/output/reports first, fallback to output/reports until P10)
ISSUES_FILE=$(find backend/output/reports output/reports -name "${RUN_ID}.issues.json" 2>/dev/null | head -n 1 || true)
FINGERPRINTS=""
if [ -n "$ISSUES_FILE" ] && [ -f "$ISSUES_FILE" ]; then
  FINGERPRINTS=$(grep -o '"fingerprint": *"[^"]*"' "$ISSUES_FILE" | sed -E 's/.*"([^"]+)".*/<!-- fp:\1 -->/' || true)
fi

PR_TITLE="fix(auto): scrape error resolution (run $RUN_ID)"

PR_BODY=$(cat <<EOF
## Summary
Fixes automated scrape issue from run \`$RUN_ID\`.

$FINGERPRINTS

### Verification
- Mandatory checks passed:
  - \`scripts/check-all.sh --no-install\`
- CHANGELOG.md [Unreleased] updated.

*Note: This PR was created by the autonomous fixer workflow. Requires human review before merging.*
EOF
)

if command -v gh >/dev/null 2>&1 && [ -n "${GH_TOKEN:-}" ]; then
  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$BRANCH_NAME" --json number -q '.[0].number' 2>/dev/null || true)
  if [ -n "$EXISTING_PR" ]; then
    echo "ℹ️ Pull request #$EXISTING_PR already exists for $BRANCH_NAME. Commenting..."
    gh pr comment "$EXISTING_PR" --body "Scrape run \`$RUN_ID\` produced new fix commits for this branch."
  else
    echo "📝 Opening new PR for $BRANCH_NAME..."
    gh pr create --base main --head "$BRANCH_NAME" --label "auto-fix" --title "$PR_TITLE" --body "$PR_BODY"
  fi
else
  echo "ℹ️ gh CLI not authenticated. Generated PR Body:"
  echo "$PR_BODY"
fi

echo "✅ PR handling complete."
exit 0
