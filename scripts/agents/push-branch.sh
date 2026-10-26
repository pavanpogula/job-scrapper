#!/usr/bin/env bash
# @file push-branch.sh
# @summary The only sanctioned way for an AI agent to publish work: pushes a local branch to origin (new branch or
#          fast-forward update of an existing one) and prints the GitHub pull-request link. Never main/master,
#          never force, never tags or deletes.
# @tags agents, git, safety, pull-request
#
# Usage: scripts/agents/push-branch.sh [--dry-run] [<local-branch>[:<remote-branch>]]
#   (no branch)        push the current branch to the same name on origin
#   feat/x             push local feat/x to origin feat/x
#   fix-local:plan/y   push local fix-local onto origin plan/y (fast-forward only)
#
# Git cannot open a pull request itself; GitHub offers the compare link once the branch exists, so this script
# prints it. Every option other than --dry-run is rejected, so --force, --force-with-lease, --tags, --delete and
# --mirror cannot be smuggled in. A non-fast-forward update is rejected by git itself.
set -euo pipefail

usage() {
  echo "Usage: $0 [--dry-run] [<local-branch>[:<remote-branch>]]" >&2
}

DRY_RUN=0
SPEC=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*)
      echo "❌ Unsupported option '$arg'. Agents never force-push, push tags or delete branches." >&2
      usage
      exit 2
      ;;
    *)
      if [ -n "$SPEC" ]; then
        echo "❌ Only one branch (or local:remote pair) may be pushed at a time." >&2
        usage
        exit 2
      fi
      SPEC="$arg"
      ;;
  esac
done

CURRENT="$(git symbolic-ref --quiet --short HEAD || true)"

case "$SPEC" in
  *:*:*)
    echo "❌ Invalid branch spec '$SPEC'." >&2
    exit 2
    ;;
  *:*)
    SRC="${SPEC%%:*}"
    DST="${SPEC#*:}"
    ;;
  "")
    SRC="$CURRENT"
    DST="$CURRENT"
    ;;
  *)
    SRC="$SPEC"
    DST="$SPEC"
    ;;
esac

if [ -z "$SRC" ]; then
  if [ -z "$SPEC" ]; then
    echo "❌ Detached HEAD: check out a branch first, or name the branch to push." >&2
  else
    echo "❌ Empty source in '$SPEC' would delete the remote branch. Agents never delete branches." >&2
  fi
  exit 1
fi
if [ "$SRC" = "HEAD" ]; then
  if [ -z "$CURRENT" ]; then
    echo "❌ Detached HEAD: check out a branch first." >&2
    exit 1
  fi
  SRC="$CURRENT"
fi
if [ "$DST" = "HEAD" ]; then
  DST="$SRC"
fi
SRC="${SRC#refs/heads/}"
DST="${DST#refs/heads/}"

for name in "$SRC" "$DST"; do
  if [[ "$name" == refs/* ]] || ! git check-ref-format --branch "$name" >/dev/null 2>&1 \
    || ! printf '%s' "$name" | grep -Eq '^[A-Za-z0-9._/-]+$'; then
    echo "❌ '$name' is not a plain branch name (tags and other refs are never pushed)." >&2
    exit 1
  fi
done

case "$DST" in
  main|master)
    echo "❌ Refusing to push to '$DST'. Agents publish task branches only; the owner merges to main." >&2
    exit 1
    ;;
esac

if ! git show-ref --verify --quiet "refs/heads/$SRC"; then
  echo "❌ Local branch '$SRC' does not exist." >&2
  exit 1
fi

if [ "$SRC" = "$CURRENT" ] && [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

if [ "$(git config --get remote.origin.mirror || true)" = "true" ]; then
  echo "❌ origin is configured as a mirror; refusing to push." >&2
  exit 1
fi

ORIGIN_URL="$(git remote get-url origin)"
SLUG=""
if printf '%s' "$ORIGIN_URL" | grep -Eq '^(https://github\.com/|git@github\.com:)[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$'; then
  SLUG="$(printf '%s' "$ORIGIN_URL" | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')"
elif [ "${PUSH_GUARD_ALLOW_LOCAL_ORIGIN:-}" != "1" ]; then
  echo "❌ origin is not a github.com repository: $ORIGIN_URL" >&2
  exit 1
fi

# Secret hygiene: refuse to publish a branch whose changes touch env files, api keys, run output or Vercel state.
BASE="$(git rev-parse --verify --quiet origin/main || git rev-parse --verify --quiet main || true)"
if [ -n "$BASE" ]; then
  SECRET_HITS="$(git diff --name-only "$BASE"..."refs/heads/$SRC" \
    | grep -E '(^|/)\.env($|\.)|(^|/)apikeys/|(^|/)output/|(^|/)\.vercel/' \
    | grep -vE '(^|/)\.env\.example$' || true)"
  if [ -n "$SECRET_HITS" ]; then
    echo "❌ Branch changes a secret-bearing path (.env*, apikeys/, output/, .vercel/). Not pushing:" >&2
    echo "$SECRET_HITS" >&2
    exit 1
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "🧪 Dry run: would push local '$SRC' to origin '$DST' (fast-forward only)."
else
  git push --set-upstream origin "refs/heads/${SRC}:refs/heads/${DST}"
fi

echo
echo "✅ Branch '$DST' is on origin."
if [ -n "$SLUG" ]; then
  echo "Open or view the pull request: https://github.com/${SLUG}/compare/main...${DST}?expand=1"
fi
