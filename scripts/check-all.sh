#!/usr/bin/env bash
#
# check-all.sh - Monorepo unified verification script (layout-aware)
# Runs complete typecheck, linting, tests, builds, docs check, and repo-level tests.
# Supports both 'root' (pre-P3a) and 'backend' (post-P3a) directory layouts.
#
set -eo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NO_INSTALL=false
for arg in "$@"; do
  if [ "$arg" = "--no-install" ]; then
    NO_INSTALL=true
  fi
done

STATUS=0
declare -a STEP_NAMES
declare -a STEP_RESULTS

run_step() {
  local name="$1"
  shift
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ Step: $name"
  echo "════════════════════════════════════════════════════════════"
  STEP_NAMES+=("$name")
  if "$@"; then
    STEP_RESULTS+=("PASSED ✅")
    echo "✔ $name passed"
  else
    STEP_RESULTS+=("FAILED ❌")
    echo "✘ $name failed"
    STATUS=1
  fi
}

echo "🔍 Starting unified monorepo verification in: $REPO_ROOT"

if [ -f "backend/package.json" ]; then
  LAYOUT="backend"
  echo "Layout detected: backend (post-P3a)"
  
  if [ "$NO_INSTALL" = false ]; then
    run_step "backend dependencies" npm --prefix backend ci
    run_step "frontend dependencies" npm --prefix frontend ci
  fi

  run_step "backend check:all" npm --prefix backend run check:all
  run_step "frontend check" npm --prefix frontend run check
else
  LAYOUT="root"
  echo "Layout detected: root (pre-P3a)"

  if [ "$NO_INSTALL" = false ]; then
    run_step "root dependencies" npm ci
    UI_DIR="frontend"
    [ -d "frontend" ] && UI_DIR="frontend"
    run_step "UI dependencies" npm --prefix "$UI_DIR" ci
  fi

  run_step "Prisma generate" npx prisma generate
  run_step "Root typecheck" npx tsc --noEmit -p .
  run_step "Test typecheck" npx tsc --noEmit -p tsconfig.test.json
  run_step "Lint root and API" npm run lint
  run_step "Jest test suite" npm test
  run_step "Verify UI" npm run verify:ui
  run_step "Build application" npm run build
  run_step "Docs generate & diff check" bash -c "npm run docs:generate && git diff --exit-code -I 'Auto-generated on' -- docs/"
fi

# Common steps for both layouts
run_step "Repo-level tests" node --test 'scripts/repo-tests/**/*.test.mjs'

# Preflight warnings if post-P3a layout has leftover root artifacts
if [ "$LAYOUT" = "backend" ]; then
  if [ -d "node_modules" ]; then
    echo "⚠️  [Preflight Warning] Root node_modules/ detected after P3a move. Run 'rm -rf node_modules' to avoid stale module resolution."
  fi
  if [ -f ".env" ]; then
    echo "⚠️  [Preflight Warning] Root .env detected after P3a move. Move to backend/.env."
  fi
  if [ -d "apikeys" ]; then
    echo "⚠️  [Preflight Warning] Root apikeys/ detected after P3a move. Move to backend/apikeys/."
  fi
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "                VERIFICATION SUMMARY TABLE                  "
echo "════════════════════════════════════════════════════════════"
for i in "${!STEP_NAMES[@]}"; do
  printf "%-40s : %s\n" "${STEP_NAMES[$i]}" "${STEP_RESULTS[$i]}"
done
echo "════════════════════════════════════════════════════════════"

if [ $STATUS -eq 0 ]; then
  echo "🎉 All verification checks passed cleanly!"
  exit 0
else
  echo "❌ Verification checks failed."
  exit 1
fi
