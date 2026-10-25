# 03 · Cache Design (Upstash Redis, free tier)

> Owner decision D-01: **Upstash Redis free tier.** It replaced Redis Cloud free, which has no TLS, a 100 ops/s cap, no
> persistence, and deletes a database after 14 days of inactivity.
> Readers: the API (`src/api/cache/*`). Writer: the scraper's publisher (`src/cache/Publisher.ts`). See 04 and 05.

## 1. Provider facts

All facts were checked on 2026-10-23. P0-T01 re-verifies the ones marked UNVERIFIED.

| Fact | Value | Source |
|---|---|---|
| Max data size | 256 MB (the pricing table says "256MB"; the card says "250 MB") | https://upstash.com/pricing/redis |
| Commands | **500K per month** on the pricing page, but the FAQ says **10,000 requests per day** for the free database, after which "the exceeding commands return exception". **Design for 10K/day.** | pricing page; https://upstash.com/docs/redis/help/faq |
| Max commands/sec | 10,000 | pricing page |
| Bandwidth | 10 GB/month | pricing page |
| Max request size / record size | 10 MB / 100 MB | pricing page |
| Databases | 1 | pricing page |
| Inactivity | "Free tier databases are archived after a minimum of 30 days of inactivity". Warning emails are sent first. The backup can be restored **into a new database**, which means `REDIS_URL` changes. | FAQ |
| TLS | **Confirmed:** "TLS is enabled by default for all Upstash Redis databases. It's not possible to disable it." ioredis connects with `rediss://default:TOKEN@ENDPOINT:PORT`. | https://upstash.com/docs/redis/howto/connectclient |
| Concurrent connections (free) | **UNVERIFIED**: no number is published. The error text is `ERR max concurrent connections exceeded`. Upstash recommends the REST client `@upstash/redis` for serverless (Q-03). Confirm in P0-T01. | https://upstash.com/docs/redis/troubleshooting/max_concurrent_connections |
| How pipelines, `MULTI` and Lua are billed | **Confirmed:** every command in a pipeline is billed. `MULTI` and `EXEC` are billed too, so a transaction of N commands costs **N + 2**. `EVAL` costs 1 plus 1 per `redis.call`. | https://upstash.com/docs/redis/overall/billing |
| Eviction default | **Confirmed:** eviction is disabled by default. Writes are rejected once the max data size is reached. The design never relies on eviction. | https://upstash.com/docs/redis/features/eviction |
| `INFO` | Supported, including the `memory` section. The `used_memory` field name is not documented, so parse it defensively and fall back to `lastPublish.bytes`. | https://upstash.com/docs/redis/commands/server/info |
| Budget error text | Seen in the wild: `ERR max daily request limit exceeded. Limit: 10000, Usage: 10000` | https://upstash.com/docs/redis/troubleshooting/max_daily_request_limit |

Design consequences:
- **Commands per day is the binding limit, not memory.** Every cache hit must cost about one command.
- The CDN and an in-process LRU sit in front of Redis.
- Publishes are batched, with many fields per `HSET`.
- When the budget runs out, the API falls back to Postgres and does not error.

## 2. Budgets

