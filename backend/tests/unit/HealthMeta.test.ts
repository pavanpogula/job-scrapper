/**
 * @file Unit tests for /health v2 and GET /v1/meta (P2-T07)
 * @summary Validates shallow /health inspection, 0-command warm execution, and /v1/meta endpoint
 * @tags Testing, Health, Meta, ShallowHealth, ReadThrough
 */

import request from 'supertest';
import zlib from 'zlib';
import app, { resetHealthCache } from '../../src/api/Server';
import { readThroughService } from '../../src/api/cache/ReadThrough';
import { FakeRedis } from '../helpers/fakeRedis';
import { KEY_CURRENT, KEY_LAST_SCRAPE_AT, genKey } from '../../src/lib/cache/keys';
import { mockJob } from '../../__mocks__/@prisma/client';

describe('Health v2 and /v1/meta (P2-T07)', () => {
  let fakeRedis: FakeRedis;
  let ipCounter = 1;
  const getNextIp = () => `10.201.1.${ipCounter++}`;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
    readThroughService.setRedisClient(fakeRedis);
    readThroughService.resetCaches();
    resetHealthCache();
    jest.clearAllMocks();
  });

  afterAll(() => {
    readThroughService.setRedisClient(null);
  });

  describe('GET /health v2', () => {
    it('returns 200 with cache.state=ok, generation, and data.ageHours when cache is warm', async () => {
      const gen = 'g20261024T120000Z-abcd';
      const scrapeTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2 hours ago
      await fakeRedis.set(KEY_CURRENT, gen);
      await fakeRedis.set(KEY_LAST_SCRAPE_AT, scrapeTime);

      const manifest = {
        schema: 1,
        gen,
        builtAt: scrapeTime,
        scrapeFinishedAt: scrapeTime,
        mode: 'double_buffer',
        views: { default: { total: 34023, totalPages: 1361, pagesCached: 1361 } },
        details: { count: 34023 },
      };
      await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

      const metaData = {
        activeJobs: 34023,
        hiringCompanies: 1500,
        withSalary: 12000,
        lastScrapeAt: scrapeTime,
        generation: gen,
      };
      await fakeRedis.hset(genKey(gen), 'meta', zlib.gzipSync(Buffer.from(JSON.stringify(metaData))));

      // Warm request
      const res1 = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('ok');
      expect(res1.body.activeJobs).toBe(34023);
      expect(res1.body.cache.state).toBe('ok');
      expect(res1.body.cache.generation).toBe(gen);
      expect(res1.body.cache.mode).toBe('double_buffer');
      expect(res1.body.data.lastScrapeAt).toBe(scrapeTime);
      expect(res1.body.data.ageHours).toBeCloseTo(2, 0);
      expect(res1.body.data.fresh).toBe(true);
      expect(res1.body.data.stale).toBe(false);
      expect(res1.body.db.checked).toBe(false);

      // Second request when cache is warm issues 0 DB and 0 Redis commands
      const commandsBefore = fakeRedis.commandCount;
      const dbCallsBefore = (mockJob.count as jest.Mock).mock.calls.length;

      const res2 = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res2.status).toBe(200);
      expect(fakeRedis.commandCount).toBe(commandsBefore);
      expect((mockJob.count as jest.Mock).mock.calls.length).toBe(dbCallsBefore);
    });

    it('returns status=degraded when no generation exists and falls back to cached DB count', async () => {
      mockJob.count.mockResolvedValueOnce(12345);

      const res = await request(app)
        .get('/health')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.cache.state).toBe('no_generation');
      expect(res.body.activeJobs).toBe(12345);
      expect(res.body.db.checked).toBe(false);
    });

    it('runs deep DB ping when ?deep=1 is passed with valid X-Health-Token', async () => {
      process.env.HEALTH_TOKEN = 'secret-token';
      const gen = 'g20261024T120000Z-abcd';
      await fakeRedis.set(KEY_CURRENT, gen);

      const manifest = {
        schema: 1,
        gen,
        builtAt: new Date().toISOString(),
        details: { count: 100 },
      };
      await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

      const res = await request(app)
        .get('/health?deep=1')
        .set('X-Health-Token', 'secret-token')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.db.checked).toBe(true);
      expect(res.body.db.status).toBe('ok');

      delete process.env.HEALTH_TOKEN;
    });
  });

  describe('GET /v1/meta', () => {
    it('returns activeJobs, hiringCompanies, withSalary, lastScrapeAt, and generation from cache', async () => {
      const gen = 'g20261024T120000Z-meta';
      await fakeRedis.set(KEY_CURRENT, gen);
      await fakeRedis.set(KEY_LAST_SCRAPE_AT, '2026-10-24T12:00:00Z');

      const manifest = {
        schema: 1,
        gen,
        builtAt: '2026-10-24T12:00:00Z',
        scrapeFinishedAt: '2026-10-24T12:00:00Z',
      };
      await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

      const metaPayload = {
        activeJobs: 34100,
        hiringCompanies: 1720,
        withSalary: 14500,
        lastScrapeAt: '2026-10-24T12:00:00Z',
        generation: gen,
      };
      await fakeRedis.hset(genKey(gen), 'meta', zlib.gzipSync(Buffer.from(JSON.stringify(metaPayload))));

      const res = await request(app)
        .get('/v1/meta')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.body.activeJobs).toBe(34100);
      expect(res.body.hiringCompanies).toBe(1720);
      expect(res.body.withSalary).toBe(14500);
      expect(res.body.generation).toBe(gen);
    });
  });
});
