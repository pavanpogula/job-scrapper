# 09 · Documentation Plan

> **Goal:** every doc is true, each fact lives in exactly one place, and both humans and agents can find the full flow
> quickly. Tasks: **P1-T02** (auto-loaded context), **P1-T22** (factual fixes), then one doc per feature task (P2-T09,
> P3-T04, P4-T01…T04, P5-T09).

## 1. Principles

1. **One owner per fact.** Other files link to the owning file instead of copying it (§3). The current copies in
   `AGENTS.md`, `README.md`, `documentation/README.md` and `CLAUDE.md` have already drifted apart (GAP-DOC-14).
2. **Auto-loaded context stays small.** `AGENTS.md` and `documentation/agents/context.md` must together be ≤ 12 KB.
   The parity test enforces this (08 §6).
3. **Use relative links only.** Replace all 32 `file:///` links (GAP-DOC-12).
4. **No hard-coded line numbers in reference docs.** Cite the symbol, for example `Scraper.ts › generateHash()`.
   `path:line` is fine in plans and ADRs, where it is a snapshot.
5. **Stamp every doc.** Put `> Verified: <YYYY-MM-DD> @ <shortSha>` under the title. The docs-release-keeper refreshes
   the stamp whenever it touches the doc.

## 2. Target structure

```
README.md                                       human entry point (rewrite, §4)
AGENTS.md                                       canonical agent entry (08 §3.1)
CLAUDE.md                                       shim (08 §2)
CHANGELOG.md                                    NEW release doc (07 §5)
.env.example                                    fixed: REDIS_URL optional (rediss:// Upstash), PORT, CORS_ORIGINS, HEALTH_TOKEN, CACHE_*
frontend/.env.example                    NEW: VITE_API_BASE_URL
documentation/
  README.md                                     index + fact-owner table + TL;DR (rewrite)
  agents/context.md · roster.md · roles/*.md    NEW (08)
  01-overview.md … 11-testing-guide.md          kept; facts corrected (§5); 10 = BF registry only
  12-backend-api.md                             NEW (P2-T09) — the API contract + cache read path
  13-frontend-ui.md                             NEW (P5-T09)
  14-deployment-and-operations.md               NEW (P3-T04) — Vercel, Actions, Neon, Upstash, secrets, runbook
  15-system-architecture-and-flows.md           NEW (P1-T22 skeleton, completed P4-T03) — all-component Mermaid flows
  16-self-healing-loop.md                       NEW (P4-T03) — THE protocol
  decisions/README.md + ADR-nnnn-*.md           NEW (P4-T01)
  runs/<runId>.md                               NEW (written by fixer PRs)
  plan/                                         this plan (frozen after implementation; mark "historical" at the end)
```

## 3. Fact-owner table

This table goes into `documentation/README.md`.

| Fact | Owner |
|---|---|
| Schema, `contentHash` fields, field mapping | 05 |
| Redis key schema and cache semantics | 05 (summary), 12 (read path) |
| External APIs called (Ashby, CDX, Drive) | 03 |
| Our API contract | 12 |
| UI routes, state and API calls | 13 |
| Env vars | 07 |
| CLI commands | 04 |
| Deploy, schedule, secrets, runbook | 14 |
| System flows | 15 |
| Self-healing protocol | 16 |
| BF invariants and guard status | 10 (registry) + 11 §6 (test mapping) |
| Known issues | 09 |
| History | `CHANGELOG.md` + `decisions/` |

## 4. README rewrite (P1-T22, then each phase updates its own section)

The README should have these sections, in this order:
1. **Title.** One line saying what it is, plus the live URL.
2. **Architecture.** A Mermaid diagram (a copy of 02 §2, simplified).
3. **Features.** Grouped by UI, API, Scraper, Cache and Loop.
4. **Quick start.**
   - (a) A database-only scrape: `npm install`, then `cp .env.example .env`, `npx prisma db push`,
     `npm run seed -- --all`, `npm run scrape:parallel`, `npm run verify`.
   - (b) Run the API and UI locally: `npm run api:start` on :3001, plus `npm --prefix frontend run dev` on
     :3000, which proxies `/v1`.
