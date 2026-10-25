# 11 · Decisions, Open Questions, Risks, Validation Log

## 1. Decisions made

These are final unless the owner reopens them. Each decision with an ADR id becomes that ADR in P4-T01 (07 §4). Rows
marked — are recorded here only.

| ID | Decision | Made by | Rationale | ADR |
|---|---|---|---|---|
| D-01 | The cache is **Upstash Redis free**. The owner first picked Redis Cloud free, then switched to Upstash after the audit. | owner, 2026-10-23 | Redis Cloud Free has no TLS, 100 ops/s, no persistence, and deletes the database after 14 days of inactivity. Upstash has TLS, 10K cmd/s and 256 MB. | ADR-0002 |
| D-02 | No HMAC envelope on cache values | planner | TLS plus token auth on Upstash. The HMAC was only needed for plaintext Redis Cloud. | ADR-0002 |
| D-03 | Immutable cache generations with an atomic `MULTI` pointer swap. The publisher is the **single writer**, and it builds from a Postgres snapshot after the DB write. | planner | Readers never see a half-written cache, and hits agree with the DB fallback | ADR-0003 |
| D-04 | The API **never writes Redis**: no lazy refill and no locks | owner requirement ("backend reads cache only, DB is fail-safe") + command budget | One writer, and a minimal command count | ADR-0001, ADR-0003 |
| D-05 | Scheduled scraping runs on **GitHub Actions, daily** at cron `17 6 * * *` with `--workers=4` | owner (daily Actions), planner (time, workers) | Free; off-the-hour avoids delayed runs; private runners have 2 cores | ADR-0010 |
| D-06 | Remove Redis change detection (`job:<id>:hash`). The DB `contentHash` comparison is the only detector. | planner | Fixes 09 #30 and #7, and saves memory and commands | ADR-0004 |
| D-07 | `salaryInterval` is ignored unless `salaryMin` is set, and the UI stops sending it | planner | It currently hides about 63% of jobs | ADR-0007 |
| D-08 | The fixer runs **automatically after each scheduled scrape** when the report has actionable issues | owner | — | ADR-0006 |
| D-09 | The fixer works on a branch `auto-fix/<runId>`, commits, and a deterministic CI step pushes **the branch** and opens a PR. Agents never push to `main` and never merge. | owner | Human review before any change ships | ADR-0006 |
| D-10 | A company is quarantined after 3 consecutive confirmed 404s, and its jobs are deactivated. Fetch failures alone never deactivate a company; at 7 failures in a row an actionable issue is raised. | planner | Stale jobs disappear without data loss on transient outages | ADR-0009 |
| D-11 | The CI fixer runs on **Claude Code** (`anthropics/claude-code-action@v1`), not on Antigravity | planner | `agy` headless documents no CI auth (checked 2026-10-23) | ADR-0005 |
| D-12 | `frontend/` is the only frontend. `documentation/frontend-design/` was retired in `22afd64`. | owner | It described a Next.js app that was never built | — |
| D-13 | JobPosting JSON-LD is off by default (`VITE_ENABLE_JOBPOSTING_JSONLD=false`) | planner | Google's job-posting policy expects employer-provided data | — |
| D-14 | One canonical agent context (`AGENTS.md`, `documentation/agents/**`, `.agents/skills/**`) with thin Claude and Antigravity shells, kept in sync by a parity test | planner | The current copies already contradict each other | ADR-0008 |
| D-15 | Purging the Vercel CDN after a publish is optional, and happens only if `VERCEL_TOKEN` is set. Otherwise, normal staleness is about 5–10 min after a publish: CDN `s-maxage=300` plus the 300 s pointer cache. `stale-while-revalidate` allows up to 1 h, and `stale-if-error` up to 24 h during outages. | planner | Avoids needing another secret | — |
| D-16 | Rate limiting uses one Vercel WAF rule (120 req / 60 s / IP on `/v1/`) plus a per-instance `dbGuard`. The in-memory limiter and the client gate are removed. | planner | The in-memory limiter doesn't work on serverless, and 10/min blocks real users | ADR-0011 |

