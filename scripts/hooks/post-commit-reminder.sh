#!/usr/bin/env bash
# Post-commit reminder hook for Claude Code and Antigravity
# Warns if a git commit command was executed and the latest commit does not include CHANGELOG.md

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

# Hooks always send a JSON payload; no payload means there is no tool command to check
if [[ -z "$INPUT" ]]; then
  exit 0
fi

# If stdin was provided, extract the command and verify it's a git commit
if [[ -n "$INPUT" ]]; then
  CMD=$(node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        const data = JSON.parse(input);
        const cmd = data.tool_input?.command ||
                    data.toolCall?.args?.CommandLine ||
                    data.command ||
                    "";
        process.stdout.write(cmd);
      } catch (e) {
        process.stdout.write("");
      }
    });
  ' <<< "$INPUT" 2>/dev/null || true)

  # If a command was found in stdin and it is not a git commit, exit immediately with no output
  if [[ -n "$CMD" ]]; then
    if ! echo "$CMD" | grep -Eq '\bgit\s+commit\b'; then
      exit 0
    fi
  else
    # Stdin was provided but contained no recognizable tool command
    exit 0
  fi
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