| Budget | Value | Env var (default) |
|---|---|---|
| One list generation (`jc:v1:gen:<gen>`) | ≤ 16 MiB, estimated ≈ 10 MB gzip | `CACHE_GEN_MAX_BYTES=16777216` |
| Details, sharded across **8 hashes** `jc:v1:details:<0..7>` | ≤ 152 MiB in total, at most 19 MiB per shard. That keeps each key far below Upstash's **100 MB max record size**. Estimated ≈ 119 MB gzip for 34k jobs (≈ 3.5 KB each). | `CACHE_DETAILS_MAX_BYTES=159383552` |
| Peak memory (2 generations + details + index) | ≤ 200 MB, which is 80% of the documented 250 MB | `CACHE_MAX_MEMORY_BYTES=250000000` (denominator) |
| Publish commands per run | **First fill ≈ 230:** generation ≈ 25, details ≈ 170, index ≈ 7, plus about 25 overhead (MULTI/EXEC N+2, the Lua release, the lock and verify). **Daily delta ≤ 60.** P2-T03 acceptance: ≤ 300. | — |
| API reads per day | The rest of the 10K/day. Expect **1–3 commands per origin hit**. A warm hit is 1 `HGET`. A cold or idle instance adds the pointer `GET` and the manifest `HGET`. Unique detail URLs, for example from crawlers, skip the CDN. If traffic gets heavy, expect `budget_exhausted` and Postgres fallbacks. | — |
| Bandwidth | about 0.6 GB/month publishing (one first fill of ≈ 120 MB, then ≈ 20 MB/day) plus ≤ 1.5 GB/month reads | — |

All sizes are **estimates**. P2-T03 (`npm run cache:publish -- --dry-run`) prints the real bytes. If details exceed their
budget, the publisher stores details only for the newest jobs up to the budget, and older details fall through to
Postgres. Truncation emits `cache_details_truncated`.

The caps sum to 2 × 16 MiB + 152 MiB + 3 MB ≈ 194 MB, which fits the 200 MB peak. Bandwidth is about 0.6 GB/month in
steady state and about 0.72 GB in the first-fill month.

## 3. Key schema (prefix `jc:v1:`)

| Key | Type | Value | TTL | Writer | Reader |
|---|---|---|---|---|---|
| `jc:v1:current` | string | Generation id, `g<UTC yyyyMMddTHHmmssZ>-<sha1(runId) first 4 hex>` | none | publisher | API (read together with `meta:lastScrapeAt` in one `MGET`, cached **300 s** per instance to match CDN `s-maxage`) |
| `jc:v1:gen:<gen>` | hash | One field per pre-rendered response (§3.1), with `__manifest` written **last** | 172800 s while building; `PERSIST` at swap; `EXPIRE 900` once superseded | publisher | API (`HGET`) |
| `jc:v1:details:<n>` (n = 0…7) | hash | field = `Job.id` (UUID), value = envelope of the exact `GET /v1/jobs/:id` body. Shard is `n = crc32(Job.id) % 8` (`detailsShard()` in `src/lib/cache/keys.ts`). | none | publisher | API (`HGET`) |
| `jc:v1:details:index` | hash | field = `Job.id`, value = `contentHash` of the stored detail (about 2.7 MB in one key) | none | publisher | publisher |
| `jc:v1:meta:lastScrapeAt` | string | ISO time of the last scrape in which every worker finished. The publisher module writes it, including when the publish then fails or is gated. When the coordinator skips publishing for `--skip-publish`, it calls `recordScrapeFinished()` from `src/cache/Publisher.ts`, which runs one `SET`. It is not written when a worker failed. | none | publisher module | API `/health`, `/v1/meta`, STALE check |
| `jc:v1:meta:lastPublish` | string | JSON `{gen, runId, publishedAt, mode, fields, bytes, detailsWritten, detailsDeleted, commands, durationMs, status, jobCount, companiesWithJobs}`. The last two feed the sanity gate. | none | publisher | `/health`, `cache:status`, gate |
| `jc:v1:lock:publish` | string | runId, set with `SET NX PX 900000` | 15 min | publisher | publisher |
| `job:<ashbyId>:hash` | — | **Retired** (P1-T04). Purged once with `npm run cache:purge-legacy` if an old Redis was ever used. | — | — | — |

**Ownership rule:** only the publisher writes `jc:v1:*`. The API never writes to Redis (D-04). This means the API
"reads from the cache only, with Postgres as fail-safe".

### 3.1 Fields in a generation hash