## 2. Open questions

Each one has a recommended default. The implementer proceeds with the default unless the owner says otherwise.

| ID | Question | Recommended default | Decides | When |
|---|---|---|---|---|
| Q-01 | Upstash free limits: the FAQ says **10,000 requests/day**, the pricing page says **500K/month**. Still unconfirmed: the concurrent-connection limit, and which of the two command limits applies. TLS and the budget error text are confirmed (03 §1). | Design for 10K/day (already done). Record the real values in P0-T01. | implementer (verify) | P0 |
| Q-02 | Is the repo private? (An unauthenticated GitHub API call returned 404, so it probably is.) | Private: 2,000 Actions min/month, 2-core runners, `--workers=4` | owner confirms | P0 |
| Q-03 | Use ioredis over `rediss://`, or the `@upstash/redis` REST client? | ioredis, unless P0-T01 finds a connection limit below 50, in which case switch the **API** to REST and keep ioredis for the publisher | implementer | P0/P2 |
| Q-04 | Which Vercel project serves prod: the repo root (`vercel.json`) or `frontend/`? | Root. Delete `frontend/vercel.json` in P2-T08 once confirmed. | owner confirms | P0 |
| Q-05 | Regions | Vercel `iad1`; Neon and Upstash in AWS us-east-1 | owner confirms | P0 |
| Q-06 | Fixer cost ceiling | `--max-budget-usd 5` per run, at most one fixer run per day, so at most about $150/month. Set a monthly spend limit in the Anthropic console. | owner | P4 |
| Q-07 | Publish the cache after a partial worker failure? | No (`skipped_incomplete_run`). Revisit after 30 runs. | owner | P2 |
| Q-08 | What if details exceed their budget? | Store the newest jobs up to `CACHE_DETAILS_MAX_BYTES`; older details come from Postgres | default | P2 |
| Q-09 | Automate tagging after a release PR merges (`release.yml`), or tag by hand? | Owner tags by hand: `git tag vX.Y.Z && git push --tags` | owner | P4 |
| Q-10 | Neon storage headroom (1 GB free) | Measure in P0-T04. If above 700 MB, plan to slim `metadata` (for example, drop the raw compensation blobs). | implementer | P0 |
| Q-11 | If the repo becomes public, scheduled workflows are disabled after 60 days without activity | Accept it. Fixer PRs and merges count as activity; add a runbook note. | owner | P3 |
| Q-12 | Move from `prisma db push` to `prisma migrate`? | Keep `db push --skip-generate` (it refuses destructive changes) through P5. Revisit when a destructive change is needed. | owner | later |
| Q-13 | Is a WAF limit of 120/min/IP right? | Yes. A fast user makes 20–30 calls/min, and the CDN absorbs repeat calls. | default | P2 |
| Q-14 | Monetization. Vercel Hobby is **non-commercial** (no ads, affiliate links or paid placements). | No monetization. If that changes, move to Vercel Pro or Netlify first. | owner | any |
| Q-15 | Fixer throughput | At most 3 issues per run and 3 open `auto-fix` PRs; stop a fingerprint after 2 failed attempts | default | P4 |
| Q-16 | Schedule discovery (CDX/CommonCrawl) weekly? | Optional (P5-T11). Not needed for correctness. | owner | P5 |
| Q-17 | Does `claude-code-action@v1` load `CLAUDE.md`, `.claude/settings.json`, skills and subagents in automation (`prompt`) mode? | **Likely yes.** The source defaults to `settingSources: ["user","project","local"]` (round-1 validation). Confirm on a test branch in P4-T08 step 1; if skills don't load, inline the skill text into `prompt`. | implementer | P4 |

## 3. Risks (not legal advice)

