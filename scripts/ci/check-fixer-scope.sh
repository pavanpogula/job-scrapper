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
  "vercel\.json$"
  "^frontend/"
  "package(-lock)?\.json$"
)

ALLOWED_PATTERNS=(
  "^backend/src/"
  "^backend/tests/"
  "^backend/prisma/schema\.prisma"
  "^backend/docs/project-explorer\.html"
  "^backend/docs/known-issues\.md"
  "^backend/docs/testing\.md"
  "^backend/AGENTS\.md"
  "^docs/bug-fix-log\.md"
  "^docs/decisions/"
  "^docs/runs/"
  "^CHANGELOG\.md"
  "^README\.md"
  "^AGENTS\.md"
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

  # Check if package.json was modified: scripts, dependencies, devDependencies, overrides must not change (A19, O13)
  if [ "$(basename "$file")" = "package.json" ]; then
    if ! node -e '
      const { execFileSync } = require("child_process");
      const fs = require("fs");
      const baseRef = process.argv[1];
      const filePath = process.argv[2];
      let mergeBase = baseRef;
      try {
        mergeBase = execFileSync("git", ["merge-base", baseRef, "HEAD"], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
      } catch {}
      let baseJson = {}, headJson = {};
      try {
        const baseRaw = execFileSync("git", ["show", `${mergeBase}:${filePath}`], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
        baseJson = JSON.parse(baseRaw);
      } catch {
        console.error(`❌ Cannot read base version of ${filePath} from ${mergeBase}`);
        process.exit(1);
      }
      try {
        const headRaw = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, "utf-8")
          : execFileSync("git", ["show", `HEAD:${filePath}`], { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
        headJson = JSON.parse(headRaw);
      } catch {
        console.error(`❌ Cannot read HEAD version of ${filePath}`);
        process.exit(1);
      }

      const forbiddenKeys = ["scripts", "dependencies", "devDependencies", "overrides"];
      for (const key of forbiddenKeys) {
        const baseVal = JSON.stringify(baseJson[key] || {});
        const headVal = JSON.stringify(headJson[key] || {});
        if (baseVal !== headVal) {
          console.error(`❌ package.json ${key} cannot be modified by automated fixer in ${filePath}.`);
          process.exit(1);
        }
      }
    ' "$BASE_REF" "$file"; then
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