| Field | Content |
|---|---|
| `__manifest` | Plain JSON (§3.3), written last |
| `jobs?page=<n>` | The default view (no filters, default sort, `pageSize=25`). Every page. |
| `jobs?<F>=<v>&page=<n>` | Single-filter views, pages 1–40 (1,000 jobs per view). Keys are sorted. |
| `facets` | The `GET /v1/facets` body |
| `companies?page=<n>` | `GET /v1/companies` bodies (pageSize 30), every page |
| `meta` | The `GET /v1/meta` body: `{activeJobs, hiringCompanies, withSalary, lastScrapeAt, generation}` |

Single-filter views covered (`F=v`):
- `workplaceType`: `Remote`, `Hybrid`, `OnSite`
- `employmentType`: `FullTime`, `PartTime`, `Contract`, `Intern`, `Temporary`
- `country`: the top 20 values by count, the same list `/v1/facets` returns, as **ISO-3166 alpha-2 codes after P1-T15**
- `hasSalary`: `true`

Anything else is not cached and goes to Postgres with `X-Cache: MISS` and reason `view_not_cached`, **without touching
Redis**. That includes:
- search
- any two filters together
- a non-default sort or `pageSize`
- `salaryMin`
- `/v1/companies?search=`

Only `companies?page=<n>` is cached.

### 3.2 `canonicalJobsKey(query)`

Lives in `src/lib/cache/keys.ts`, which both the API and the publisher import.

1. Keep only the known params: `search, workplaceType, employmentType, country, isRemote, hasSalary, salaryMin,
   salaryInterval, page, pageSize, sortBy, sortOrder`. Drop unknown params and array values.
2. Normalise each value:
   - Trim strings.
   - Booleans accept only `true` or `1`.
   - `page` must be an integer ≥ 1, clamped to ≤ 5000.
   - `pageSize` is clamped to 1–100.
   - `sortBy` must be one of `publishedAt|salary|title|company`, and `sortOrder` must be `asc|desc`.
   - **Drop `salaryInterval` unless `salaryMin` is a valid number** (D-07).
3. Drop any param equal to its default (`pageSize=25`, `sortBy=publishedAt`, `sortOrder=desc`), but always keep `page`.
4. Build the key as `jobs?` plus the remaining `k=encodeURIComponent(v)` pairs, sorted by key and joined with `&`.

Examples:

| Request | Canonical key |
|---|---|
| The UI's default request | `jobs?page=1` |
| Remote, page 3 | `jobs?page=3&workplaceType=Remote` |
| Country US | `jobs?country=US&page=1` |
| `?search=react&page=1` | Not cacheable |

### 3.3 Manifest

```json
{"schema":1, "gen":"g20261024T061932Z-4f2a", "runId":"20261024T061700Z-cluster-1a2b3c4",
 "source":"db_snapshot", "scrapeFinishedAt":"…", "builtAt":"…", "encoding":"gzip", "pageSize":25,
 "views":{"default":{"filter":{},"total":34023,"totalPages":1361,"pagesCached":1361},
          "workplaceType=Remote":{"filter":{"workplaceType":"Remote"},"total":9100,"totalPages":364,"pagesCached":40}},
 "companies":{"total":1742,"pageSize":30,"totalPages":59,"pagesCached":59},
 "details":{"count":34023,"truncated":false},
 "fields":2200, "bytes":10123456, "mode":"double_buffer"}
```

Rules for pages:
- A page beyond `totalPages` returns an empty page built from the manifest. It counts as a HIT and matches what
  Postgres would return.
- A page beyond `pagesCached` is a MISS with reason `page_not_cached`.

### 3.4 Value envelope

`body = gzip(level 6, UTF-8 JSON of the exact HTTP response body)`. The value is stored as binary: ioredis
`hgetBuffer`/`getBuffer`, never base64.

- **Integrity:** TLS plus token auth replaces the HMAC envelope that was designed for Redis Cloud (D-02). The publisher
  checks `HLEN == manifest.fields + 1` before it swaps.
