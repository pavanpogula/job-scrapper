# ADR-0017: Agents publish task branches through a guarded push script

- Status: Accepted
- Date: 2026-10-26
- Deciders: owner
- Related: ADR-0006 (fixer branch and PR), ADR-0016, `scripts/agents/push-branch.sh`

## Context
`.claude/settings.json` denied every `git push`, so interactive agents (Claude Code, Antigravity, Codex) could not
publish their work and the owner had to push every branch by hand. Git cannot open a pull request by itself, and
agents run with the owner's own git credentials, so GitHub cannot distinguish an agent push from an owner push.

## Options Considered
1. **Allow `git push` patterns in settings:** prefix patterns cannot reliably exclude `main` (`HEAD:main`,
   `refs/heads/main`, upstream defaults) or force flags.
2. **Give agents `gh` or a GitHub token to open PRs:** adds an API credential and the power to merge or edit settings.
3. **A single guarded script is the only allowed push:** plain git, explicit refspec, no options except `--dry-run`.

## Decision
Option 3. `scripts/agents/push-branch.sh [--dry-run] [<local>[:<remote>]]` pushes a new branch or a fast-forward
update of an existing one. It refuses `main`/`master` in every spelling, force, tags, deletes, mirror remotes,
detached HEAD, a dirty tree, non-github origins and diffs touching `.env*`, `apikeys/`, `output/` or `.vercel/`,
and prints the pull-request link. Claude settings (root, `backend/`, `frontend/`) allow only that script to push,
keep `Bash(git push *)` denied and deny `Bash(gh *)`. A GitHub ruleset on `main` blocks force pushes and deletion
for everyone. The CI fixer is unchanged (ADR-0006): it commits only, and a deterministic CI step pushes.

## Consequences
- Agents can publish and update their task branches; the owner still reviews and merges every PR.
- Antigravity and Codex are bound by the rule text (`docs/agents/rules/secrets-and-git.md`), not by Claude
  settings; the `main` ruleset is the server-side backstop for force-push and deletion.
- Rewritten branches cannot be force-pushed by agents; they push a new branch or the owner pushes.
- Guarded by `scripts/repo-tests/agent-push-guard.test.mjs` (real pushes to a local bare remote).
