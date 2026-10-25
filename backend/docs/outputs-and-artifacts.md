# 08 · Outputs & Generated Artifacts

Every file written by the code (verified by grepping `writeFile*`, `createWriteStream`, `unlink*` in `src/` and `scripts/`):

| Artifact | Format | Writer (code) | Command | Tracked in git? | Notes |
|---|---|---|---|---|---|
| `output/jobs_YYYY-MM-DD.csv` | CSV | `scrapeToCSV()` in `src/core/ScraperCSV.ts` (`fs.createWriteStream`) | `npm run scrape:csv` | ❌ (`output/` ignored) | ~4.5 MB, ~29.9k rows for a full run; deleted again if 0 jobs |
| `output/reports/<YYYY-MM>/<runId>.json` | JSON | `ErrorTracker.saveReport()` / `saveMergedReport()` | `npm run scrape`, `scrape:parallel`, `scrape:csv` | ❌ | Machine-readable Schema v2.0 run report |
| `output/reports/<YYYY-MM>/<runId>.md` | Markdown | `classifyReport()` / `ReportClassifier.ts` | `npm run report:classify` | ❌ | Human-readable run summary |
| `output/latest-<mode>.json` | JSON | `ErrorTracker.saveReport()` / `saveMergedReport()` | `npm run scrape`, `scrape:parallel`, `scrape:csv` | ❌ | Copy of the newest report for that mode (`cluster`, `single`, `csv`) |
| `output/latest-error-report.json` | JSON | `ErrorTracker.saveReport()` / `saveMergedReport()` | `npm run scrape`, `scrape:parallel` | ❌ | Copy of newest DB-mode run, kept for compatibility (CSV runs do not overwrite) |
| `apikeys/oauth-token.json` | JSON (Google OAuth tokens) | `src/lib/GoogleDriveUserOAuth.ts` | `GoogleDriveUserOAuth.ts` | ❌ (`apikeys/` ignored) | Secret — never print or commit |
| `extracted-slugs.json` (CWD) | JSON array | `processRawCDXData()` in `src/utils/ProcessCdxData.ts` | `npm run process:cdx -- <file>` | ✅ tracked (despite `/extracted-slugs*` in `.gitignore`) | 3,072 slugs; read by `npm run seed -- --all` |
| `JOBS.md` (repo root) | Markdown | `scripts/generate-readme.ts` | `npx ts-node scripts/generate-readme.ts` | ✅ tracked | ~5.4 MB, 29,911-row table (last generated 2026-01-05 UTC from `jobs_2025-12-29.csv`) |
| `docs/project-explorer.html` | HTML | `scripts/GenerateDocs.ts` | `npm run docs:generate` | ✅ tracked | Interactive file/function explorer |
| Google Drive file | CSV | `uploadWithOAuth()` (`GoogleDriveOAuth.ts`) | `npm run scrape:csv -- --upload-cloud` | — | Same file name as the local CSV, in `GOOGLE_DRIVE_FOLDER_ID` |
| PostgreSQL tables | — | Prisma | `seed`, `discover`, `scrape`, `scrape:parallel`, `db:clean -- --execute` | — | see [05](./database-and-cache.md) |
| Redis keys `job:{ashbyId}:hash` | string | `Scraper.ts` | `scrape`, `scrape:parallel` | — | 7-day TTL, see [05 §4](./database-and-cache.md#4-redis-cache) |

`output/` is created on demand (`mkdirSync({ recursive: true })`) relative to `process.cwd()` by `ScraperCSV.ts` and
`ErrorTracker`; `generate-readme.ts` resolves it relative to the script (`<repo>/output`).
Nothing writes a log file — all logs go to stdout/stderr.

## 1. CSV Format

Header (exact): `Company,Job Title,Job Link,Published Date,Location,Department`

| Column | Source (`fetchJobsForCompany()` in `ScraperCSV.ts`) | Example |
|---|---|---|
| Company | `sanitizeText(companySlug)` — the **slug**, not the display name | `01c` |
| Job Title | `sanitizeText(job.title)` | `Full Stack Developer` |
| Job Link | `sanitizeJobUrl(job.jobUrl, slug, job.id, false)` — Ashby's `jobUrl` normalised by `new URL()`; falls back to `https://jobs.ashbyhq.com/{slug}/{job.id}` if missing, malformed or unsafe. GraphQL-fallback boards always use the canonical URL | `https://jobs.ashbyhq.com/01c/7fe8abc1-…` |
| Published Date | `sanitizePublishedDate(job.publishedAt)` → leading `YYYY-MM-DD`, or empty. Always empty for GraphQL-fallback boards (no `publishedAt`) | `2025-10-22` |
| Location | `sanitizeText(job.location)` or empty | `London` |
| Department | `sanitizeText(job.department)` or empty (GraphQL fallback: team name) | `Engineering` |

- `escapeCSV()`: removes `\x00`; fields containing `,`, `"`, `\n` or `\r` are wrapped in quotes with inner quotes doubled.
- Line ending `\n`; UTF-8; no BOM. No salary column (CSV mode fetches without `includeCompensation`).
- Row order = order in which company requests complete (non-deterministic). Within a company, Ashby order.
- File date = **UTC** date at run start; reruns on the same UTC day overwrite.
- **Empty file cleanup:** if `totalJobs === 0`, `ScraperCSV.ts` removes the file with `fs.unlinkSync(filePath)`.

**Historical runs present locally**

| File | Rows | Distinct companies |
|---|---|---|
| `jobs_2025-12-27.csv` | 29,917 | 2,098 |
| `jobs_2025-12-28.csv` | 29,916 | 2,098 (file mtime is Dec 27 local → UTC naming) |
| `jobs_2025-12-29.csv` | 29,910 | 2,097 |
| `jobs_2026-10-23.csv` | 160 | 4 (small run) |

Rows = CSV records excluding the header, counted with a real CSV parser. Each Dec-2025 file has one quoted title
containing a newline, so `wc -l` reports one extra line (and `generate-readme.ts` renders one extra row).

So of ~3,072 discovered slugs, ~2,098 had at least one open job at the end of 2025 (1,747 hiring companies / 34,035
jobs in the 2026-10 DB run, see `docs/README.md`).

## 2. `JOBS.md`

Generated by `npx ts-node scripts/generate-readme.ts` from the newest `output/jobs_*.csv` (by file-name sort).
Root `README.md` lists the script and describes `JOBS.md` as a committed, generated snapshot.

```markdown
# 🔍 Job Listings

*Last updated: YYYY-MM-DD* | **Total Jobs: N**

| # | Company | Job Title | Location | Department | Posted | Apply |
|---|---------|-----------|----------|------------|--------|-------|
| 1 | slug | Title | Location | Dept | YYYY-MM-DD | [Apply →](link) |
```
- `Last updated` = UTC date at generation time; every CSV row is rendered (no cap).
- Truncation: Title > 40 → first 37 + `...`; Company/Location > 20 → 17 + `...`; Department > 15 → 12 + `...`.
- `sanitizeMarkdownCell()` replaces newlines with spaces and escapes `|` as `\|` in text cells; in the link, `)` and
  whitespace are percent-encoded. `Posted` is copied verbatim from the CSV.

## 3. `extracted-slugs.json`

Pretty-printed (`JSON.stringify(arr, null, 2)`), **sorted** JSON array of lowercase slugs that passed the
`ProcessCdxData` filters + `isValidSlug()` (regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, length 2–50, blocklist, not purely
numeric). Written to the current working directory. Seed it with `npm run seed -- --all` (read from `process.cwd()`).

## 4. `docs/project-explorer.html`

Single self-contained HTML file with a collapsible file tree; per file shows `@summary`, `@tags`, functions (with
`@summary`) and, for `schema.prisma`, the models with fields. Covers every `*.ts`/`*.prisma` file under the repo root
except `node_modules`, `dist`, `.git`, `docs`, `output`, `.vscode`, `apikeys`. Regenerate after adding/renaming files or
changing JSDoc headers: `npm run docs:generate`.

## 5. `output/reports/<YYYY-MM>/<runId>.json` (Telemetry & Bug-Fix Agent Input v2.0)

Written by `ErrorTracker` (`src/lib/ErrorTracker.ts`) at the end of every `npm run scrape` (`saveReport()`),
`npm run scrape:parallel` (`mergeReports()` + `saveMergedReport()`; `--ipc-worker` children never write files) and
`npm run scrape:csv` (`saveReport()`). Reports are uniquely named per run (`<runId> = <UTC YYYYMMDDTHHmmssZ>-<mode>-<gitSha>`) under month folders. Copies are saved to `output/latest-<mode>.json`, and DB-mode runs also copy to `output/latest-error-report.json` for compatibility.

```jsonc
{
  "schemaVersion": "2.0",
  "run": {
    "runId": "20261024T061700Z-cluster-1a2b3c4",
    "mode": "cluster",                  // "cluster" | "single" | "csv"
    "trigger": "schedule",              // "schedule" | "workflow_dispatch" | "local"
    "gitSha": "1a2b3c4",
    "gitBranch": "main",
    "nodeVersion": "v24.21.0",
    "startedAt": "<ISO-8601>",
    "completedAt": "<ISO-8601>",
    "durationSeconds": 81,
    "outcome": "success",               // "success" | "partial" | "failed"
    "exitCode": 0
  },
  "summary": {
    "runId": "20261024T061700Z-cluster-1a2b3c4",
    "mode": "db_scrape",
    "startedAt": "<ISO-8601>",
    "completedAt": "<ISO-8601>",
    "durationSeconds": 81,
    "companiesAttempted": 1747,
    "companiesWithJobs": 1744,
    "companiesNotFound": 1109,
    "companiesFailed": 0,
    "companiesQuarantined": 3,
    "graphqlFallbacksUsed": 12,
    "rateLimitsEncountered": 0,
    "jobsCollected": 34050,
    "jobsSanitized": 45,                // distinct sanitized job IDs
    "jobsFilteredOut": 37,              // distinct filtered job IDs
    "jobsCreated": 210,
    "jobsUpdated": 640,
    "jobsUnchanged": 33200,
    "jobsReactivated": 0,
    "jobsDeactivated": 157,
    "dbErrors": 0
  },
  "categories": {                       // exact counts per category
    "validation_filtered": { "count": 37, "distinctCompanies": 4 },
    "not_found": { "count": 1109, "newThisRun": 3 },
    "graphql_fallback": { "count": 12, "distinctCompanies": 12 }
  },
  "events": [                           // max 100 per category; exact counts in categories
    {
      "id": "ev-1",
      "timestamp": "<ISO-8601>",
      "category": "validation_filtered",
      "companySlug": "<slug>",
      "jobId": "<ashbyId>",
      "field": "id",
      "message": "job id missing or duplicated",
      "actionTaken": "filtered"
    }
  ]
}
```

Merge semantics (`mergeReports`): numeric summary fields and category counts are summed across workers, `startedAt` / `durationSeconds`
come from the coordinator, and events are capped at 100 per category. `jobsSanitized` and `jobsFilteredOut` track distinct job IDs.
