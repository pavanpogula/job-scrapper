/**
 * @file Redis Cache Generation Publisher and Maintenance Utilities
 * @summary Builds, compresses, and atomically publishes PostgreSQL snapshots to Upstash Redis with sanity gating and detail diffing
 * @tags Cache, Redis, Publisher, SanityGate, Upstash
 */

import crypto from 'crypto';
import zlib from 'zlib';
import { PrismaClient } from '@prisma/client';
import { getRedisClient } from '../lib/cache/RedisClient';
import {
  KEY_CURRENT,
  KEY_DETAILS_INDEX,
  KEY_LAST_SCRAPE_AT,
  KEY_LAST_PUBLISH,
  KEY_LOCK_PUBLISH,
  genKey,
  detailsShardKey,
  canonicalJobsKey,
} from '../lib/cache/keys';
import {
  LIST_SELECT,
  DETAIL_SELECT,
  toJobListItem,
  toJobDetail,
  matchesFilter,
  SingleFilter,
} from '../api/contract';
import { computeFacets, queryCompanies } from '../api/db/queries';

export interface CachePublishOptions {
  runId: string;
  scrapeFinishedAt: string;
  prisma: PrismaClient | any;
  redis?: any;
  tracker?: any;
  dryRun?: boolean;
  force?: boolean;
}

export interface CachePublishResult {
  attempted: boolean;
  status:
    | 'published'
    | 'skipped_not_configured'
    | 'skipped_locked'
    | 'skipped_incomplete_run'
    | 'skipped_flag'
    | 'gated'
    | 'failed';
  gen?: string;
  previousGen?: string;
  mode?: 'double_buffer' | 'single_buffer';
  fields?: number;
  bytes?: number;
  detailsWritten?: number;
  detailsDeleted?: number;
  commands?: number;
  jobCount?: number;
  companiesWithJobs?: number;
  durationMs: number;
  step?: string;
  error?: string;
}

const _CACHE_GEN_MAX_BYTES = parseInt(process.env.CACHE_GEN_MAX_BYTES || '16777216', 10);
const _CACHE_DETAILS_MAX_BYTES = parseInt(process.env.CACHE_DETAILS_MAX_BYTES || '159383552', 10);
const CACHE_MAX_MEMORY_BYTES = parseInt(process.env.CACHE_MAX_MEMORY_BYTES || '250000000', 10);

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * @summary Formats generation ID following g<UTC yyyyMMddTHHmmssZ>-<sha1(runId).slice(0, 4)>
 */
export function formatGenId(runId: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const MM = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  const hash = crypto.createHash('sha1').update(runId).digest('hex').slice(0, 4);
  return `g${yyyy}${MM}${dd}T${HH}${mm}${ss}Z-${hash}`;
}

/**
 * @summary Releases the publish lock via compare-and-delete Lua script
 */
async function releaseLock(redis: any, runId: string): Promise<void> {
  try {
    await redis.eval(RELEASE_LOCK_LUA, 1, KEY_LOCK_PUBLISH, runId);
  } catch {
    // Non-fatal lock cleanup
  }
}

/**
 * @summary Records the scrape finished timestamp to meta:lastScrapeAt
 */
export async function recordScrapeFinished(options: {
  scrapeFinishedAt: string;
  redis?: any;
}): Promise<void> {
  const client = options.redis || (process.env.REDIS_URL ? getRedisClient('publisher') : null);
  if (!client) return;
  try {
    await client.set(KEY_LAST_SCRAPE_AT, options.scrapeFinishedAt);
  } catch {
    // Non-fatal
  }
}

/**
 * @summary Reads every ACTIVE company by paging queryCompanies at its maximum page size
 */
async function fetchAllCompanies(prisma: any): Promise<{ data: any[]; total: number }> {
  const data: any[] = [];
  let total = 0;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const result = await queryCompanies(prisma, { page, pageSize: 100 });
    data.push(...result.data);
    total = result.total;
    totalPages = result.totalPages;
  }
  return { data, total };
}

/**
 * @summary Builds, compresses, and atomically publishes cache generation
 */