- **gzip passthrough:** the API may send the stored bytes with `Content-Encoding: gzip`, but only behind
  `CACHE_GZIP_PASSTHROUGH=1`. Enable it only after a preview deploy confirms Vercel forwards the header unchanged
  (UNVERIFIED). Otherwise it gunzips and sends normally.

## 4. Publish algorithm

`src/cache/Publisher.ts` exports `publishCacheGeneration({runId, scrapeFinishedAt, prisma, redis, tracker?, dryRun?})`.
It returns `CachePublishResult` (05 §4).

0. If `REDIS_URL` is unset, return `skipped_not_configured`.
1. Run `SET jc:v1:lock:publish <runId> NX PX 900000`. If the lock is already held, return `skipped_locked`.
2. Take a **Postgres snapshot**, never the scrape's in-memory data. Then run the **sanity gate** (05 §4.2) against
   `meta:lastPublish`.
   - If the gate trips: return `gated`, write `meta:lastScrapeAt`, release the lock, and change nothing else.
   - `npm run cache:publish -- --force` skips the gate after a legitimate large drop. The owner decides.

   Snapshot queries:
   - `job.findMany({ where: { active: true, isListed: true }, select: LIST_SELECT, orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }] })`
   - `computeFacets(prisma)` and `queryCompanies(prisma)`
   - Use the **same functions as the API's DB path**: `src/api/db/queries.ts` for queries, and `src/api/contract.ts`
     (`toJobListItem`, `toJobDetail`, `matchesFilter`, `LIST_SELECT`, `DETAIL_SELECT`) for mapping and filtering.
3. Build the default view and the single-filter views with `matchesFilter()`. Slice them into pages of 25, wrap each
   page as `{data, meta}`, and gzip it. If the generation is over `CACHE_GEN_MAX_BYTES`, drop the deepest
   single-filter pages, then the deepest default pages.
4. Diff the details:
   - Read `jc:v1:details:index` with `HGETALL`, which is one command. It holds about 34k × 80 B ≈ 2.7 MB, under the
     10 MB request cap.
   - Compare it with the snapshot's `{id, contentHash}`.
   - **Changed or new ids:** fetch their `DETAIL_SELECT` rows in pages of 500.
   - **Weekly full refresh:** on Sundays (UTC), every detail is rewritten, at about 170 commands. The detail body embeds
     `company.jobCount`, which otherwise only refreshes when the job itself changes. That field is therefore up to
     7 days stale; the UI does not read it.
   - **Removed ids:** these were stored before but are no longer active and listed.
5. Choose the mode:
   - `double_buffer`: use this when the bytes already stored plus the new generation fit in
     0.8 × `CACHE_MAX_MEMORY_BYTES`. Estimate the stored bytes from `meta:lastPublish.bytes` plus the details size.
   - `single_buffer`: delete `current` first, then the old generation. The API serves BYPASS from Postgres during the
     build, which is about 30 s.
6. Write details for new and changed ids before the swap, so that new list items link to a cached detail:
   - `HSET jc:v1:details:<shard>` in batches of ≤ 200 fields or ≤ 1 MB per command, grouped by shard.
   - Update `jc:v1:details:index` in batches of ≤ 5,000 fields (≈ 400 KB) per command.
   - If the total details size would go over `CACHE_DETAILS_MAX_BYTES`, keep only the newest jobs (by `publishedAt`)
     and emit the `cache_details_truncated` event.
7. Write the generation:
   - `HSET jc:v1:gen:<gen>` in chunks of ≤ 1 MB.
   - Run `EXPIRE 172800` right after the first chunk, as orphan protection.
   - Write `__manifest` last.
8. Verify: `HLEN` equals `fields + 1`, and `HGET __manifest` parses with the right `gen`.
9. Swap with one `MULTI`:
   - `SET jc:v1:current <gen>`
   - `PERSIST` the new generation
   - `SET meta:lastScrapeAt`
   - `SET meta:lastPublish`
   - `EXPIRE <old gen> 900`
   - `EXEC`