5. **Environment table.** Links to 07.
6. **Scripts table.** Include `build`, `api:start`, `cache:*`, `report:classify`, `db:normalize-countries`,
   `verify:ui` and the UI scripts.
7. **Deploy and schedule.** Vercel, plus GitHub Actions daily. Links to 14.
8. **The self-healing loop.** One paragraph, linking to 16.
9. **Project structure tree.** Regenerated.
10. **Development checks.** The mandatory command line.
11. **Doc index links.**

Remove from the README:
- the inline changelog (move it to `CHANGELOG.md`);
- the stale roadmap. The "React web app" item has shipped.

## 5. Factual fixes (P1-T22, plus P1-T02 for the auto-loaded files)

Line numbers below are at `22afd64`. Search for the quoted text if they have shifted.

| File | Fix |
|---|---|
| `CLAUDE.md` | Rewrite as a shim (08 §2). This removes these stale claims: ":14 no server/no UI", ":62 hash = 5 fields", ":88-89 #31 wording", ":12 HEAD stamp" and the missing API/UI rows. |
| `AGENTS.md` | Rewrite (08 §3.1). Remove "MUI v6" (:14), the in-flight dedup claim (it's RTK Query built-in), "no build step" (:33) and the 4-step protocol (:19-23). Add `/v1/facets`. |
| `documentation/README.md` | :12-13 and :51-52 say "no web server / no REST endpoints". Rewrite the TL;DR to cover API, UI and cache. Index 12–16. "BF-001–010" becomes "BF-001…latest". Scale figures: 2026-10-23 run, 76.3 s, 4 workers, 33,997 collected / 34,023 active. |
| `README.md` | :26 MUI v6 → 9; :157 employmentType/isRemote/publishedAt **are** columns; :153 Job fields; :176 and :216 delete `scripts/test-drive-upload.ts` mentions; :159-163 perf; :186-231 tree; :248-263 move to CHANGELOG |
| 01 | :13-17 "not a service"; :32-44 stack; :46 `@types/node` is a devDependency; :50-102 layout; :74 deleted script; :119-135 git table → CHANGELOG |
| 02 | :173 hash fields; :214-216 upsert fields (BF-011); `file:///` links; add the API/cache read path and CI to the ops sequence, or link 15 |
| 03 | :3 should say "APIs we call; our own API is in 12"; :194, :207 the user-OAuth upload has no remaining caller |
| 04 | Add `build`, `api:start` (PORT, static SPA), `enrich:companies` (flags), `cache:*`, `report:classify`, `db:normalize-countries`, the UI scripts |
| 05 | :121 `country` → ISO-3166 alpha-2 after P1-T15; :150-161 BF-011 field mapping; :165-192 Redis section → `jc:v1:*` (03); add the index/query table (04 §7) |
| 06 | Add `Server.ts`, `EnrichCompanies.ts`, `api/index.ts`, `src/cache/*`, `src/lib/cache/*`; drop line numbers; :50 hash; :107 `extractSalary` returns `interval`; deleted-script rows |
| 07 | Env vars `PORT`, `VITE_API_BASE_URL`, `CORS_ORIGINS`, `HEALTH_TOKEN`, `CACHE_*`, Upstash `rediss://`; :152-160 manual cron → Actions (link 14); deleted-script refs |
| 08 | Error report v2 and the history layout (07 §2); `frontend/dist`; remove `test-upload.txt` |
| 09 | Mark stale items (01 §4); add API/UI/Ops sections; add new items found by this audit that aren't fixed in P1 |
| 10 | Registry only: rows for BF-011 (`2cdced2`), BF-012 (`831ae95`), BF-013 (`632c83c`) with honest guard status (BF-011 ⚠️ until P1-T06; BF-012 ❌ until P1-T16; BF-013 ❌ until P1-T16 and P5-T07); remove `BackfillJobFields.ts`/`db:backfill`; MUI 9; the protocol moves to 16 (P4-T03) |
| 11 | :273 untested-modules list; §6 BF-011…013 rows; new suites as they land |
| `docs/GOOGLE_DRIVE_SETUP.md` | :121, :128 deleted-script refs |
| 08 :86 and 09 #55 | The `EXCLUDED_DIRS` list leaves out `frontend` and `web`, which the code does exclude (`scripts/GenerateDocs.ts:46`) |
| `.env.example` | :5 "Required" → optional; add the new vars |
| `frontend/src/types/api.ts:3` | Repoint to `documentation/12-backend-api.md` (P5-T10) |

## 6. Doc 15 outline (`15-system-architecture-and-flows.md`)

1. System flowchart (02 §2)
2. Write-path sequence (02 §3)
3. Read-path sequence (02 §4)
4. Job lifecycle state machine (02 §5)
5. Company lifecycle state machine (02 §6)
6. Fix-loop flowchart (02 §7)
7. Agent routing table (08 §3.3)
8. Cross-component invariants (02 §8)
9. Failure-mode matrix (02 §9)
10. Glossary: generation, manifest, canonical key, fingerprint, actionable, BF, ADR, run id

## 7. Doc 14 outline (`14-deployment-and-operations.md`)

1. **Accounts and free-tier limits**, each with a "checked on" date:
   - Vercel Hobby: non-commercial use only; 1M invocations; 4 CPU-h; 1 rate-limit rule (out of 3 custom WAF rules),
     with counters kept per region.
   - Neon Free: 100 CU-h, 1 GB, 5 GB egress.
   - Upstash Free: 03 §1.
   - GitHub Actions: 2,000 min/month on a private repo; 2-core runners.
2. **Secrets matrix** (where each secret lives):

   | Secret | GitHub `production` env | GitHub `fixer` env | Vercel | Local `.env` |
   |---|---|---|---|---|
   | `DATABASE_URL` | yes | — | yes | yes |
   | `REDIS_URL` | yes | — | yes | optional |
   | `ANTHROPIC_API_KEY` | — | yes | — | — |
   | `FIXER_APP_CLIENT_ID` / `FIXER_APP_PRIVATE_KEY` | — | yes | — | — |
   | `CORS_ORIGINS`, `HEALTH_TOKEN` | — | — | yes | — |
   | `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (optional) | yes | — | — | — |

3. **Workflows:** `ci.yml`, `scrape-daily.yml`, and optionally `release.yml`. For each: triggers, inputs, outputs,
   artifacts.
4. **Vercel config:** `vercel.json` explained, the WAF rule's settings, and region `iad1`.
5. **Branch protection and labels:** `auto-fix`, `needs-human`, `scrape-alert`.
6. **Runbook:**
   - Cache empty or flushed → `workflow_dispatch` with `publish_only`.
   - Upstash archived → restore it, or create a new database and update `REDIS_URL` in Actions and Vercel.
   - Upstash budget exhausted → check traffic and CDN headers.
   - Neon CU-hours used up → check `X-Cache` hit rate and anything pinging `/health?deep=1`.
   - Scrape failing every day → open the `scrape-alert` issue and the artifact.
   - The fixer opens bad PRs → set `skip_fixer`, or disable the fixer job.
   - Rotate secrets.
   - The repo goes public → the 60-day schedule auto-disable applies (Q-11).
7. **Costs and quotas dashboard:** where to look in each provider's console.

## 8. Doc 12 outline (`12-backend-api.md`)

1. **Endpoints.** For each one: params, response shape, example, and the errors with their `code` values.
   The contract is 04 §2.
2. **Headers:** `X-Cache*`, `Cache-Control`, `X-Request-Id`, `Retry-After`.
3. **Read path:** 03 §5, with the BYPASS and MISS reasons table.
4. **`/health` v2 and `/v1/meta`.**
5. **Rate limiting and the DB guard.**
6. **Postgres fail-safe:** query shapes and indexes.
7. **Local development:** `npm run api:start`; the Vite proxy.
8. **Tests:** where they live and how to run them.