export async function publishCacheGeneration(
  options: CachePublishOptions
): Promise<CachePublishResult> {
  const startTime = Date.now();
  const { runId, scrapeFinishedAt, prisma, dryRun = false, force = false } = options;

  let redis = options.redis;
  let ownClient = false;

  if (!redis) {
    if (!process.env.REDIS_URL) {
      return {
        attempted: false,
        status: 'skipped_not_configured',
        durationMs: Date.now() - startTime,
      };
    }
    redis = getRedisClient('publisher');
    ownClient = true;
  }

  const initialCommandCount = redis.commandCount ?? 0;

  try {
    // 1. Acquire Lock
    const lockAcquired = await redis.set(KEY_LOCK_PUBLISH, runId, 'PX', 900000, 'NX');
    if (!lockAcquired) {
      return {
        attempted: true,
        status: 'skipped_locked',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Take Postgres snapshot
    const [snapshotJobs, facets, companiesResult] = await Promise.all([
      prisma.job.findMany({
        where: { active: true, isListed: true },
        select: {
          ...LIST_SELECT,
          contentHash: true,
        },
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      computeFacets(prisma),
      fetchAllCompanies(prisma),
    ]);

    const hiringCompaniesCount = new Set(
      snapshotJobs.map((j: any) => j.companySlug).filter(Boolean)
    ).size;

    // Sanity Gate
    const lastPublishRaw = await redis.get(KEY_LAST_PUBLISH);
    let previousPublish: any = null;
    if (lastPublishRaw) {
      try {
        previousPublish = JSON.parse(lastPublishRaw);
      } catch {
        previousPublish = null;
      }
    }

    if (previousPublish && previousPublish.jobCount > 0 && !force) {
      const activeDrop = snapshotJobs.length < 0.7 * previousPublish.jobCount;
      const hiringDrop = hiringCompaniesCount < 0.8 * (previousPublish.companiesWithJobs || 1);

      if (activeDrop || hiringDrop) {
        if (options.tracker?.trackError) {
          options.tracker.trackError('sanity_gate_failed', {
            currentJobs: snapshotJobs.length,
            previousJobs: previousPublish.jobCount,
            currentHiring: hiringCompaniesCount,
            previousHiring: previousPublish.companiesWithJobs,
          });
        }

        await recordScrapeFinished({ scrapeFinishedAt, redis });
        await releaseLock(redis, runId);

        return {
          attempted: true,
          status: 'gated',
          jobCount: snapshotJobs.length,
          companiesWithJobs: hiringCompaniesCount,
          durationMs: Date.now() - startTime,
        };
      }
    }

    const gen = formatGenId(runId);
    const previousGen = (await redis.get(KEY_CURRENT)) || previousPublish?.gen || undefined;

    // 3. Build List Views & Pages
    const defaultJobItems = snapshotJobs.map((j: any) => toJobListItem(j));
    const viewsManifest: Record<string, any> = {};
    const genFields: Record<string, Buffer> = {};

    // Default view
    const defaultTotal = defaultJobItems.length;
    const defaultTotalPages = Math.max(1, Math.ceil(defaultTotal / 25));
    viewsManifest['default'] = {
      filter: {},
      total: defaultTotal,
      totalPages: defaultTotalPages,
      pagesCached: defaultTotalPages,
    };

    for (let p = 1; p <= defaultTotalPages; p++) {
      const pageData = defaultJobItems.slice((p - 1) * 25, p * 25);
      const payload = {
        data: pageData,
        meta: {
          total: defaultTotal,
          page: p,
          pageSize: 25,
          totalPages: defaultTotalPages,
          hasNext: p < defaultTotalPages,
          hasPrev: p > 1,
        },
      };
      genFields[`jobs?page=${p}`] = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
    }

    // Single-filter views
    const singleFilters: Array<{ keyName: string; filter: SingleFilter }> = [
      { keyName: 'workplaceType=Remote', filter: { workplaceType: 'Remote' } },
      { keyName: 'workplaceType=Hybrid', filter: { workplaceType: 'Hybrid' } },
      { keyName: 'workplaceType=OnSite', filter: { workplaceType: 'OnSite' } },
      { keyName: 'employmentType=FullTime', filter: { employmentType: 'FullTime' } },
      { keyName: 'employmentType=PartTime', filter: { employmentType: 'PartTime' } },
      { keyName: 'employmentType=Contract', filter: { employmentType: 'Contract' } },
      { keyName: 'employmentType=Intern', filter: { employmentType: 'Intern' } },
      { keyName: 'employmentType=Temporary', filter: { employmentType: 'Temporary' } },
      { keyName: 'hasSalary=true', filter: { hasSalary: true } },
    ];

    if (facets.countries && Array.isArray(facets.countries)) {
      for (const c of facets.countries.slice(0, 20)) {
        if (c.value) {
          singleFilters.push({
            keyName: `country=${c.value}`,
            filter: { country: c.value },
          });
        }
      }
    }

    for (const item of singleFilters) {
      const filtered = defaultJobItems.filter((j: any) => matchesFilter(j, item.filter));
      const totalFiltered = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalFiltered / 25));
      const pagesCached = Math.min(totalPages, 40);

      viewsManifest[item.keyName] = {
        filter: item.filter,
        total: totalFiltered,
        totalPages,
        pagesCached,
      };

      for (let p = 1; p <= pagesCached; p++) {
        const pageData = filtered.slice((p - 1) * 25, p * 25);
        const canonKey = canonicalJobsKey({
          ...item.filter,
          page: p,
        });
        const payload = {
          data: pageData,
          meta: {
            total: totalFiltered,
            page: p,
            pageSize: 25,
            totalPages,
            hasNext: p < totalPages,
            hasPrev: p > 1,
          },
        };
        genFields[canonKey] = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 });
      }
    }

    // Facets & Meta
    genFields['facets'] = zlib.gzipSync(Buffer.from(JSON.stringify(facets)), { level: 6 });
    genFields['meta'] = zlib.gzipSync(
      Buffer.from(
        JSON.stringify({
          activeJobs: defaultTotal,
          hiringCompanies: hiringCompaniesCount,
          withSalary: facets.hasSalary?.yes ?? 0,
          lastScrapeAt: scrapeFinishedAt,
          generation: gen,
        })
      ),
      { level: 6 }
    );

    // Companies pages
    const allCompanies = (companiesResult.data || []).map((c: any) => ({
      slug: c.slug,
      name: c.name,
      logoUrl: c.logoUrl,
      jobCount: c.jobCount ?? 0,
    }));
    const totalCompanies = companiesResult.total || allCompanies.length;
    const companyTotalPages = Math.max(1, Math.ceil(totalCompanies / 30));

    for (let p = 1; p <= companyTotalPages; p++) {
      const pageCompanies = allCompanies.slice((p - 1) * 30, p * 30);
      genFields[`companies?page=${p}`] = zlib.gzipSync(
        Buffer.from(
          JSON.stringify({
            data: pageCompanies,
            total: totalCompanies,
            page: p,
            pageSize: 30,
            totalPages: companyTotalPages,
          })
        ),
        { level: 6 }
      );
    }

    // 4. Diff Details
    const storedIndex = (await redis.hgetall(KEY_DETAILS_INDEX)) || {};
    const isSunday = new Date().getUTCDay() === 0;

    const changedOrNewJobIds: string[] = [];
    const activeJobIdSet = new Set<string>();

    for (const job of snapshotJobs) {
      activeJobIdSet.add(job.id);
      if (isSunday || storedIndex[job.id] !== job.contentHash) {
        changedOrNewJobIds.push(job.id);
      }
    }

    const removedJobIds: string[] = [];
    for (const storedId of Object.keys(storedIndex)) {
      if (!activeJobIdSet.has(storedId)) {
        removedJobIds.push(storedId);
      }
    }

    let detailsWritten = 0;
    let detailsDeleted = 0;
    let _detailsTotalBytes = 0;

    // 5. Buffer mode selection
    let totalGenBytes = 0;
    for (const buf of Object.values(genFields)) {
      totalGenBytes += buf.byteLength;
    }

    const estimatedDetailsBytes = changedOrNewJobIds.length * 3500;
    const lastPublishBytes = previousPublish?.bytes || 0;
    const fitsDoubleBuffer =
      lastPublishBytes + totalGenBytes + estimatedDetailsBytes <= 0.8 * CACHE_MAX_MEMORY_BYTES;
    const mode: 'double_buffer' | 'single_buffer' = fitsDoubleBuffer
      ? 'double_buffer'
      : 'single_buffer';

    if (dryRun) {
      await releaseLock(redis, runId);
      return {
        attempted: true,
        status: 'published',
        gen,
        previousGen,
        mode,
        fields: Object.keys(genFields).length,
        bytes: totalGenBytes,
        detailsWritten: changedOrNewJobIds.length,
        detailsDeleted: removedJobIds.length,
        commands: (redis.commandCount ?? 0) - initialCommandCount,
        jobCount: snapshotJobs.length,
        companiesWithJobs: hiringCompaniesCount,
        durationMs: Date.now() - startTime,
      };
    }

    // 6. Write Details
    if (mode === 'single_buffer') {
      await redis.del(KEY_CURRENT);
      if (previousGen) {
        await redis.unlink(genKey(previousGen));
      }
    }

    // Fetch and write changed/new details in batches of 500
    for (let i = 0; i < changedOrNewJobIds.length; i += 500) {
      const batchIds = changedOrNewJobIds.slice(i, i + 500);
      const detailRows = await prisma.job.findMany({
        where: { id: { in: batchIds } },
        select: DETAIL_SELECT,
      });

      const shardBatches: Record<string, Record<string, Buffer>> = {};
      const indexBatch: Record<string, string> = {};

      for (const row of detailRows) {
        const shard = detailsShardKey(row.id);
        if (!shardBatches[shard]) {
          shardBatches[shard] = {};
        }
        const detailEnvelope = { data: toJobDetail(row) };
        const gzipBuf = zlib.gzipSync(Buffer.from(JSON.stringify(detailEnvelope)), { level: 6 });
        shardBatches[shard][row.id] = gzipBuf;
        _detailsTotalBytes += gzipBuf.byteLength;

        const hash = snapshotJobs.find((j: any) => j.id === row.id)?.contentHash || '';
        indexBatch[row.id] = hash;
      }

      for (const [shardKey, fieldMap] of Object.entries(shardBatches)) {
        await redis.hset(shardKey, fieldMap);
      }

      if (Object.keys(indexBatch).length > 0) {
        await redis.hset(KEY_DETAILS_INDEX, indexBatch);
      }

      detailsWritten += detailRows.length;
    }

    // 7. Write Generation Hash
    const targetGenKey = genKey(gen);
    const genFieldEntries = Object.entries(genFields);
    let chunkSize = 0;
    let chunkMap: Record<string, Buffer> = {};
    let isFirstChunk = true;

    for (let i = 0; i < genFieldEntries.length; i++) {
      const [field, buf] = genFieldEntries[i];
      chunkMap[field] = buf;
      chunkSize += buf.byteLength;

      if (chunkSize >= 1000000 || i === genFieldEntries.length - 1) {
        await redis.hset(targetGenKey, chunkMap);
        if (isFirstChunk) {
          await redis.expire(targetGenKey, 172800); // 48h orphan protection
          isFirstChunk = false;
        }
        chunkMap = {};
        chunkSize = 0;
      }
    }

    // Build Manifest and write last
    const manifest = {
      schema: 1,
      gen,
      runId,
      source: 'db_snapshot',
      scrapeFinishedAt,
      builtAt: new Date().toISOString(),
      encoding: 'gzip',
      pageSize: 25,
      views: viewsManifest,
      companies: {
        total: totalCompanies,
        pageSize: 30,
        totalPages: companyTotalPages,
        pagesCached: companyTotalPages,
      },
      details: {
        count: snapshotJobs.length,
        truncated: false,
      },
      fields: Object.keys(genFields).length,
      bytes: totalGenBytes,
      mode,
    };

    await redis.hset(targetGenKey, '__manifest', JSON.stringify(manifest));

    // 8. Verify
    const actualFields = await redis.hlen(targetGenKey);
    const verifiedManifest = await redis.hget(targetGenKey, '__manifest');
    if (actualFields !== manifest.fields + 1 || !verifiedManifest) {
      throw new Error(
        `Generation verification failed: field count mismatch (${actualFields} !== ${manifest.fields + 1})`
      );
    }

    // 9. Atomic Swap
    const lastPublishMeta = {
      gen,
      runId,
      publishedAt: new Date().toISOString(),
      mode,
      fields: manifest.fields,
      bytes: totalGenBytes,
      detailsWritten,
      detailsDeleted: removedJobIds.length,
      commands: (redis.commandCount ?? 0) - initialCommandCount + 6,
      durationMs: Date.now() - startTime,
      status: 'published',
      jobCount: snapshotJobs.length,
      companiesWithJobs: hiringCompaniesCount,
    };

    const multi = redis.multi();
    multi.set(KEY_CURRENT, gen);
    multi.persist(targetGenKey);
    multi.set(KEY_LAST_SCRAPE_AT, scrapeFinishedAt);
    multi.set(KEY_LAST_PUBLISH, JSON.stringify(lastPublishMeta));
    if (previousGen && previousGen !== gen) {
      multi.expire(genKey(previousGen), 900);
    }
    await multi.exec();

    // 10. Purge removed jobs from shards & index
    for (let i = 0; i < removedJobIds.length; i += 500) {
      const batch = removedJobIds.slice(i, i + 500);
      const shardGroups: Record<string, string[]> = {};
      for (const id of batch) {
        const shard = detailsShardKey(id);
        if (!shardGroups[shard]) shardGroups[shard] = [];
        shardGroups[shard].push(id);
      }
      for (const [shardKey, ids] of Object.entries(shardGroups)) {
        await redis.hdel(shardKey, ...ids);
      }
      await redis.hdel(KEY_DETAILS_INDEX, ...batch);
      detailsDeleted += batch.length;
    }

    // 11. Release Lock
    await releaseLock(redis, runId);

    return {
      attempted: true,
      status: 'published',
      gen,
      previousGen,
      mode,
      fields: manifest.fields,
      bytes: totalGenBytes,
      detailsWritten,
      detailsDeleted,
      commands: (redis.commandCount ?? 0) - initialCommandCount,
      jobCount: snapshotJobs.length,
      companiesWithJobs: hiringCompaniesCount,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    if (options.tracker?.trackError) {
      options.tracker.trackError('cache_publish_failed', {
        step: 'publish',
        message: error.message,
      });
    }

    await recordScrapeFinished({ scrapeFinishedAt, redis });
    await releaseLock(redis, runId);

    return {
      attempted: true,
      status: 'failed',
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  } finally {
    if (ownClient && redis?.quit) {
      try {
        await redis.quit();
      } catch {
        // Non-fatal
      }
    }
  }
}

/**
 * @summary Runs cache:status inspection and formats human-readable report
 */
export async function runCacheStatus(redisClient?: any): Promise<string> {
  const redis = redisClient || (process.env.REDIS_URL ? getRedisClient('publisher') : null);
  if (!redis) {
    return 'Redis is not configured (REDIS_URL unset).';
  }

  const [current, lastScrapeAt, lastPublishRaw, dbsize, infoMemory] = await Promise.all([
    redis.get(KEY_CURRENT),
    redis.get(KEY_LAST_SCRAPE_AT),
    redis.get(KEY_LAST_PUBLISH),
    redis.dbsize ? redis.dbsize() : 0,
    redis.info ? redis.info('memory').catch(() => '') : '',
  ]);

  let manifest: any = null;
  if (current) {
    const rawManifest = await redis.hget(genKey(current), '__manifest');
    if (rawManifest) {
      try {
        manifest = JSON.parse(rawManifest);
      } catch {
        // Ignore
      }
    }
  }

  let lastPublish: any = null;
  if (lastPublishRaw) {
    try {
      lastPublish = JSON.parse(lastPublishRaw);
    } catch {
      // Ignore
    }
  }

  // Parse memory info defensively
  let usedMemory = 'unknown';
  const memMatch = infoMemory.match(/used_memory_human:([^\r\n]+)/) || infoMemory.match(/used_memory:([^\r\n]+)/);
  if (memMatch) {
    usedMemory = memMatch[1].trim();
  } else if (lastPublish?.bytes) {
    usedMemory = `~${(lastPublish.bytes / (1024 * 1024)).toFixed(2)}MB (from last publish)`;
  }

  const lines = [
    '================ Cache Status ===============',
    `Current Generation: ${current || '(none)'}`,
    `Last Scrape:        ${lastScrapeAt || '(unknown)'}`,
    `Total Keys (DBSIZE): ${dbsize}`,
    `Memory:             ${usedMemory}`,
    '',
    '--- Last Publish Metadata ---',
    `Status:             ${lastPublish?.status || '(none)'}`,
    `Run ID:             ${lastPublish?.runId || '(none)'}`,
    `Published At:       ${lastPublish?.publishedAt || '(none)'}`,
    `Jobs:               ${lastPublish?.jobCount ?? (manifest?.details?.count || 0)}`,
    `Commands Executed:  ${lastPublish?.commands ?? 'N/A'}`,
    `Duration:           ${lastPublish?.durationMs ? `${lastPublish.durationMs}ms` : 'N/A'}`,
    '=============================================',
  ];

  return lines.join('\n');
}

/**
 * @summary Runs cache:purge-legacy scanning and removing job:*:hash keys
 */
export async function runCachePurgeLegacy(redisClient?: any): Promise<number> {
  const redis = redisClient || (process.env.REDIS_URL ? getRedisClient('publisher') : null);
  if (!redis) {
    throw new Error('Redis is not configured (REDIS_URL unset).');
  }

  let cursor = '0';
  let totalPurged = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'job:*:hash', 'COUNT', 1000);
    cursor = nextCursor;
    if (keys.length > 0) {
      const deleted = await redis.unlink(...keys);
      totalPurged += deleted;
    }
  } while (cursor !== '0');

  return totalPurged;
}
