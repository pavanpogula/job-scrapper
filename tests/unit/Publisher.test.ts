/**
 * @file Unit tests for Redis Cache Publisher and Cache CLI helpers
 * @summary Validates publishCacheGeneration, sanity gate, detail diffing, atomic swap, and CLI utilities
 * @tags Testing, Cache, Publisher, Redis, SanityGate
 */

import { FakeRedis } from '../helpers/fakeRedis';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import {
  publishCacheGeneration,
  recordScrapeFinished,
  runCacheStatus,
  runCachePurgeLegacy,
  CachePublishResult,
} from '../../src/cache/Publisher';
import {
  KEY_CURRENT,
  KEY_DETAILS_INDEX,
  KEY_LAST_SCRAPE_AT,
  KEY_LAST_PUBLISH,
  KEY_LOCK_PUBLISH,
  genKey,
  detailsShardKey,
} from '../../src/lib/cache/keys';
import zlib from 'zlib';

describe('Publisher - publishCacheGeneration (P2-T03)', () => {
  let fakeRedis: FakeRedis;
  let mockPrisma: any;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
    mockPrisma = createStatefulPrisma();
  });

  const sampleJobs = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      ashbyId: 'ashby-1',
      title: 'Senior Frontend Engineer',
      companySlug: 'acme',
      departmentId: 'eng',
      locationId: 'loc-ny',
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryInterval: 'YEAR',
      isRemote: true,
      workplaceType: 'Remote',
      employmentType: 'FullTime',
      country: 'US',
      region: 'NY',
      city: 'New York',
      active: true,
      isListed: true,
      contentHash: 'hash-1',
      publishedAt: new Date('2026-01-01T10:00:00Z'),
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
      metadata: { descriptionHtml: '<p>Great job</p>' },
      company: { name: 'Acme Corp', logoUrl: 'https://logo.png', slug: 'acme' },
      department: { name: 'Engineering' },
      location: { name: 'New York' },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      ashbyId: 'ashby-2',
      title: 'Backend Engineer',
      companySlug: 'beta',
      departmentId: 'eng',
      locationId: 'loc-sf',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryInterval: null,
      isRemote: false,
      workplaceType: 'OnSite',
      employmentType: 'Contract',
      country: 'CA',
      region: 'ON',
      city: 'Toronto',
      active: true,
      isListed: true,
      contentHash: 'hash-2',
      publishedAt: new Date('2026-01-02T10:00:00Z'),
      createdAt: new Date('2026-01-02T10:00:00Z'),
      updatedAt: new Date('2026-01-02T10:00:00Z'),
      metadata: { descriptionHtml: '<p>Backend work</p>' },
      company: { name: 'Beta Ltd', logoUrl: 'https://logo2.png', slug: 'beta' },
      department: { name: 'Engineering' },
      location: { name: 'Toronto' },
    },
  ];

  it('skips publication when REDIS_URL is not configured and no redis client is provided', async () => {
    const prevEnv = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const res = await publishCacheGeneration({
        runId: 'run-no-redis',
        scrapeFinishedAt: '2026-01-01T12:00:00Z',
        prisma: mockPrisma,
      });
      expect(res.status).toBe('skipped_not_configured');
      expect(res.attempted).toBe(false);
    } finally {
      process.env.REDIS_URL = prevEnv;
    }
  });

  it('skips publication when publish lock is held by another process', async () => {
    await fakeRedis.set(KEY_LOCK_PUBLISH, 'other-run', 'PX', 900000, 'NX');

    const res = await publishCacheGeneration({
      runId: 'my-run',
      scrapeFinishedAt: '2026-01-01T12:00:00Z',
      prisma: mockPrisma,
      redis: fakeRedis,
    });

    expect(res.status).toBe('skipped_locked');
    expect(res.attempted).toBe(true);
  });

  it('performs dry-run without writing any keys to Redis', async () => {
    for (const job of sampleJobs) {
      mockPrisma.seed('job', job);
    }
    mockPrisma.seed('company', { id: 'acme-id', slug: 'acme', name: 'Acme Corp', status: 'ACTIVE' });
    mockPrisma.seed('company', { id: 'beta-id', slug: 'beta', name: 'Beta Ltd', status: 'ACTIVE' });

    const initialKeyCount = (await fakeRedis.dbsize());

    const res = await publishCacheGeneration({
      runId: 'dry-run-123',
      scrapeFinishedAt: '2026-01-01T12:00:00Z',
      prisma: mockPrisma,
      redis: fakeRedis,
      dryRun: true,
    });

    expect(res.status).toBe('published');
    expect(res.jobCount).toBe(2);
    expect(res.companiesWithJobs).toBe(2);
    expect(await fakeRedis.dbsize()).toBe(initialKeyCount);
    expect(await fakeRedis.get(KEY_CURRENT)).toBeNull();
  });

  it('publishes a full cache generation and executes atomic swap', async () => {
    for (const job of sampleJobs) {
      mockPrisma.seed('job', job);
    }
    mockPrisma.seed('company', { id: 'acme-id', slug: 'acme', name: 'Acme Corp', status: 'ACTIVE' });
    mockPrisma.seed('company', { id: 'beta-id', slug: 'beta', name: 'Beta Ltd', status: 'ACTIVE' });

    const res = await publishCacheGeneration({
      runId: 'full-run-1',
      scrapeFinishedAt: '2026-01-01T12:00:00Z',
      prisma: mockPrisma,
      redis: fakeRedis,
    });

    expect(res.status).toBe('published');
    expect(res.gen).toBeDefined();

    // Verify current pointer points to generation
    const current = await fakeRedis.get(KEY_CURRENT);
    expect(current).toBe(res.gen);

    // Verify manifest
    const manifestRaw = await fakeRedis.hget(genKey(res.gen!), '__manifest');
    expect(manifestRaw).toBeDefined();
    const manifest = JSON.parse(manifestRaw!);
    expect(manifest.gen).toBe(res.gen);
    expect(manifest.views.default.total).toBe(2);

    // Verify default view page 1 exists and gunzips to valid JSON
    const page1Raw = await fakeRedis.hgetBuffer(genKey(res.gen!), 'jobs?page=1');
    expect(page1Raw).toBeDefined();
    const page1 = JSON.parse(zlib.gunzipSync(page1Raw!).toString('utf8'));
    expect(page1.data).toHaveLength(2);
    expect(page1.meta.total).toBe(2);

    // Verify details index was written
    const indexRaw = await fakeRedis.hgetall(KEY_DETAILS_INDEX);
    expect(indexRaw[sampleJobs[0].id]).toBe(sampleJobs[0].contentHash);
    expect(indexRaw[sampleJobs[1].id]).toBe(sampleJobs[1].contentHash);

    // Verify detail was written to shard
    const shard0Key = detailsShardKey(sampleJobs[0].id);
    const detailRaw = await fakeRedis.hgetBuffer(shard0Key, sampleJobs[0].id);
    expect(detailRaw).toBeDefined();
    const detail = JSON.parse(zlib.gunzipSync(detailRaw!).toString('utf8'));
    expect(detail.data.title).toBe(sampleJobs[0].title);

    // Verify last scrape and last publish metadata
    expect(await fakeRedis.get(KEY_LAST_SCRAPE_AT)).toBe('2026-01-01T12:00:00Z');
    const lastPubRaw = await fakeRedis.get(KEY_LAST_PUBLISH);
    expect(lastPubRaw).toBeDefined();
    const lastPub = JSON.parse(lastPubRaw!);
    expect(lastPub.gen).toBe(res.gen);
    expect(lastPub.jobCount).toBe(2);

    // Verify publish lock was released
    expect(await fakeRedis.get(KEY_LOCK_PUBLISH)).toBeNull();
  });

  describe('Sanity Gate (GAP-SCR-18)', () => {
    it('trips sanity gate when active jobs drop by > 30% from last publish', async () => {
      // Seed previous publish metadata indicating 100 jobs and 10 companies
      await fakeRedis.set(
        KEY_LAST_PUBLISH,
        JSON.stringify({
          gen: 'old-gen',
          jobCount: 100,
          companiesWithJobs: 10,
        })
      );
      await fakeRedis.set(KEY_CURRENT, 'old-gen');

      // Provide only 60 active jobs (40% drop > 30% limit)
      for (let i = 0; i < 60; i++) {
        mockPrisma.seed('job', {
          ...sampleJobs[0],
          id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
          ashbyId: `ashby-${i}`,
          contentHash: `hash-${i}`,
        });
      }

      const res = await publishCacheGeneration({
        runId: 'gated-run',
        scrapeFinishedAt: '2026-01-01T12:00:00Z',
        prisma: mockPrisma,
        redis: fakeRedis,
      });

      expect(res.status).toBe('gated');
      expect(await fakeRedis.get(KEY_CURRENT)).toBe('old-gen'); // Unchanged
      expect(await fakeRedis.get(KEY_LAST_SCRAPE_AT)).toBe('2026-01-01T12:00:00Z'); // Scrape time still recorded
      expect(await fakeRedis.get(KEY_LOCK_PUBLISH)).toBeNull(); // Lock released
    });

    it('bypasses sanity gate when force option is true', async () => {
      await fakeRedis.set(
        KEY_LAST_PUBLISH,
        JSON.stringify({
          gen: 'old-gen',
          jobCount: 100,
          companiesWithJobs: 10,
        })
      );
      await fakeRedis.set(KEY_CURRENT, 'old-gen');

      // Provide only 10 jobs (90% drop)
      for (let i = 0; i < 10; i++) {
        mockPrisma.seed('job', {
          ...sampleJobs[0],
          id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
          ashbyId: `ashby-${i}`,
          contentHash: `hash-${i}`,
        });
      }

      const res = await publishCacheGeneration({
        runId: 'force-run',
        scrapeFinishedAt: '2026-01-01T12:00:00Z',
        prisma: mockPrisma,
        redis: fakeRedis,
        force: true,
      });

      expect(res.status).toBe('published');
      expect(await fakeRedis.get(KEY_CURRENT)).toBe(res.gen);
    });
  });

  describe('Detail Diffing and Purging', () => {
    it('purges removed jobs from details shards and details index', async () => {
      const removedId = '99999999-9999-9999-9999-999999999999';
      const removedShard = detailsShardKey(removedId);

      // Pre-seed index and shard with old job
      await fakeRedis.hset(KEY_DETAILS_INDEX, removedId, 'old-hash');
      await fakeRedis.hset(removedShard, removedId, Buffer.from('old-data'));

      mockPrisma.seed('job', sampleJobs[0]);
      mockPrisma.seed('company', { id: 'acme-id', slug: 'acme', name: 'Acme Corp', status: 'ACTIVE' });

      const res = await publishCacheGeneration({
        runId: 'diff-purge-run',
        scrapeFinishedAt: '2026-01-01T12:00:00Z',
        prisma: mockPrisma,
        redis: fakeRedis,
      });

      expect(res.status).toBe('published');
      expect(res.detailsDeleted).toBe(1);

      // Verify removed job is gone from index and shard
      expect(await fakeRedis.hget(KEY_DETAILS_INDEX, removedId)).toBeNull();
      expect(await fakeRedis.hget(removedShard, removedId)).toBeNull();
    });
  });

  describe('recordScrapeFinished', () => {
    it('records timestamp to meta:lastScrapeAt', async () => {
      await recordScrapeFinished({
        scrapeFinishedAt: '2026-05-01T10:00:00Z',
        redis: fakeRedis,
      });
      expect(await fakeRedis.get(KEY_LAST_SCRAPE_AT)).toBe('2026-05-01T10:00:00Z');
    });
  });

  describe('CLI Helpers', () => {
    it('runs cache:status and formats report', async () => {
      await fakeRedis.set(KEY_CURRENT, 'gen-status-test');
      await fakeRedis.set(KEY_LAST_SCRAPE_AT, '2026-01-01T12:00:00Z');
      await fakeRedis.set(
        KEY_LAST_PUBLISH,
        JSON.stringify({
          gen: 'gen-status-test',
          runId: 'run-1',
          publishedAt: '2026-01-01T12:01:00Z',
          status: 'published',
          jobCount: 120,
          commands: 45,
        })
      );
      await fakeRedis.hset(
        genKey('gen-status-test'),
        '__manifest',
        JSON.stringify({
          gen: 'gen-status-test',
          views: { default: { total: 120, pagesCached: 5 } },
          details: { count: 120 },
        })
      );

      const statusOutput = await runCacheStatus(fakeRedis);
      expect(statusOutput).toContain('Current Generation: gen-status-test');
      expect(statusOutput).toMatch(/Status:\s+published/);
      expect(statusOutput).toMatch(/Jobs:\s+120/);
    });

    it('runs cache:purge-legacy and unlinks legacy keys', async () => {
      await fakeRedis.set('job:ashby-1:hash', 'hash-1');
      await fakeRedis.set('job:ashby-2:hash', 'hash-2');
      await fakeRedis.set('other:key', 'val');

      const purged = await runCachePurgeLegacy(fakeRedis);
      expect(purged).toBe(2);
      expect(await fakeRedis.get('job:ashby-1:hash')).toBeNull();
      expect(await fakeRedis.get('other:key')).toBe('val');
    });
  });
});