10. After the swap, `HDEL` the removed ids from their `jc:v1:details:<shard>` and from `jc:v1:details:index`, in
    batches of 500.
11. Release the lock with a compare-and-delete (Lua `if get==runId then del`).
12. Optionally purge the CDN tag `jobs-v1`, only when both `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` are set (D-15).

**On failure in steps 2–9:**
- `UNLINK` the partial generation and leave `jc:v1:current` alone.
  - In `single_buffer` mode the old generation is already gone, so the API keeps serving from Postgres until the next
    publish or a manual `cache:publish`.
- Detail entries already written stay. They are valid data for active jobs.
- Still set `meta:lastScrapeAt`, release the lock, and emit an ErrorTracker `cache_publish_failed` event with
  `{step, message}`.
- Return `status: 'failed'`. The coordinator exits **2** (05 §4).

**Dry run:** steps 2–5 run and the sizes and command counts are printed. Nothing is written.
- To save Neon egress, the dry run does **not** fetch detail rows.
- It estimates the details size as `changedOrNewCount × average size`, where the average comes from a 200-row sample
  of `DETAIL_SELECT`.

**Publisher Redis client** (`createRedis({role:'publisher'})`):
- `enableOfflineQueue:true`, `maxRetriesPerRequest:3`
- `commandTimeout:10000`, `connectTimeout:5000`
- `lazyConnect:false`
- One connection, closed with `quit()` at the end.

**Run id for `cache:publish`:** `<ts>-publish-<sha>`. ErrorTracker v2 adds the mode `publish`.

## 5. Read algorithm

Implemented in `src/api/cache/ReadThrough.ts`; see 04 §3.

### 5.1 Lists, facets, companies, meta

1. Compute `key = canonical(query)` and check `isCacheableView(key)`, using its shape only: `{page}` or `{page, F}`
   with a known `F`.
   - Not cacheable → MISS `view_not_cached`, straight to Postgres, with **no Redis command**.
   - If Redis is disabled, return BYPASS `not_configured`.
   - If the breaker is open, return BYPASS `circuit_open`.
   - If the budget is exhausted, return BYPASS `budget_exhausted`.
2. Look up `gen` and `lastScrapeAt` with `MGET jc:v1:current jc:v1:meta:lastScrapeAt` (one command), cached
   in-process for 300 s.
   - Missing → BYPASS `no_generation`, and remember "no generation" for 60 s.
3. Look up the manifest with `HGET __manifest`, cached in-process per gen.
   - Missing → BYPASS `missing_generation`.
4. Check the request against the manifest.
   - The filter value is not in the manifest (for example, a country outside the top 20) → MISS `view_not_cached`.
   - Beyond `pagesCached` → MISS `page_not_cached`.
   - Beyond `totalPages` → synthesize an empty page and return HIT.
5. In-process LRU (200 entries, 30 s TTL).
   - Hit → return HIT with no Redis command.
6. `HGET jc:v1:gen:<gen> <key>`.
   - Missing → MISS `field_missing`.
7. Otherwise serve the value.
   - If the snapshot is stale, return STALE: `builtAt` is more than 36 h old, or `meta:lastScrapeAt` is more than
     5 min newer than `manifest.scrapeFinishedAt`.
   - Otherwise return HIT.

On MISS or BYPASS, run the same query through `src/api/db/queries.ts`.

### 5.2 Detail

1. If the id is not a UUID, return 404 with no I/O. Ashby ids are UUIDs too, so the two can't be told apart by format.
2. `HGET jc:v1:details:<detailsShard(id)> <id>`.
   - Hit → HIT.
   - Miss → Postgres with `OR: [{ id }, { ashbyId: id }]`. A miss is normal for an inactive, unlisted or truncated job,
     or when the request uses an `ashbyId`. In that last case, one command is wasted.

### 5.3 The API never refills

There are no lazy writes and no locks in the API. This keeps commands low and means the cache has a single writer
(D-04). An empty or flushed cache is fixed by the next publish or by running `cache:publish` by hand.

