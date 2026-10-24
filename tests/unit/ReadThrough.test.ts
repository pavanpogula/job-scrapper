/**
 * @file Unit tests for API Cache Read-Through and DB Guard (P2-T05)
 * @summary Validates cache HIT, MISS, BYPASS, circuit breaker fallback, dbGuard queueing/rejection, and single-flight deduplication
 * @tags Testing, Cache, ReadThrough, Supertest, DbGuard
 */

import request from 'supertest';
import zlib from 'zlib';
import app from '../../src/api/Server';
import { readThroughService } from '../../src/api/cache/ReadThrough';
import { DbGuard, dbGuard, singleFlight } from '../../src/api/middleware/dbGuard';
import { FakeRedis } from '../helpers/fakeRedis';
import { KEY_CURRENT, KEY_LAST_SCRAPE_AT, genKey } from '../../src/lib/cache/keys';

describe('API Cache ReadThrough (P2-T05)', () => {
  let fakeRedis: FakeRedis;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
    readThroughService.setRedisClient(fakeRedis);
    readThroughService.resetCaches();
  });

  afterAll(() => {
    readThroughService.setRedisClient(null);
  });

  it('returns X-Cache: BYPASS with reason not_configured when Redis client is null', async () => {
    readThroughService.setRedisClient(null);

    const res = await request(app).get('/v1/jobs?page=1');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('BYPASS');
    expect(res.headers['x-cache-reason']).toBe('not_configured');
    expect(res.headers['server-timing']).toMatch(/db;dur=\d+/);
  });

  it('returns X-Cache: MISS with reason view_not_cached for search queries without calling Redis', async () => {
    const res = await request(app).get('/v1/jobs?search=engineer');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.headers['x-cache-reason']).toBe('view_not_cached');
    expect(res.headers['server-timing']).toMatch(/db;dur=\d+/);
    expect(fakeRedis.commandCount).toBe(0);
  });

  it('returns X-Cache: BYPASS with reason circuit_open when breaker is open', async () => {
    const breaker = readThroughService.getCircuitBreaker();
    breaker.recordFailure(new Error('fail 1'));
    breaker.recordFailure(new Error('fail 2'));
    breaker.recordFailure(new Error('fail 3'));

    const res = await request(app).get('/v1/jobs?page=1');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('BYPASS');
    expect(res.headers['x-cache-reason']).toBe('circuit_open');
  });

  it('returns X-Cache: HIT after a mock publish', async () => {
    const gen = 'g20261024T120000Z-abcd';
    await fakeRedis.set(KEY_CURRENT, gen);
    await fakeRedis.set(KEY_LAST_SCRAPE_AT, '2026-10-24T12:00:00Z');

    const manifest = {
      schema: 1,
      gen,
      views: {
        default: { filter: {}, total: 2, totalPages: 1, pagesCached: 1 },
      },
      companies: { total: 10, totalPages: 1, pagesCached: 1 },
      details: { count: 2 },
    };
    await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

    const page1Data = {
      data: [{ id: 'mock-1', title: 'Cached Engineer' }],
      meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    };
    const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(page1Data)));
    await fakeRedis.hset(genKey(gen), 'jobs?page=1', gzipped);

    const res = await request(app).get('/v1/jobs?page=1');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.headers['x-cache-generation']).toBe(gen);
    expect(res.headers['server-timing']).toMatch(/redis;dur=\d+/);
    expect(res.body.data[0].title).toBe('Cached Engineer');
  });

  it('synthesizes empty page with X-Cache: HIT when page exceeds totalPages', async () => {
    const gen = 'g20261024T120000Z-abcd';
    await fakeRedis.set(KEY_CURRENT, gen);
    const manifest = {
      schema: 1,
      gen,
      views: {
        default: { filter: {}, total: 50, totalPages: 2, pagesCached: 2 },
      },
    };
    await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

    const res = await request(app).get('/v1/jobs?page=99');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.page).toBe(99);
    expect(res.body.meta.totalPages).toBe(2);
    expect(res.body.meta.hasNext).toBe(false);
  });

  it('returns X-Cache: MISS with reason page_not_cached when page exceeds pagesCached', async () => {
    const gen = 'g20261024T120000Z-abcd';
    await fakeRedis.set(KEY_CURRENT, gen);
    const manifest = {
      schema: 1,
      gen,
      views: {
        'workplaceType=Remote': { filter: { workplaceType: 'Remote' }, total: 5000, totalPages: 200, pagesCached: 40 },
      },
    };
    await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));

    const res = await request(app).get('/v1/jobs?workplaceType=Remote&page=50');
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(res.headers['x-cache-reason']).toBe('page_not_cached');
  });

  describe('Single-flight & dbGuard', () => {
    it('deduplicates identical in-flight DB fallback queries', async () => {
      let callCount = 0;
      const slowQuery = () =>
        new Promise((resolve) => {
          callCount++;
          setTimeout(() => resolve('done'), 20);
        });

      const [res1, res2] = await Promise.all([
        singleFlight('test-key', slowQuery),
        singleFlight('test-key', slowQuery),
      ]);

      expect(res1).toBe('done');
      expect(res2).toBe('done');
      expect(callCount).toBe(1);
    });

    it('returns 503 with Retry-After: 5 when dbGuard queue is full', async () => {
      const guard = new DbGuard(1, 1); // max 1 active, 1 queue

      let resolve1: any;
      const p1 = guard.run(() => new Promise((resolve) => { resolve1 = resolve; }));

      // Slot 2: Queued
      let fn2Run = false;
      const p2 = guard.run(async () => { fn2Run = true; });

      // Slot 3: Overload! Should throw 503 immediately
      await expect(guard.run(async () => 'overload')).rejects.toMatchObject({
        status: 503,
        retryAfterSeconds: 5,
      });

      resolve1();
      await p1;
      await p2;
      expect(fn2Run).toBe(true);
    });
  });
});
