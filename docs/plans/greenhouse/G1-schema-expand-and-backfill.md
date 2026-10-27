# G1 — Multi-source schema expand + dual-write + backfill (Antigravity prompt)

> Owner: paste "Read docs/plans/greenhouse/G1-schema-expand-and-backfill.md and implement it exactly." into a fresh
> Antigravity session. Background for every G-PR: `docs/plans/greenhouse/00-PLAN.md` (read it first).

You are working in the Ashby Job Scraper monorepo (product: B.O.O.L.E.A.N). Implement ONE PR: the first, **additive**
step of adding Greenhouse as a second job source. **No Greenhouse scraping yet.** Squash-merge. Follow AGENTS.md,
CLAUDE.md, docs/agents/context.md and every rule in docs/agents/rules/ (prisma-schema, scraper-invariants,
ci-and-workflows, changelog-and-commits).

## HARD RULES (non-negotiable)
- Never read, print, stage, or commit `.env*`, `apikeys/`, `backend/apikeys/`, `output/`, `backend/output/`, `.vercel/`.
- Agents never push to `main`/`master`, never merge, never force-push, push tags or delete branches, and never run raw
  `git push` or `gh`. Publish only with `scripts/agents/push-branch.sh` (prints a compare link). Owner opens the PR,
  reviews and merges.
- Never connect to production DB/Redis/API. No scrapes, publishes or deploys. Integration tests use ONLY
  `TEST_DATABASE_URL` (localhost).
- **Schema must stay `db push`-safe without `--accept-data-loss`.** Do NOT add any `@@unique` in this PR (verified:
  it makes `prisma db push` exit 1 and would break the daily scrape). Never rename or drop columns.
- Content hash (BF-011) unchanged. No API/DTO change. No frontend change. No new `any` (any-ratchet).
- Commit before running check-all (docs:check needs committed backend/docs).

## PRECONDITION
- Start from latest origin/main. Branch: `feat/gh-1-schema-expand`.
- Commit the folder `docs/plans/greenhouse/` as-is in this PR (do not edit it).

## BUILD
1. `backend/prisma/schema.prisma` (additive only):
   - `enum Ats { ASHBY GREENHOUSE }`
   - `Company`: `source Ats @default(ASHBY)`, `atsToken String?`, `@@index([source, status])`.
   - `Job`: `source Ats @default(ASHBY)`, `externalId String?`,
     `@@index([source, active, isListed, publishedAt(sort: Desc)])`.
   - JSDoc-style `//` comments: `ashbyId` = "legacy global key: Ashby UUID, or `greenhouse:<id>` for Greenhouse";
     `externalId` = "native ATS id"; `atsToken` = "native board token (lowercase)".
2. Dual-write (Ashby only, values derived from what exists today):
   - Scraper create/update/createMany/upsert paths in `backend/src/core/Scraper.ts` write the **literal**
     `source: 'ASHBY'` and `externalId: <the same value written to ashbyId>` into the Prisma data objects. Do NOT reuse
     `ProcessedJob.source` — that existing field is the fetch mode (`'rest'|'graphql'`). Use string literals, not an
     imported `Ats` enum (the unit-test Prisma mock `backend/__mocks__/@prisma/client.ts` exports no enums).
     Do not change any `where`/lookup key (still `ashbyId`).
   - Company creation paths (`utils/Seed.ts`, `discovery/CdxWorker.ts` upsert `create`, any other `company.create*`)
     write `source: 'ASHBY'`, `atsToken: slug`.
   - Raw SQL touches stay unchanged.
3. `--` guard: `isValidSlug` (`CdxWorker.ts`) already rejects `--` (its regex forbids consecutive hyphens) — add a test
   that pins it. Add the guard where slugs are inserted **without** validation: `utils/Seed.ts` (≈58, `createMany` with no
   validation) and the CdxWorker upsert (`ProcessCdxData` only writes JSON and needs nothing).
   **`database/DbClean.ts` safety:** it deletes every company failing `isValidSlug` (and its jobs). Restrict it to
   `source = 'ASHBY'` now, so it can never delete future `gh--` Greenhouse companies; add a test.
4. New `backend/src/database/BackfillSource.ts` (exported `backfillSource()` + a `require.main === module` guard — modules
   must not run on import) + npm script `db:backfill-source`. Add it to the `DANGEROUS` list in
   `scripts/repo-tests/settings-allowlist.test.mjs` so it can never be auto-approved.
   - Idempotent, batched (≤5,000 rows per UPDATE via `WHERE id IN (SELECT id … WHERE … LIMIT 5000)`, loop until 0):
     `UPDATE "Job" SET "externalId"="ashbyId" WHERE "externalId" IS NULL AND source='ASHBY'` (batch by id);
     `UPDATE "Company" SET "atsToken"=slug WHERE "atsToken" IS NULL AND source='ASHBY'`.
   - Then **fails loudly (exit 1) without creating indexes** if any `Company` with `source='ASHBY'` has a slug
     containing `--`, or if duplicates exist on `(source, externalId)` / `(source, atsToken)` — print the counts.
   - Otherwise create, if missing, `CREATE UNIQUE INDEX IF NOT EXISTS "Job_source_externalId_key" ON
     "Job"(source, "externalId")` and `CREATE UNIQUE INDEX IF NOT EXISTS "Company_source_atsToken_key" ON
     "Company"(source, "atsToken")` — these exact names are what Prisma generates for `@@unique`, so G2 can add
     `@@unique` to the schema and `db push` stays in sync (verified on Prisma 5.22). Plain (non-CONCURRENTLY) is fine at
     ~34k jobs (sub-second); run each via `$executeRawUnsafe` outside any transaction.
   - Prints a summary: rows updated, rows still NULL (must be 0), indexes present.