| Risk | Note | Mitigation |
|---|---|---|
| Terms of service and redisplay | Redisplaying companies' public postings may conflict with Ashby's or employers' terms | Link out to the source. Don't present the site as the employer. Honour takedown requests. Owner to review. |
| Ashby `robots.txt` disallows `/api/` | The GraphQL fallback (`/api/non-user-graphql`) falls under that path | Owner decision. Option: put the fallback behind a flag and measure how much data it provides (the latest run had 0 fallbacks). |
| Free-tier quota changes | Upstash, Neon, Vercel and GitHub have all changed their free tiers before | Doc 14 records the "checked on" dates. `/health` and the run report surface the quota errors. |
| The automated fixer makes a wrong change | The agent could produce a plausible but wrong fix | Human review on every PR, branch protection, the deterministic gate, scope limits, at most 3 issues |
| Cost overrun | API usage from the fixer | Budget caps per run and per day; a monthly limit in the console |
| A secret leaks in logs | — | No secrets in the fixer job; `.env` and `apikeys` reads are denied; Actions masks secrets |

## 4. Validation log

This section is filled in by the two validation rounds (see `00-README.md` §4).

### Round 1: fact check (claims vs code and dated sources), 2026-10-23

Three independent validators checked 01/04/06, 03/05/10 and 02/07/08/09. They found 61 issues in total, and all 61 are
applied. The material corrections were:

1. **GAP-AG-01 was wrong.** `.claude/settings.local.json` was never tracked; the owner's global gitignore blocks it.
   - It is downgraded to S3: add the path to the repo `.gitignore`, and note that the tracked `.codex/hooks.json`
     (Codex only) can download the impeccable binary.
   - P1-T01 and 08 §4 were rewritten.
2. **The details cache would have broken a provider limit.** A single 119–160 MB hash is over Upstash's 100 MB max
   record size, so details are now **sharded into 8 hashes** (`jc:v1:details:<crc32(id)%8>`, each ≤ 20 MiB).
3. **Upstash facts confirmed:**
   - TLS is always on.
   - Eviction is off by default.
   - MULTI/EXEC are billed as N+2, and every command in a pipeline is billed.
   - The budget error text is known.
   - The command budget was recomputed: a first fill is about 230 commands and a daily delta is ≤ 60.
   - The pointer cache was raised to 300 s.
4. **The CI fixer's push guardrail was false.** `claude-code-action` rewrites `origin` with its token, so the action now
   gets `github_token: ${{ github.token }}` (read-only). The write-capable App token is minted only after the agent step.
5. **Action versions updated:** cache v6, download-artifact v8, create-github-app-token v3 (`client-id` replaces
   `app-id`). The secret was renamed to `FIXER_APP_CLIENT_ID`.
6. **The ioredis client needs an explicit `connect()`.** With `lazyConnect` and `enableOfflineQueue:false`, the first
   command after a cold start or an idle disconnect is rejected.
7. **Scraper details:**
   - Check `notFound` before `source`.
   - Set `lastSeenAt` with raw SQL so `updatedAt` keeps its meaning.
   - Use `Prisma.DbNull` for `postalAddress`.
   - Standalone publishing uses a `runAll({ publish })` option.
   - The gate reads its previous values from `meta:lastPublish`.
   - The country backfill also recomputes `contentHash`.
   - The CSV has no country column.
8. **Missing test impact added:** `tests/unit/ScraperCore.test.ts` cases break under P1-T04/T07, and the plan now
   says to rewrite them.
9. **Detail ids:** Ashby ids are UUIDs too. Any UUID → details shard → DB `OR(id, ashbyId)`.
10. **Antigravity hooks:** `PostToolUse` output is ignored, so the reminder uses `PostInvocation` `injectSteps`.
11. **Smaller fixes:**
    - Claude Code loads `AGENTS.md` natively only when there is no CLAUDE.md, so we rely on the import.
    - The cold-start check uses `/context`.
    - Q-17 is likely answered (`settingSources` defaults to user/project/local).
    - The P1-T21 grep is fixed.
    - `Intl.DisplayNames` is wrapped in try/catch.
    - Both Apply buttons are covered.
    - The `NULLS LAST` index note is corrected.
    - A single `.md` writer: the classifier.

