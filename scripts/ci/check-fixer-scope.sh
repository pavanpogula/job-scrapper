#!/usr/bin/env bash
# scripts/ci/check-fixer-scope.sh
# Verifies that automated fixes stay within allowed file boundaries.

set -euo pipefail

BASE_REF="${1:-origin/main}"

echo "🔍 Checking fixer scope against $BASE_REF..."

MODIFIED_FILES=$(git diff --name-only "$BASE_REF"...HEAD 2>/dev/null || git diff --name-only HEAD~1)

if [ -z "$MODIFIED_FILES" ]; then
  echo "✅ No files modified."
  exit 0
fi

FORBIDDEN_PATTERNS=(
  "^\.github/"
  "^\.claude/settings\.json"
  "^\.agents/hooks\.json"
  "^vercel\.json"
)

ALLOWED_PATTERNS=(
  "^src/"
  "^tests/"
  "^prisma/schema\.prisma"
  "^documentation/"
  "^CHANGELOG\.md"
  "^README\.md"
  "^AGENTS\.md"
  "^docs/project-explorer\.html"
  "^package\.json"
  "^skills-lock\.json"
)

VIOLATIONS=0

while IFS= read -r file; do
  [ -z "$file" ] && continue
  
  # Check forbidden explicitly
  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    if echo "$file" | grep -Eq "$pattern"; then
      echo "❌ Forbidden file modified: $file (matches $pattern)"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done

  # Check allowed list
  ALLOWED=false
  for pattern in "${ALLOWED_PATTERNS[@]}"; do
    if echo "$file" | grep -Eq "$pattern"; then
      ALLOWED=true
      break
    fi
  done

  if [ "$ALLOWED" = false ]; then
    echo "❌ Unauthorized file modified outside allowed scope: $file"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check if package.json was modified: dependencies must not change
  if [ "$file" = "package.json" ]; then
    DEP_DIFF=$(git diff -U0 "$BASE_REF"...HEAD package.json 2>/dev/null | grep -E '^\+[ ]*"(dependencies|devDependencies)"' || true)
    if [ -n "$DEP_DIFF" ]; then
      echo "❌ package.json dependencies cannot be modified by automated fixer."
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done <<< "$MODIFIED_FILES"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "🚫 Scope check failed with $VIOLATIONS violation(s)."
  exit 1
fi

echo "✅ All modified files are within allowed fixer scope."
exit 0
