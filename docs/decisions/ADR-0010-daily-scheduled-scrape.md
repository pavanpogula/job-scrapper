# ADR-0010: Daily GitHub Actions schedule (06:17 UTC, --workers=4)

- Status: Accepted
- Date: 2026-10-24
- Deciders: owner, scraper-architect agent
- Related: D-15, GAP-CI-01

> Amended 2026-11-11 (owner decision): the schedule is now every 3 hours from 5:17 AM to 11:17 PM Pacific Standard Time, 7 runs a day (`17 1,4,7,13,16,19,22 * * *`, UTC; 1 hour later during PDT), so new postings show up the same day. The off-the-hour minute (`:17`) and `--workers=4` are unchanged. The minute-quota reasoning below no longer limits this: the repository is public, so standard runners are free. Known consequence: the scraper's consecutive-run counters (quarantine after 3 consecutive 404s, report after 7 consecutive failures) now elapse in hours instead of days. The text below records the original once-a-day decision.

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
