---
id: scraper-invariants
scope: backend
always: false
applies_to:
  - "backend/src/core/**"
  - "backend/src/lib/**"
description: "Scraper core and library invariants"
---
# Scraper Invariants
When modifying scraper core or library components:
1. Consult `docs/bug-fix-log.md` and `docs/testing.md` §6.
2. Invariants BF-001 through BF-025 must be preserved.
3. Test-driven development is required: author a failing test in `backend/tests/unit/` before applying any fix.
4. Only HTTP 429 triggers `sawRateLimit`; Retry-After header must be honored (capped at 10s).
5. Fallback rows must never overwrite primary rows (BF-016: fallback over primary guard; Ashby-only).
6. Preserve existing docstrings, interfaces, and error telemetry handling.
7. Every new ATS client mirrors `GreenhouseClient`: axios, inline retry with `lib/ats/http.ts` helpers, normalizer returns `null` + issue on bad id/title, dedupe by id.
8. Staged scrape (`--staged`, BF-025): stages run in registry order, one source each; a failed stage never stops later stages; one cache publish after the last stage; BF-017 (any failed worker means no publish, exit 1) is unchanged; Lever always uses 1 worker. Without `--staged` behaviour must stay byte-identical.
