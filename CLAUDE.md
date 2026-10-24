# CLAUDE.md

Auto-loaded by Claude Code at session start. Imports canonical agent rules and context.

@AGENTS.md
@documentation/agents/context.md

---

## Claude Code Specifics

- Shared configuration lives in `.claude/settings.json`. Developer overrides live in `.claude/settings.local.json` (gitignored).
- Run checks: `npx tsc --noEmit -p . && npm run lint && npm test`.
- Conventional Commits: subject line + bulleted body describing root cause, changes, tests, and docs.
- Never push to `main`; work on feature branches only.
