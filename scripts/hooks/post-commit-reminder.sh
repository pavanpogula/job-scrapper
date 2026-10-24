#!/usr/bin/env bash
# Post-commit reminder hook for Claude Code and Antigravity
# Warns if the latest commit does not include CHANGELOG.md

set -euo pipefail

IS_ANTIGRAVITY=false
if [[ "${1:-}" == "--antigravity" ]]; then
  IS_ANTIGRAVITY=true
fi

# Read stdin if provided (non-blocking)
INPUT=""
if [[ ! -t 0 ]]; then
  INPUT=$(cat || true)
fi

# Check if git is available and repo has commits
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

# Check if CHANGELOG.md was touched in the latest commit
LATEST_FILES=$(git show --name-only --format="" HEAD 2>/dev/null || true)

if ! echo "$LATEST_FILES" | grep -qx "CHANGELOG.md"; then
  MSG="Reminder: every commit should update CHANGELOG.md [Unreleased]. Update CHANGELOG.md and amend if necessary."
  if [[ "$IS_ANTIGRAVITY" == true ]]; then
    printf '{"injectSteps":[{"systemMessage":"%s"}]}\n' "$MSG"
  else
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}\n' "$MSG"
  fi
fi

exit 0
