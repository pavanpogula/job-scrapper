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
npm run scrape        # Save to database
npm run scrape:csv    # Export to CSV only
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
| `npm run scrape` | Scrape jobs and save to database |
| `npm run scrape:csv` | Export jobs to CSV (no database) |
| `npm run scrape:csv -- --upload-cloud` | Export to CSV and upload to Google Drive |
| `npm run discover` | Discover new companies via CDX API |
| `npm run seed` | Seed database with initial companies |
| `npm run db:menu` | Interactive database explorer |
| `npm run db:inspect` | Quick database stats |
| `npm run db:clean` | Clean database (remove old jobs) |
| `npm run process:cdx` | Process CDX response JSON |
| `npm run verify` | Verify database connections |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run docs:generate` | Generate HTML documentation |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix linting issues |

## Project Structure

```
job-scrapper/
├── src/
│   ├── core/                   # Core scraper logic
│   │   ├── Scraper.ts          # Main DB scraper
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
│   │   └── Redis.ts            # Redis client
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

- **Ashby API**: `https://api.ashbyhq.com/posting-api/job-board/{company}`
- **CDX API**: Wayback Machine for company discovery

## License

ISC