The validators also confirmed:
- The code baseline: 16 suites and 79 tests, tsc 0 errors, lint 0 errors and 1 warning.
- Every Server.ts/Scraper.ts line reference.
- The 16-field hash.
- The 09 §5 stale-claim table.
- The Prisma `nulls: 'last'` and `@@index(sort: Desc)` syntax.

Not verified: the UI devDependency versions (the registry query was denied, so the implementer runs `npm view` before
pinning) and the Antigravity changelog version numbers.

### Round 2: cross-file consistency and cold-start read, 2026-10-23

Two fresh validators ran this round.

**Consistency checker.** It found 44 issues: 13 traceability, 16 naming and 15 contradictions. It found no broken
links. All are applied.
- Every task now names its gaps, and every S1/S2 gap maps to an existing task.
- P5 got a full task table (P5-T01…T11).
- The details key name is now the sharded form everywhere.
- Only the publisher module writes `jc:v1:meta:lastScrapeAt`, through `recordScrapeFinished()`.
- `meta:lastPublish` carries the gate inputs.
- The gate thresholds are aligned: the publish gate stays at 0.7× / 0.8× (R-GATE-1), and R-GATE-2 is a new early
  warning at 20% / 15%.
- The 02 diagrams match the 03 order (details, then generation, then a MULTI with PERSIST; read path pointer, then
  manifest, then LRU, then HGET).
- `tsc -p tsconfig.test.json` was added to every check list.
- Exit 2 no longer opens an alert issue.
- The P1-T01 ignore check uses `core.excludesFile=/dev/null`.
- The 03 budgets sum within the peak (details are now ≤ 152 MiB).
- The ADR list is extended to ADR-0012.
- The doc-number convention is now in 00 §5.

**Cold-start implementer**, who read only this folder. It correctly derived the implementation of P1-T04, P1-T07,
P2-T03 and P4-T08, the API failure behaviours, and the end-to-end loop. It flagged about 21 ambiguities, all resolved:
- `/health` now counts `active AND isListed`, with a 10-minute cache in P1, so the P1 equality check can pass.
- The publisher owns the sanity gate, with a `--force` override.
- R-INFRA-1 takes precedence over every other rule.
- `regressed` means a fingerprint that came back. Category alone no longer counts.
- The issues file is uploaded in the artifact.
- The classifier owns `run-history.json`.
- Fix attempts are tracked with `fix-failed` issues (ADR-0012).
- Test runs use a `fixture_report` dispatch input with `report:install-fixture`, and the fixer checks out
  `github.sha`. `--workers=0` can't force a failure, because it is ignored.
- The content-hash field list is explicit and excludes `_source`. Hashing moves after sanitize and normalization.
- When `lastSeenAt` is set is defined, and the tests use a stateful Prisma factory.
- Details are fully refreshed weekly, because the embedded `company.jobCount` would otherwise go stale.
- The detail endpoint uses one query with `_count`, replacing two dependent queries.
- Cacheability is checked before any Redis command.
- The dry run doesn't read detail rows.
- The generation id hash, the `publish` run mode and the publisher client options are defined.
- 20 countries are cached, matching the facets.
- The P1-T02 cold-start check expects today's answers.
- The docs-diff gate ignores the generated-date line.
- The CHANGELOG `[Unreleased]` policy for P1–P3 is stated.

It also confirmed against code that the invalid-`applyUrl` example was wrong: such URLs are repaired, so they show up
as `validation_sanitized`. The example now uses `invalid_or_duplicate_id`.

**Not covered by either round:** live provider behaviour (Upstash connection limit, Antigravity hook arg keys and
skill paths, Vercel `x-forwarded-uri`). These are explicit verification steps in P0-T01, P4-T06 and P2-T08/04 §4.8.
