# Reviewing a Lever PR (L1–L5) — reviewer prompt

> Owner: when Antigravity has pushed a Lever branch and printed the PR link, open a **new** Claude Code session in the repo
> root and paste: "Review Lever PR #<number> (phase L<n>). Follow docs/plans/lever/REVIEW.md exactly."
> This is the same review we did for every Greenhouse PR.

You are reviewing ONE pull request that implements phase L<n> of `docs/plans/lever/` (Lever as a third job source).
The phase prompt `docs/plans/lever/L<n>-*.md` is the spec; `00-PLAN.md` holds the verified facts and decisions.
Follow AGENTS.md, CLAUDE.md and docs/agents/rules/.

## Rules
- Never read, print, stage or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Never push to `main`, merge, force-push, run raw `git push` or `gh`. Never connect to production DB/Redis/API, never
  scrape, publish or deploy against prod. Never run `prisma generate` inside a worktree that symlinks `node_modules`
  (it rewrites the main folder's client).
- Do not change files in the owner's folder (Antigravity uses it and switches branches). Work in a separate worktree.
- Default: **report findings and stop.** Push a fix commit to the PR branch (with `scripts/agents/push-branch.sh` only)
  only if the owner says "fix it".

## Steps
1. **Map PR → branch first.** Fetch `https://github.com/<owner>/<repo>/pull/<number>` (public page) and read the head
   branch name from it; `git fetch origin`; confirm the branch's commits are the phase you were told. Do not review the
   wrong branch.
2. **Worktree:** `git worktree add <scratchpad>/wt-l<n> origin/<branch>`; symlink `node_modules` for root, `backend/`,
   `frontend/` from the main folder.
3. **Precondition and scope:** the branch starts from current `origin/main`; its diff matches the phase prompt's BUILD
   list — nothing missing, nothing from a later phase (e.g. L1 must not accept `?source=lever` in the API; L2 must not
   touch the API/UI). List any extra or missing items.
4. **Run the checks** in the worktree and paste the result lines:
   `scripts/check-all.sh --no-install` · `node --test 'scripts/repo-tests/**/*.test.mjs'` ·
   `node scripts/agents/sync-shells.mjs --check` · `npm --prefix backend run test:integration` against a **local
   throwaway Postgres only** (`TEST_DATABASE_URL` on localhost; e.g. embedded-postgres in the scratchpad) ·
   `npm --prefix backend run docs:generate` leaves no diff · L3: contract fixtures re-recorded twice → no diff.
5. **Read the code against the spec**, line by line for every BUILD item and every decision in 00-PLAN §2 the phase
   touches. Check especially:
   - Ashby and Greenhouse behaviour unchanged; telemetry message strings byte-identical; no existing test weakened
     (only the edits the phase allows).
   - Lever tokens keep case/`.`/`&`, are URL-encoded, and never come from the slug; slugs via `allocateCompanySlug`.
   - ≤ 1 Lever request/s for the whole run (pacer × worker count, initial delay, retries paced); only 429 sets
     `rateLimited`; Retry-After capped at 10 s; status codes decide 404, never body text.
   - Deactivation uses `lever:<uuid>` keys; the cap is applied in the coordinator; the Lever deadline exists (L2+).
   - No new `any`; JSDoc `@file/@summary/@tags` on new files and functions; no secrets or prod URLs in tests.
   - Workflows (L4/L5): no `--accept-data-loss`, no job-level concurrency on the discovery job, toggles default off.
6. **Behaviour proof** (local throwaway DB, never prod): L2+ seed `spotify,arcteryx.com`, scrape
   `--sources=lever --slugs=…`, then a second scrape rewrites 0 rows; L3 check the UI with Playwright/Chrome at 1440px and
   390px, light and dark (Source filter desktop + mobile, "via Lever" badge, company page board link).
7. **Docs checklist** — every box for this phase must be ticked in the diff (CHANGELOG `[Unreleased]` entry and
   `backend/docs/project-explorer.html` regenerated are required in **every** PR):

   | Phase | Docs that must change |
   |---|---|
   | L1 | `docs/decisions/ADR-0022-lever-source.md` (new) · `docs/decisions/README.md` · ADR-0021 "Extended by ADR-0022" line · `docs/README.md` (ADR + plan links) · `backend/docs/database-and-cache.md` · `backend/docs/module-reference.md` · `docs/agents/context.md` (room made, ≤ 6,144 bytes) + sync-shells · `docs/plans/lever/` committed |
   | L2 | `docs/bug-fix-log.md` BF-024 · `docs/testing.md` BF-024 row · `backend/docs/external-apis.md` Lever section · `backend/docs/architecture-and-workflows.md` · `docs/system-architecture-and-flows.md` ATS node · `backend/docs/module-reference.md` · `backend/docs/cli-commands.md` · `docs/self-healing-loop.md` · `docs/agents/context.md` BF-024 line |
   | L3 | `backend/docs/api.md` · `frontend/docs/frontend-ui.md` · `frontend/docs/testing.md` · ADR-0022 status · `PRODUCT.md` · root `README.md` · `.github/SECURITY.md` · About/Footer/`index.html` copy |
   | L4 | `backend/docs/external-apis.md` discovery · `backend/docs/cli-commands.md` · `docs/deployment-and-operations.md` · `backend/docs/outputs-and-artifacts.md` (state file) · `backend/docs/known-issues.md` (EU, Wayback 503s) |
   | L5 | `docs/deployment-and-operations.md` (enable/measure/rollback) · `docs/self-healing-loop.md` · `backend/docs/cli-commands.md` · ADR-0022 "Implemented" · `docs/agents/context.md` + sync-shells · root `AGENTS.md` Flow step 1 · README · `backend/docs/known-issues.md` |

   **Agent files (every PR, hard requirement):** the phase's "AGENT FILES" items are done in the canonical
   `docs/agents/` sources (never only in `.claude/`/`.agents/` copies), `node scripts/agents/sync-shells.mjs --check`
   passes, and `docs/agents/context.md` / `AGENTS.md` stay ≤ 6,144 bytes. A behaviour change with no matching
   agent-rule update is a finding.

   Also check the docs say what the code does (flag names, defaults, file paths), not what the plan hoped.
8. **Commit message**: Conventional Commit subject from the phase prompt + bulleted body (root cause, changes, tests,
   docs).

## Report (to the owner, plain language)
1. Verdict: **merge** / **merge after fixes** / **do not merge**.
2. Findings ranked most severe first: what breaks, for whom, file:line, and the fix.
3. Check results (pass/fail lines from step 4) and the behaviour proof from step 6.
4. Docs checklist: ticked / missing.
5. After-merge steps for the owner, copied from the phase prompt's ROLLOUT.
Then remove the worktree.
