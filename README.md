# Ashby Job Scraper

A high-frequency job scraper for companies using [Ashby](https://www.ashbyhq.com/) as their ATS (Applicant Tracking System). Automatically discovers companies, scrapes job postings, and exports to database or CSV.

## Features

- 🔍 **Company Discovery** - Auto-discover Ashby companies via Wayback Machine CDX API
- 📊 **Database Storage** - PostgreSQL with Prisma ORM, normalized schema
- 📄 **CSV Export** - Export jobs to timestamped CSV files
- ☁️ **Google Drive Upload** - Optional cloud backup of CSV exports
- ⚡ **Redis Caching** - Deduplication and change detection
- 🔄 **Hourly Scraping** - Designed for frequent updates

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your database and Redis URLs

# 3. Initialize database
npx prisma generate
npx prisma db push

# 4. Seed with initial companies
npm run seed

# 5. Run the scraper
npm run scrape           # Save to database (single process)
npm run scrape:parallel  # Save to database across multiple OS worker processes
npm run scrape:csv       # Export to CSV only
```

## Environment Variables

Create a `.env` file with:

```env
# Required
DATABASE_URL="postgresql://user:pass@host:5432/jobscraper"
REDIS_URL="redis://localhost:6379"

# Optional - for Google Drive upload
GOOGLE_DRIVE_FOLDER_ID="your_folder_id"
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run scrape` | Scrape jobs and save to database (single process, GraphQL fallback & streaming writes) |
| `npm run scrape:parallel` | Multi-process cluster scrape across OS worker processes (`-- --workers=4`) |
| `npm run scrape:csv` | Export jobs to CSV |
| `npm run scrape:csv -- --upload-cloud` | Export to CSV and upload to Google Drive |
| `npm run discover` | Discover new companies via Wayback CDX (`-- --common-crawl`, `-- --enrich`) |
| `npm run seed` | Seed database with initial companies (`-- --all` for all 3,072 slugs) |
| `npm run db:menu` | Interactive database explorer |
| `npm run db:inspect` | Quick database stats |
| `npm run db:clean` | Clean database (remove companies with invalid slugs; `-- --execute` to delete) |
| `npm run process:cdx` | Process CDX response JSON |
| `npm run verify` | Verify database connections |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run docs:generate` | Generate HTML documentation (`docs/project-explorer.html`) |
| `npm test` | Run Jest unit & E2E test suite |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix linting issues |

## Project Structure

```
job-scrapper/
├── src/
│   ├── core/                   # Core scraper logic
│   │   ├── ClusterScraper.ts   # Multi-process OS worker coordinator
│   │   ├── Scraper.ts          # Main DB scraper (supports --ipc-worker)
│   │   └── ScraperCSV.ts       # CSV export scraper
│   │
│   ├── discovery/              # Company discovery
│   │   └── CdxWorker.ts        # CDX API worker
│   │
│   ├── database/               # Database scripts
│   │   ├── DbMenu.ts           # Interactive menu
│   │   ├── DbInspect.ts        # Schema inspection
│   │   └── DbClean.ts          # Cleanup script
│   │
│   ├── config/                 # Configuration
│   │   └── Companies.ts        # Target companies
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── AshbyClient.ts      # Ashby API + GraphQL fallback client
│   │   ├── Concurrency.ts      # Adaptive concurrency limiter
│   │   ├── ErrorTracker.ts     # Run telemetry & error report writer
│   │   ├── GoogleDriveOAuth.ts # Service-account Drive uploader
│   │   ├── GoogleDriveUserOAuth.ts # User OAuth2 Drive uploader
│   │   ├── Redis.ts            # Redis client
│   │   └── Sanitizer.ts        # Job HTML/URL/JSONB sanitizer & validator
│   │
│   └── utils/                  # Utility scripts
│       ├── ProcessCdxData.ts   # CDX data processor
│       ├── Seed.ts             # Database seeder
│       └── Verify.ts           # Connection checker
│
├── scripts/                    # Build/Dev scripts
│   └── GenerateDocs.ts         # Doc generator
│
├── prisma/
│   └── schema.prisma           # Database schema
│
├── docs/
│   ├── GOOGLE_DRIVE_SETUP.md   # Google Drive setup
│   └── project-explorer.html   # Interactive docs
│
├── output/                     # CSV exports (gitignored)
├── README.md
├── package.json
└── tsconfig.json
```

## Database Schema

```
Company (1) ──→ (N) Job
                    │
                    ├──→ (N) Department
                    └──→ (N) Location
```

| Model | Description |
|-------|-------------|
| `Company` | Company info (slug, name, status) |
| `Job` | Job postings (title, type, salary, URL) |
| `Department` | Job departments |
| `Location` | Job locations |

## CSV Export

The CSV scraper exports jobs with these columns:
- Company, Job Title, Job Link, Published Date, Location, Department

Output: `output/jobs_YYYY-MM-DD.csv`

## Google Drive Integration

To enable cloud uploads:

1. Follow the setup guide: `docs/GOOGLE_DRIVE_SETUP.md`
2. Add `GOOGLE_DRIVE_FOLDER_ID` to `.env`
3. Place `google-credentials.json` in project root
4. Run: `npm run scrape:csv -- --upload-cloud`

## Data Sources

- **Ashby Posting API**: `https://api.ashbyhq.com/posting-api/job-board/{company}`
- **Ashby Hosted GraphQL API (Fallback)**: `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`
- **CDX & CommonCrawl APIs**: Wayback Machine & CommonCrawl Index for company discovery

## Release Version (`v1.1.0`) & Self-Healing Telemetry

### What's New in `v1.1.0`
- **Browser GraphQL Fallback (`src/lib/AshbyClient.ts`)**: Automatically recovers boards that return `404`/`403` on the external `posting-api` by querying Ashby's hosted GraphQL API (`ApiJobBoardWithTeams`) with browser headers and exponential backoff.
- **Data Sanitization & Error-Driven Filtering (`src/lib/Sanitizer.ts`)**: Sanitizes `descriptionHtml`, `descriptionPlain`, `jobUrl`, `applyUrl`, and recursive `jsonb` metadata (stripping null bytes `\u0000`, `<script>`/`<style>`/`<iframe>`, inline JS handlers, and oversized base64 data URIs), with per-job transaction fallback in `Scraper.ts`.
- **Adaptive Concurrency & Streaming Writes (`src/lib/Concurrency.ts`, `src/core/Scraper.ts`)**: Dynamic concurrency throttling on `429`/`403`, 3-strike `NOT_FOUND` quarantine, stale job deactivation (`active = false`), real salary extraction, and streaming 100-job batch flushes.
- **Bug-Fix Agent Telemetry (`src/lib/ErrorTracker.ts`)**: Every scrape writes `output/latest-error-report.json` (and `output/error-report_YYYY-MM-DD.json`) capturing API fallbacks, validation/sanitization events, and DB errors. See [`documentation/10-bug-fix-and-improvement-log.md`](./documentation/10-bug-fix-and-improvement-log.md) for the Regression Guard Registry (`BF-001`–`BF-007`) and Bug-Fix Agent workflow.

### Roadmap: Packaging as an Application (Next Phase)
Once scraping and edge-case fixes are finalized via the Bug-Fix Agent loop, this toolkit can be packaged as:
1. **React Web Application (Recommended — Next.js / Vite + Prisma)**: Reuses 100% of the TypeScript + PostgreSQL (Neon) stack to provide an interactive job search/filter dashboard, salary analytics, and one-click scraper control.
2. **Desktop Application (Electron / Tauri)**: Wraps the React UI and Node scraper into a cross-platform `.dmg` / `.exe`.
3. **Standalone CLI Binary (Node SEA / `pkg`)**: Compiles the TypeScript CLI into a single executable binary.

## License

ISC
