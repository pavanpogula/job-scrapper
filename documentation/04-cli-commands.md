# 04 · CLI Commands (Entry Points)

All scripts run through `npx ts-node` — no build required. Pass extra args after `--`, e.g. `npm run db:clean -- --execute`.

## Summary Table

| Command | Entry file | Needs DB | Needs Redis | Network | Writes |
|---|---|:-:|:-:|---|---|
| `npm run seed` | `src/utils/Seed.ts` | ✅ | — | — | `Company` rows |
| `npm run discover` | `src/discovery/CdxWorker.ts` | ✅ | — | Wayback CDX | `Company` rows |
| `npm run process:cdx -- <file.json>` | `src/utils/ProcessCdxData.ts` | — | — | — | `extracted-slugs.json` |
| `npm run scrape` | `src/core/Scraper.ts` | ✅ | optional | Ashby | `Job`, `Department`, `Location`, `Company.status`, Redis keys, `output/latest-error-report.json` |
| `npm run scrape:parallel [-- --workers=N]` | `src/core/ClusterScraper.ts` | ✅ | optional | Ashby | Multi-process OS worker scrape + merged `output/latest-error-report.json` |
| `npm run scrape:csv` | `src/core/ScraperCSV.ts` | ✅ (read) | — | Ashby | `output/jobs_YYYY-MM-DD.csv` |
| `npm run scrape:csv -- --upload-cloud` | same | ✅ (read) | — | Ashby + Drive | CSV + Drive file |
| `npm run db:menu` | `src/database/DbMenu.ts` | ✅ | — | — | read-only (unless raw SQL mutates!) |
| `npm run db:inspect` | `src/database/DbInspect.ts` | ✅ | — | — | read-only |
| `npm run db:clean` | `src/database/DbClean.ts` | ✅ | — | — | dry run |
| `npm run db:clean -- --execute` | same | ✅ | — | — | **deletes** `Job` + `Company` rows |
| `npm run verify` | `src/utils/Verify.ts` | ✅ | — | — | read-only |
| `npm run prisma:studio` | Prisma CLI | ✅ | — | — | GUI |
| `npm run docs:generate` | `scripts/GenerateDocs.ts` | — | — | — | `docs/project-explorer.html` |
| `npm run lint` / `lint:fix` | ESLint on `src/` | — | — | — | (fix: source files) |
| `npx ts-node scripts/generate-readme.ts` | *(no npm script)* | — | — | — | `JOBS.md` |
| `npx ts-node scripts/test-drive-upload.ts` | *(no npm script)* | — | — | Google OAuth/Drive | `apikeys/oauth-token.json`, Drive file; temp `output/test-upload.txt` |
| `npm test` | Jest (`jest.config.js`) | — | — | — | 15 suites, 78 unit & E2E tests |

Prisma CLI (not wrapped): `npx prisma generate`, `npx prisma db push`, `npx prisma migrate dev` (no `migrations/` folder exists — schema is synced with `db push`).

---

## Details

### `npm run seed [-- --all]`
- Reads `TARGET_COMPANIES` from `src/config/Companies.ts` by default, or all 3,072 slugs from `extracted-slugs.json` when `-- --all` is passed.
- 1× `findMany` (existing slugs) → in-memory diff → 1× `createMany({ skipDuplicates: true })`, `name = slug`, `status = ACTIVE`.
- Output: counts of existing / new; "No new companies to add." if nothing new.

### `npm run discover [-- --common-crawl] [-- --enrich]`
- See [02 → Workflow A1](./02-architecture-and-workflows.md#a1-automatic-npm-run-discover--cdxworkerts). Upserts slugs one by one, prints dots.
- Optional flags: `--common-crawl` also queries the CommonCrawl Index API; `--enrich` populates `Company.name` and `Company.logoUrl` from Ashby's `window.__appData`.

### `npm run process:cdx -- <path>`
- Input: JSON array-of-arrays from CDX (`[["original"],["url"],...]`).
- Output: stdout list + `TARGET_COMPANIES` code block; writes `./extracted-slugs.json` (relative to CWD).
- Without a path: prints usage and exits.

### `npm run scrape`
- Logs: start banner (company count, concurrency 15, batch 100, Redis status), `✅ slug: N jobs (M changed)` per company with jobs,
  progress every 100 companies, `📦 Flushing remaining jobs…`, final elapsed time, and `output/latest-error-report.json`.
- Exit code 1 on unhandled error (after Prisma disconnect).

### `npm run scrape:parallel [-- --workers=N]`
- Spawns `N` OS child processes (`child_process.fork('src/core/Scraper.ts', ['--ipc-worker'])`), defaulting to `min(4, cpuCores)`.
- Distributes active company slugs across shards via round-robin (`partitionSlugs()`), runs all shards across CPU cores in parallel, and merges worker telemetry via `ErrorTracker.mergeReports()` into `output/latest-error-report.json`.

### `npm run scrape:csv [-- --upload-cloud]`
- Logs per company and progress every 100 companies (with running job total).
- File name uses **UTC** date (`new Date().toISOString()`), so evening runs in US time zones get the next day's date.
- Same-day reruns overwrite the file.
- Without the flag prints a tip about `--upload-cloud`.
- Errors are caught with `.catch(console.error)` → process exits 0 even on failure.

### `npm run db:menu`
Options: `1` Dashboard · `2` Jobs per company (top 15) · `3` Top salaries (top 10, `salaryMax not null` → currently empty, see 09) ·
`4` Search by title · `5` Location breakdown (top 10) · `6` Ghost companies (first 20 printed) · `7` Raw SQL (`$queryRawUnsafe`, 50 rows shown) · `8` Exit.

> Prisma table names are PascalCase and must be quoted in raw SQL, e.g. `SELECT * FROM "Job" LIMIT 5;`.

### `npm run db:clean [-- --execute]`
- Applies `isValidSlug()` to every company. Dry-run prints up to 15 invalid slugs.
- `--execute`: `job.deleteMany({ companySlug in invalid })` then `company.deleteMany({ id in invalid })`.
- ⚠️ *Note:* `README.md` describes this as "remove old jobs", but it actually purges companies with *invalid slugs* (and their foreign-key dependent jobs), not aged records.

### `npm run verify`
- Checks database connectivity and prints row counts for `Company`, `Job`, and `Department`. (Note: omits `Location` count).

### `npm run docs:generate`
- Regenerates `docs/project-explorer.html`. Scans all `.ts` and `.prisma` files and relies on JSDoc `@file`, `@summary`, `@tags` at the top of each file.

### `npx ts-node scripts/generate-readme.ts` *(no npm script shortcut)*
- Reads the latest CSV file in `output/` (sorted by name descending, e.g. `jobs_YYYY-MM-DD.csv`).
- Formats up to ~30,000 jobs into a GitHub-Flavored Markdown table with truncated titles/locations and apply links.
- Writes output to `JOBS.md` in the project root.

### `npx ts-node scripts/test-drive-upload.ts` *(no npm script shortcut)*
- Tests Google Drive user OAuth2 upload flow.
- Creates a temporary file `output/test-upload.txt`, launches the browser consent flow or refreshes token, uploads the file to the user's personal Google Drive, lists recent files, and cleans up the local file.
- Saves authorized credentials at `apikeys/oauth-token.json`.

