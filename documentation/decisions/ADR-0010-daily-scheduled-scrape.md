# ADR-0010: Daily GitHub Actions schedule (06:17 UTC, --workers=4)

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-architect agent
- Related: D-15, GAP-CI-01

## Context
Job board scrapers need regular, reliable execution to keep listings fresh. Running on arbitrary cadences or peak UTC hours causes contention and rate limits on upstream Ashby endpoints. Single-process scraping takes several minutes and risks timeouts on GitHub Actions free runner minutes.

## Options Considered
1. **Hourly scraping**: Exceeds GitHub Actions monthly minute quotas (2,000 min/mo) and Upstash Redis free tier command caps.
2. **Daily scraping at midnight UTC (00:00)**: Midnight UTC is peak congestion for GitHub Actions runners and automated scrapers globally.
3. **Daily scraping at off-peak offset (06:17 UTC) with 4 worker processes**: Minimizes runner queue delays and completes full scrape in ~76 seconds, using less than 40 runner minutes per month.

## Decision
Schedule automated scrapes once daily at 06:17 UTC (`17 6 * * *`) on GitHub Actions using `ClusterScraper` with `--workers=4`.

## Consequences
- Uses less than 2% of GitHub Actions free runner minutes.
- Scrapes complete in approximately 1–2 minutes with full telemetry reports.
- Non-standard cron time avoids runner scheduling stampedes.
- Guarded by `.github/workflows/scrape-daily.yml`.