5. `.github/workflows/scrape-daily.yml`: new step "Backfill multi-source columns" → `npm run db:backfill-source`,
   right **after** the `prisma db push` step and before enrichment/scrape; it runs on every dispatch (including
   publish_only and fixture runs) and is a fast no-op once done. It must **never stop the daily scrape**:
   `continue-on-error: true`, and on failure write a clear warning to `$GITHUB_STEP_SUMMARY` ("Backfill failed — G2 must
   not start; send this log to Claude"). The scrape itself does not depend on the backfill.
6. `.github/workflows/discover-weekly.yml`: add `npx prisma db push --skip-generate` (working-directory backend)
   before discovery, so a Sunday discovery never runs against an older schema.
7. Auto-fixer safety during the migration: remove `^backend/prisma/schema\.prisma` from `ALLOWED_PATTERNS` in
   `scripts/ci/check-fixer-scope.sh` (and update `scripts/repo-tests/fixer-scope.test.mjs` + docs that list fixer
   scope) and **add** a case to `scripts/repo-tests/fixer-scope.test.mjs` asserting `backend/prisma/schema.prisma` is
   rejected (no such case exists today). G6 restores it and flips that case.

## TESTS (write first, see them fail)
- New `backend/tests/integration/MultiSourceSchema.test.ts` (real Postgres via TEST_DATABASE_URL; localhost guard like
  the existing integration tests). It uses **its own Postgres schema** (append `?schema=multisource` to the URL, or
  `&schema=` if a query exists) so it never fights `Search.test.ts`/`Companies.test.ts`, which push the live schema to
  the default schema; start each run with `prisma db push --force-reset` on that isolated schema only.
  Use **frozen schema fixtures** in `backend/tests/integration/fixtures/` for every step — `schema.pre-g1.prisma` (today's
  schema), `schema.g1.prisma` (this PR's schema), `schema.g1-uniques.prisma` (this PR's + both `@@unique`) — never the
  live `backend/prisma/schema.prisma`, so the test stays valid after G2 adds `@@unique`.
  1. Push the **pre-G1 schema** from a frozen copy committed at
     `backend/tests/integration/fixtures/schema.pre-g1.prisma` (copy today's `backend/prisma/schema.prisma` before you
     edit it; do NOT use `git show origin/main:…` — CI checks out a single commit), seed companies + jobs.
  2. `prisma db push --skip-generate` (NO accept-data-loss) of `schema.g1.prisma` → exit 0; existing rows have
     `source='ASHBY'`, `externalId IS NULL`.
  3. Run the backfill twice → second run updates 0 rows; no NULL `externalId`/`atsToken` for ASHBY; both unique
     indexes exist with the exact names.
  4. Push `schema.g1-uniques.prisma` → exit 0 and "already in sync" (proves G2 is safe).
  5. Backfill refuses (exit 1, no indexes) when a seeded ASHBY company slug contains `--`.
- Unit: Scraper create/update payloads include `source`/`externalId` (ScraperRunAll or ScraperCore); Seed/CdxWorker
  write `source`/`atsToken`; `isValidSlug('a--b') === false` (pins existing behaviour); Seed rejects `a--b`; DbClean only
  ever selects `source='ASHBY'` companies. New files contain zero explicit `any` (the any-ratchet counts per file).
- Repo tests: workflow invariants for the new scrape-daily step order (db push → backfill → enrich/scrape) and
  discover-weekly db push; fixer-scope test updated.

## DOCS
- `docs/decisions/ADR-0021-multi-source-ats.md` (from 00-PLAN.md §2: identity, `gh--` slugs, legacy `ashbyId`,
  two-step uniques, adapter, freshness choice) + index row in `docs/decisions/README.md`; in `docs/README.md` update the
  range text ("ADR-0001 through ADR-0021") and add the missing ADR-0020 **and** ADR-0021 entries to its link list.
- `backend/docs/database-and-cache.md` (new columns, slug scheme, backfill), `backend/docs/cli-commands.md`
  (`db:backfill-source`), `docs/deployment-and-operations.md` (new scrape-daily step), CHANGELOG [Unreleased].
- `docs/agents/context.md` (**6144-byte budget, only ~39 bytes free today**): first make room for the whole migration —
  merge the BF-001…BF-010 invariant bullets into one or two compact lines (keep every id and its guarding test file)
  to free ≥ 400 bytes — then add: "Multi-source (ADR-0021): `Job.source`/`externalId`, `Company.source`/`atsToken`;
  `ashbyId` = legacy global key." Run `node scripts/agents/sync-shells.mjs` + `--check` (the agent-shells test enforces
  the budget). Later G-PRs add at most one short line each.
- `npm --prefix backend run docs:generate`.

## VERIFY (paste results in PR body)
`scripts/check-all.sh --no-install` · `npm --prefix backend run test:integration` (local throwaway Postgres) ·
`node --test 'scripts/repo-tests/**/*.test.mjs'` · `node scripts/agents/sync-shells.mjs --check`.

## COMMIT + PUBLISH
`feat(db): multi-source schema expand, dual-write and backfill (ADR-0021)` with a bulleted body;
`scripts/agents/push-branch.sh`; give the owner the link.

## ROLLOUT (put in PR body; owner does it)
1. Merge. No Vercel deploy needed (the API does not read the new columns yet).
2. Actions → scrape-daily → Run workflow (defaults, or `skip_publish=true`). Check the "Backfill multi-source columns"
   step log: rows still NULL = 0, both unique indexes present. If it failed (yellow warning in the run summary; the
   scrape still ran), send the log to Claude — **do not start G2** until it succeeds.
3. Rollback: revert the PR. Columns/indexes stay (harmless, unused); never drop them in a hurry.