### 5.4 Budget and breaker

**Breaker:** one per instance.
- 3 consecutive Redis errors or timeouts → open for 30 s, then a single probe.
- Command timeout: 150 ms.
- Total Redis time per request: 300 ms, after which the request falls back to Postgres. A cold connect has its own
  1000 ms budget instead, used only for the request that triggers it.

**Budget exhaustion:**
- Trigger: Upstash returns its limit error. Match `/max (daily |monthly )?requests? limit/i`; the known text is in §1.
  Also treat `ERR max concurrent connections exceeded` as a breaker failure.
- Effect: the instance sets `budgetExhaustedUntil` to the next 00:00 UTC.
- Reporting: `/health` reports `cache.state = budget_exhausted`.

## 6. Freshness and observability

**Headers on every `/v1/*` response:**

| Header | Value |
|---|---|
| `X-Cache` | `HIT`, `MISS`, `BYPASS` or `STALE` |
| `X-Cache-Reason` | one of `not_configured`, `circuit_open`, `budget_exhausted`, `redis_error`, `timeout`, `no_generation`, `missing_generation`, `view_not_cached`, `page_not_cached`, `field_missing` |
| `X-Cache-Generation` | the gen id |
| `X-Data-Updated-At` | `manifest.scrapeFinishedAt` or `meta:lastScrapeAt` |
| `Server-Timing` | `redis;dur=…, db;dur=…` |

**Elsewhere:**
- `/health` reports `cache.state`, the generation, `builtAt` and `data.ageHours` (04 §5).
- The run report has a `cache` section (07 §2).

## 7. Failure modes

| Situation | API result | Recovery |
|---|---|---|
| `REDIS_URL` unset | BYPASS `not_configured` | Set the env var |
| No `current` pointer (fresh database, flushed, or archived and restored empty) | BYPASS `no_generation` | Next scrape, or Actions `workflow_dispatch` → `npm run cache:publish` |
| Pointer exists but the generation hash is gone | BYPASS `missing_generation` | Same as above |
| Redis errors or timeouts | Breaker opens → BYPASS | Automatic |
| Budget exhausted | BYPASS `budget_exhausted` until 00:00 UTC | Automatic. Owner reviews traffic. |
| Database archived after 30 days unused (can't happen with a daily publish) | BYPASS | Restore the backup into a new database (or create an empty one), update `REDIS_URL` in Actions and Vercel, then run `cache:publish` |
| A publish fails mid-way | The old generation keeps serving, flagged STALE once old | Next run, or `cache:publish` |

## 8. CLIs

These are added in P2-T03, with matching npm scripts in `package.json`:

| Command | What it does |
|---|---|
| `npm run cache:publish [-- --dry-run]` | Rebuilds the cache from Postgres without scraping |
| `npm run cache:status` | Prints `current`, the manifest summary, `lastPublish`, `lastScrapeAt`, `DBSIZE`, and the memory figure from `INFO memory` (parsed defensively) |
| `npm run cache:purge-legacy` | `SCAN 0 MATCH job:*:hash COUNT 1000` + `UNLINK`, run once |

## 9. Rejected alternatives

These are recorded as ADRs in P4-T01.

| Alternative | Why rejected |
|---|---|
| Redis Cloud free | No TLS, 100 ops/s, no persistence, deleted after 14 days idle. It would need an HMAC envelope and paced writes. |
| One big blob of all job summaries, filtered in the API | About 28 MB raw / 6 MB gzip per cold read, and CPU cost on every request |
| Per-job keys for lists | Too many commands, and no atomic snapshot |
| Lazy refill by the API | Uses the command budget, needs locks, and adds a second writer |
| Cache search results | Unbounded key space, and Postgres handles search fine at 34k rows |
| `@upstash/redis` REST client | Its binary/gzip handling is awkward. ioredis over `rediss://` keeps one client library. Revisit if P0-T01 shows a low connection limit (Q-03). |
