# 08 · Agent Setup: Claude Code and Google Antigravity

> **Goal:** a fresh Claude Code or Antigravity session in this repo knows at launch:
> - what the system is
> - how the scraper, API and cache work
> - how the error → fix → decision → release loop runs
> - which agent handles which job
>
> **Owner decision D-14:** one tool-neutral source of truth, with thin tool-specific shells and a parity test.
>
> Tasks: P1-T01, P1-T02, P4-T04…T07, P4-T09.
>
> All formats were checked on 2026-10-23:
> - Claude Code docs: https://code.claude.com/docs/en/ (`sub-agents`, `skills`, `memory`, `hooks`, `settings`,
>   `permissions`, `headless`, `github-actions`)
> - Antigravity docs: https://antigravity.google/docs/ (`rules`, `skills/`, `subagents/`, `hooks/`,
>   `migration/workflows-to-skills/`, `cli/headless/`; changelog up to App v2.26.0, 2026-10-22)

## 1. What each tool loads

| | Claude Code | Antigravity |
|---|---|---|
| Always-loaded project file | `CLAUDE.md`, with `@path` imports (relative, max 4 hops, not expanded inside code fences). By default it reads `AGENTS.md` natively **only when there is no `CLAUDE.md`**. We keep a `CLAUDE.md` shim, so `AGENTS.md` loads through `@AGENTS.md`. | Root `AGENTS.md` and `GEMINI.md`, plus `AGENTS.md` in subdirectories walking up from the edited file. No frontmatter. |
| Rules | `.claude/rules/*.md`. With `paths:` frontmatter a rule loads only when a matching file is touched; without it the rule loads at launch. | `.agents/rules/*.md`, top level only. **Requires** `trigger: always_on \| model_decision \| glob \| manual`. A missing or invalid trigger means the rule is **silently ignored**. Includes use `@[label](relative/path)`. Each rule is capped at 24,000 bytes after includes. Always-on rules share a 20,000-token budget. |
| Subagents | `.claude/agents/<name>.md`. Frontmatter: `name`, `description` (required); `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `memory`, `effort`, `isolation`, … | `.agents/agents/<name>.md`. Frontmatter: `name`, `description` (required); `tools` (list, e.g. `view_file`, `grep_search`, `run_command`, `replace_file_content`; empty by default), `model` (`inherit\|flash\|pro`), `commandExecutionPolicy` (`off\|auto\|eager\|sandbox`, default `sandbox`), `skills`. |
| Skills / commands | `.claude/skills/<name>/SKILL.md`, invoked as `/name`. Commands are merged into skills. `description` + `when_to_use` are truncated at 1,536 characters. Keep each skill under 500 lines. | `.agents/skills/<name>/SKILL.md` (`description` required). The model decides when to use it, or the user types `/name`. **Workflows stopped working on 2026-10-19**, so use skills. |
| Hooks | `.claude/settings.json` → `hooks.<Event>[{matcher, hooks:[{type:"command", command, timeout, if}]}]`. Plain stdout from `PostToolUse` is **not** shown to Claude; return JSON `hookSpecificOutput.additionalContext`. | `.agents/hooks.json` → `{ "<hookName>": { "<Event>": [{matcher, hooks:[{type:"command", command, timeout}]}] } }`. Events: `SessionStart`, `PreToolUse`, `PostToolUse`, `PreInvocation`, `PostInvocation`, `Stop`. Default timeout 30 s. |
| Shared settings | `.claude/settings.json` is committed. `.claude/settings.local.json` is personal and **must not be committed**. | — |
| Headless / CI | `anthropics/claude-code-action@v1`. In automation mode it defaults to `settingSources: ["user","project","local"]` (from `base-action/src/parse-sdk-options.ts`), so CLAUDE.md, `.claude/settings.json`, skills and agents all load. If you ever run `claude -p` directly, don't use `--bare`, which disables those. The docs say `--bare` will become the default for `-p`, so pin the behaviour with `--setting-sources user,project,local`. | `agy -p` has no documented CI auth, so **it is not used in CI** (ADR-0005) |
| Ignores | — | `.claude/` is not read by Antigravity |

## 2. Target file layout

```
AGENTS.md                                   CANONICAL ≤ 6 KB: what/flow/hard rules/roster table/loop summary → links
CLAUDE.md                                   SHIM: @AGENTS.md + @documentation/agents/context.md + Claude-only notes (≤ 40 lines)
documentation/agents/context.md             CANONICAL ≤ 6 KB: architecture in brief, commands, key files, invariants index, gotchas
documentation/agents/roster.md              CANONICAL: the 6 roles, routing table
documentation/agents/roles/<role>.md        CANONICAL: one file per role (responsibilities, read-first list, allowed scope, output contract)
.agents/skills/<skill>/SKILL.md             CANONICAL procedures (both tools read .agents/skills; Claude via symlink)
.claude/skills/<skill> -> ../../.agents/skills/<skill>    symlinks (incl. impeccable; replace the diverged copy)
.claude/agents/<role>.md                    SHELL: frontmatter + "Read documentation/agents/roles/<role>.md first"
.claude/rules/scraper-invariants.md         SHELL: paths: src/core/**, src/lib/** → read doc 10 + 11 §6 before editing
.claude/settings.json                       committed: permissions + hooks (see §5)
.agents/rules/00-scraper-context.md         SHELL: trigger: always_on; @[Scraper context](../../documentation/agents/context.md)
.agents/rules/10-secrets-and-git.md         SHELL: trigger: always_on; the hard rules (short, inline)
.agents/rules/20-scraper-invariants.md      SHELL: trigger: glob; globs: src/core/**,src/lib/**; short invariant index + link to doc 10 (doc 10 is 27 KB > 24 KB cap)
.agents/rules/30-api-cache.md               SHELL: trigger: glob; globs: src/api/**,api/**,src/lib/cache/**,src/cache/**
.agents/rules/40-frontend.md                SHELL: trigger: glob; globs: job-scrapper-ui/**
.agents/agents/<role>.md                    SHELL: same pointer body as the Claude shell
.agents/hooks.json                          SHELL: calls the same scripts/hooks/*.sh
scripts/hooks/post-commit-reminder.sh       shared hook logic (handles both tools' stdin shapes)
tests/unit/AgentShells.test.ts              parity test (§6)
```

Explicitly **not** created:
- `GEMINI.md`, which would duplicate `AGENTS.md`
- `.agent/` (the singular legacy path)
- Antigravity workflows, which are dead
- a generator script, which is overkill for 6 roles

## 3. Content of the canonical files

### 3.1 `AGENTS.md` (rewrite in P1-T02, ≤ 6 KB, so its tokens fit the always-on budget)

1. **What it is (3 lines).** An Ashby job scraper (CLI) feeds Neon Postgres and an Upstash Redis cache. An Express API
   on Vercel reads the cache first, with Postgres as fail-safe. A React UI in `job-scrapper-ui/` calls the API.
   Users only browse and click Apply.
2. **Flow (5 bullets):** discover/seed → `scrape:parallel` (daily GitHub Actions) → DB write → cache publish →
   API → UI. Link `documentation/15-system-architecture-and-flows.md`.
3. **Hard rules:**
   - Never read, print or commit `.env`, `apikeys/` or `output/` values.
   - Agents never push to `main` and never merge.
   - Every change syncs the docs, runs `docs:generate`, passes `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json &&
     npm run lint && npm test && npm run verify:ui` (each check is added as its phase lands), and is committed with a Conventional Commit plus a bulleted body.
   - Every new file and function gets JSDoc `@file` / `@summary` / `@tags`.
4. **Roster table:** the 6 roles, one line each, linking `documentation/agents/roster.md`.
5. **Loop summary (6 lines):** link `documentation/16-self-healing-loop.md`.
6. **Where to look:** a table mapping topic → doc number.

### 3.2 `documentation/agents/context.md` (P1-T02, ≤ 6 KB)

- **Components and entry points:**
  - `src/core/{Scraper,ClusterScraper,ScraperCSV}.ts`
  - `src/cache/Publisher.ts`
  - `src/api/Server.ts`
  - `api/index.ts`
  - `job-scrapper-ui/src/*`
- **Commands:** `scrape:parallel [-- --workers=N]`, `cache:publish`, `report:classify`, `verify`, `api:start`,
  `verify:ui`.
- **Data facts:**
  - Change detection is a `contentHash` over 16 fields + metadata (after P1-T06), compared against the DB. There is
    no Redis change detection.
  - Cache keys follow `jc:v1:*` (03).
  - The error doc is `output/reports/<YYYY-MM>/<runId>.json|md`.
- **Invariants index:** BF-001…BF-0nn, one line each with its guard status. Link to doc 10.
- **Top gotchas:**
  - Some files execute on import (`DbMenu`, `DbInspect`, `GenerateDocs`).
  - `tsc` and lint used to cover `src/` only (until P3-T01).
  - `JOBS.md` is 5 MB.
  - Exit codes are 0/1/2.

### 3.3 `documentation/agents/roster.md` and `roles/*.md` (P4-T04)

Every role reads `AGENTS.md`, then `documentation/agents/context.md`, then its own role file, before it does anything.

| Role | Job | Reads first (beyond the 3 above) | May edit | Output |
|---|---|---|---|---|
| `scraper-architect` | Explains and plans; never edits | 15, 02, 05, 10 | nothing | Explanation or plan with `path:line` |
| `run-reviewer` | Triages an error doc: actionable vs noise, and gates the fixer. Never edits. | 16, 08, 09, `CHANGELOG.md` | nothing | `{actionable, issues[]}` with BF and 09 refs |
| `scraper-bugfixer` | Runs the fix protocol (07 §8) | `CHANGELOG.md`, `decisions/README.md`, 16, 10, 11 §6, 09, the error doc | the scope in 07 §7 | Commits on the current branch, plus a BF entry, ADR, CHANGELOG entry and run summary |
| `api-cache` | Owns `src/api/**`, `api/**`, `src/lib/cache/**`, `src/cache/**`, `vercel.json` and API tests | 12, 05 (cache section), plan 03/04, 14 | its paths | Code, tests, docs 12/05/07 |
| `frontend` | Owns `job-scrapper-ui/**` only; may use `impeccable` in audit mode | 13, 12, `job-scrapper-ui/src/types/api.ts` | its paths | UI code, UI tests, doc 13 |
| `docs-release-keeper` | Keeps docs and agent files true, cuts releases (`/release`), keeps the ADR index, runs `docs:generate` and the parity test, refreshes verification stamps | `documentation/README.md` fact-owner table, `CHANGELOG.md`, `decisions/README.md`, `documentation/agents/**` | `documentation/**`, `CHANGELOG.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, agent shells | Doc edits, release PRs |

**Routing:**

| Request | Agent |
|---|---|
| "explain" or "plan" | `scraper-architect` |
| An error-report issue | `run-reviewer` → `scraper-bugfixer` |
| API, cache or Vercel | `api-cache` |
| UI | `frontend` |
| Docs, release or agent files | `docs-release-keeper` |

### 3.4 Procedure skills (P4-T05, in `.agents/skills/`, symlinked into `.claude/skills/`)

| Skill | Trigger (description) | Steps |
|---|---|---|
| `fix-from-error-report` | "Fix actionable issues from a scrape error report. Use when given an error report path, or after a scheduled run." | The 9-step protocol in 07 §8, with the scope limits in 07 §7. Stops after 3 issues. Never pushes. |
| `review-run` | "Triage a scrape run report: classify actionable vs noise." | Read the report and history; apply the 07 §3 rules; output JSON |
| `record-decision` | "Write an ADR for a decision made in this change." | Next number from `decisions/README.md`; use the template (07 §4); update the index |
| `release-notes` | "Add a CHANGELOG Unreleased entry for this change." | Root cause, fix, guarding test, ids. Same commit. |
| `release` | "Cut a release from CHANGELOG Unreleased." | 07 §5: branch `release/x.y.z`, version bump, PR |
| `verify-change` | "Run all mandatory checks before committing." | `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate` |

Example skill, `.agents/skills/release-notes/SKILL.md`:

```markdown
---
name: release-notes
description: "Add a CHANGELOG.md [Unreleased] entry for the current change (root cause, fix, guarding test, BF/ADR/GAP ids). Use before every fix or feature commit."
---
1. Read `git diff --cached --stat` and the BF/ADR ids you created.
2. Under `## [Unreleased]`, add the entry to the right Keep-a-Changelog section (Fixed/Added/Changed/Removed/Security).
3. One bullet: what users/operators notice; then "Root cause: …; fix: …; guard: <test file> \"<test name>\" (BF-xxx, ADR-xxxx, GAP-…)".
4. Stage CHANGELOG.md so it lands in the same commit. Do not commit or push from this skill.
```

### 3.5 Shell examples

`.claude/agents/scraper-bugfixer.md`:

```markdown
---
name: scraper-bugfixer
description: "Fixes actionable issues from a scrape error report using the self-healing protocol. Use when asked to fix scrape errors or given an error report path."
tools: Read, Grep, Glob, Edit, Write, Bash
model: inherit
maxTurns: 60
skills: [fix-from-error-report, record-decision, release-notes, verify-change]
---
Read documentation/agents/roles/scraper-bugfixer.md first and follow it exactly. Never push, never switch to main, never edit files outside the allowed scope listed there.
```

`.agents/agents/scraper-bugfixer.md`:

```markdown
---
name: scraper-bugfixer
description: "Fixes actionable issues from a scrape error report using the self-healing protocol. Use when asked to fix scrape errors or given an error report path."
tools: [view_file, grep_search, run_command, replace_file_content]
model: inherit
commandExecutionPolicy: sandbox
skills: [fix-from-error-report, record-decision, release-notes, verify-change]
---
Read documentation/agents/roles/scraper-bugfixer.md first and follow it exactly. Never push, never switch to main, never edit files outside the allowed scope listed there.
```

Notes on the Antigravity shell:
- Whether Antigravity's `write_to_file` tool can be named in subagent `tools` is UNVERIFIED. Test it in P4-T06.
- The Antigravity docs describe subagent `skills` as skill **paths**, for example `skills/my-helper-skill`. Bare names
  are UNVERIFIED. P4-T06 tests both forms and keeps the one that works, for example
  `skills: [skills/fix-from-error-report, …]`.
- Quote every YAML `description`. Antigravity v2.25.0 fixed a bug with colons in descriptions; quoting avoids it anyway.

`.agents/rules/00-scraper-context.md`:

```markdown
---
trigger: always_on
---
@[Scraper context](../../documentation/agents/context.md)
```

## 4. Committed settings (P1-T01)

1. Add `.claude/settings.local.json` to the repo `.gitignore`.
   - It is **not** tracked today (verified with `git ls-files`). Only the owner's global gitignore keeps it out, so
     another contributor could commit it by accident.
   - The tracked `.codex/hooks.json` runs the impeccable launcher on every edit and on Stop, and that launcher can
     download a binary. Only Codex reads this file. Keep it unless the owner says otherwise, and note it in doc 07.
2. Create `.claude/settings.json`:

   ```json
   {
     "permissions": {
       "allow": ["Bash(npx tsc --noEmit -p .)", "Bash(npm run lint)", "Bash(npm test)", "Bash(npm test *)",
                 "Bash(npx jest *)", "Bash(npm run verify:ui)", "Bash(npm run docs:generate)",
                 "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)"],
       "deny":  ["Read(./.env)", "Read(./.env.*)", "Read(./apikeys/**)", "Bash(git push *)"]
     },
     "hooks": {
       "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(git commit *)",
         "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/post-commit-reminder.sh", "timeout": 10 }] }]
     }
   }
   ```

   - `Bash(git push *)` in `deny` is a convenience, **not a security boundary**: `git -C . push` would not match it.
     The real guards are in 07 §7.
   - The impeccable hooks from the old local file move to each developer's own `settings.local.json`. If they are
     kept in the shared file, they must be scoped to `job-scrapper-ui/**` and skipped when `CI=true`, because they
     download a binary.
3. `scripts/hooks/post-commit-reminder.sh`:
   - It reads the hook JSON from stdin.
   - If the command was `git commit` and `CHANGELOG.md` was not in that commit (`git show --name-only HEAD`), it
     prints `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…update CHANGELOG [Unreleased] and amend…"}}`.
   - It exits 0, so it never blocks.
   - **Claude** reads the command from `.tool_input.command`.
4. **Antigravity differs:**
   - Its hook payload is `toolCall: {name, args}`. The exact arg key for the command is UNVERIFIED.
   - Its `PostToolUse` output is **ignored**: the hook can only return `{}`.
   - So `.agents/hooks.json` uses the **`PostInvocation`** event and returns `injectSteps` with a `systemMessage`
     reminder whenever `git log -1 --name-only` shows a commit without `CHANGELOG.md`.
   - Same script, with a `--antigravity` flag to switch the output shape. Verify it in P4-T06.

## 5. Plugin and skill hygiene (P4-T05)

- Replace `.claude/skills/impeccable`, which is a diverged full copy with a 17 MB binary, with a symlink to
  `../../.agents/skills/impeccable`.
- Pin `impeccable` in `skills-lock.json`.
- Leave `.codex/` and `.agents/skills/impeccable/agents/*.toml` alone. They are Codex-only and harmless.
- Exclude `.agents` and `.claude` from `scripts/GenerateDocs.ts` `EXCLUDED_DIRS` (09 #55). This is preventive:
  neither folder has `.ts` or `.prisma` files today.

## 6. Parity test (P4-T07): `tests/unit/AgentShells.test.ts`

The test asserts that:
1. Every role in `documentation/agents/roster.md` has `documentation/agents/roles/<role>.md`,
   `.claude/agents/<role>.md` and `.agents/agents/<role>.md`.
2. Both shells for a role have identical `name` and `description`.
3. Every shell body references its role file.
4. Every entry in `.claude/skills/` is a symlink that resolves into `.agents/skills/`.
5. Every `.agents/rules/*.md` file has a valid `trigger`, and `glob` rules have `globs`.
6. The UTF-8 byte sizes of `AGENTS.md` and `documentation/agents/context.md` together stay ≤ 12,288, and each file
   stays ≤ 6,144.
7. `CLAUDE.md` is ≤ 40 lines and imports both canonical files.
8. `.claude/settings.local.json` is not tracked (`git ls-files` doesn't list it), and the repo `.gitignore` contains
   that path.

## 7. Cold-start test (P4-T09; repeat after any change to the canonical files)

**Procedure:**
1. Start fresh sessions.
   - **Claude:** run `/context` and check that **Memory files** lists `CLAUDE.md`, `AGENTS.md` and
     `documentation/agents/context.md`.
   - **Antigravity:** run `/context`, then confirm `AGENTS.md` and `.agents/rules/00-scraper-context.md`.
2. Ask the 12 questions below and **forbid file reads**.
3. Pass mark is 12/12 in both tools.
4. Fix any failure in the canonical files only, never in a shell.
5. Record the results in doc 16's appendix.

Expected answers describe the state **after P1–P4**.

1. **What are the three runtime parts and how do they connect?**
   - The UI `job-scrapper-ui/` calls `/v1/*`.
   - Vercel routes `/v1/*` to `api/index.ts`, which runs `src/api/Server.ts`.
   - The API reads Upstash first (`jc:v1:*`), with Neon Postgres as fail-safe.
   - The scraper (`scrape:parallel`, daily in GitHub Actions) writes Postgres, then publishes a cache generation.
2. **Which command runs the scheduled scrape, and with how many workers?**
   - `npm run scrape:parallel -- --workers=4`, from `.github/workflows/scrape-daily.yml` at 06:17 UTC.
   - The default is `min(4, max(2, cpus))`.
3. **How are job changes detected?**
   - A `contentHash` over 16 fields + metadata, compared with the DB.
   - `createMany` for new jobs; an upsert for changed jobs or `!active` rows.
   - No Redis.
4. **What is in Redis, and who writes it?**
   - `jc:v1:current`, `jc:v1:gen:<gen>` (pre-rendered list, facet and company pages), `jc:v1:details:<0..7>`
     (sharded by `crc32(id) % 8`), `jc:v1:details:index`, `jc:v1:meta:*`
     and `jc:v1:lock:publish`.
   - Only the publisher writes them. The API only reads.
5. **Where is the error doc, and what is its schema?**
   - `output/reports/<YYYY-MM>/<runId>.json` and `.md`, schema v2.0.
   - Main parts: `run`, `summary`, `workers`, `cache`, `categories`, `issues` (fingerprints and statuses),
     `diffVsPrevious`, `events`.
6. **What happens if a worker crashes?**
   - `allSettled` and the watchdog let the coordinator save the report anyway.
   - The run exits 1, there is no publish, and the old generation keeps serving.
7. **When is a company quarantined?**
   - After 3 consecutive confirmed 404s, it becomes `NOT_FOUND` and its jobs are deactivated.
   - It is rechecked on Sundays.
   - Fetch failures alone never deactivate a company. At 7, they raise `company_unreachable`.
8. **Which endpoints exist?**
   - `/health`, `/v1/jobs`, `/v1/jobs/:id`, `/v1/facets`, `/v1/companies`, `/v1/meta`.
   - `pageSize` ≤ 100.
   - The `X-Cache` header says where data came from.
9. **What rate limiting exists?**
   - A Vercel WAF rule of 120 requests / 60 s / IP on `/v1/`.
   - A per-instance `dbGuard` of 3 concurrent + 10 queued, then 503.
   - No client-side gate.
10. **What must agents never touch, and what git actions are allowed?**
    - Never `.env`, `apikeys/` or `output/` values.
    - Work on a branch and commit only. CI pushes `auto-fix/*` and opens the PR. Never push to `main`, never merge.
11. **What happens when the scheduled run finds actionable issues?**
    - `report:classify` triggers the fixer job (Claude Code via `claude-code-action`).
    - It reads `CHANGELOG.md`, `decisions/`, doc 10 + 11 §6, doc 09 and the error doc.
    - It fixes at most 3 issues with tests and writes the BF, ADR, CHANGELOG and run summary.
    - The gate runs, then CI pushes the branch and opens a PR for the owner.
12. **Which checks gate every change?**
    - `npx tsc --noEmit -p . && npx tsc --noEmit -p tsconfig.test.json && npm run lint && npm test && npm run verify:ui && npm run docs:generate`.
    - `ci.yml` on every PR also type-checks `tests/`, `scripts/` and `api/`.
