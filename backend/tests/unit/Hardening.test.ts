/**
 * @file Unit tests for API hardening, CORS, Cache-Control, and rate limiter removal (P2-T08)
 * @summary Validates CORS origin filtering, Cache-Control header propagation, and in-memory limiter removal
 * @tags Testing, Hardening, CORS, CacheControl, P2-T08
 */

import request from 'supertest';
import zlib from 'zlib';
import app from '../../src/api/Server';
import { readThroughService } from '../../src/api/cache/ReadThrough';
import { FakeRedis } from '../helpers/fakeRedis';
import { KEY_CURRENT, KEY_LAST_SCRAPE_AT, genKey } from '../../src/lib/cache/keys';
import { mockJob } from '../../__mocks__/@prisma/client';

describe('API Hardening and CDN Caching (P2-T08)', () => {
  let fakeRedis: FakeRedis;

  beforeEach(() => {
    fakeRedis = new FakeRedis();
    readThroughService.setRedisClient(fakeRedis);
    readThroughService.resetCaches();
    jest.clearAllMocks();
  });

  afterAll(() => {
    readThroughService.setRedisClient(null);
  });

  describe('CORS allow-list', () => {
    it('sets Access-Control-Allow-Origin for allowed origin', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'https://job-scrapper-ui.vercel.app');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://job-scrapper-ui.vercel.app');
    });

    it('sets Access-Control-Allow-Origin for localhost:3000', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('omits Access-Control-Allow-Origin for unlisted origin', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'https://malicious-site.com');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('exposes the required headers in CORS response', async () => {
      const res = await request(app)
        .get('/v1/jobs')
        .set('Origin', 'https://job-scrapper-ui.vercel.app');

      expect(res.headers['access-control-expose-headers']).toContain('X-Cache');
      expect(res.headers['access-control-expose-headers']).toContain('X-Cache-Reason');
      expect(res.headers['access-control-expose-headers']).toContain('X-Cache-Generation');
      expect(res.headers['access-control-expose-headers']).toContain('Retry-After');
    });
  });

  describe('Rate Limiter Removal', () => {
    it('allows 11 consecutive requests from one IP without 429', async () => {
      const ip = '10.250.1.1';
      for (let i = 0; i < 11; i++) {
        const res = await request(app)
          .get('/v1/jobs?page=1')
          .set('X-Forwarded-For', ip);
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('Cache-Control headers', () => {
    it('sets public 3600s s-maxage and Vercel-Cache-Tag for 200 list view', async () => {
      // Relative to now: the API marks cache data older than 36h as STALE (fixed dates expire).
      const builtAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const gen = 'g20261024T120000Z-cdn';
      await fakeRedis.set(KEY_CURRENT, gen);
      await fakeRedis.set(KEY_LAST_SCRAPE_AT, builtAt);
      const manifest = {
        schema: 1,
        gen,
        builtAt,
        scrapeFinishedAt: builtAt,
        views: { default: { total: 10, totalPages: 1, pagesCached: 1 } },
      };
      await fakeRedis.hset(genKey(gen), '__manifest', JSON.stringify(manifest));
      await fakeRedis.hset(
        genKey(gen),
        'jobs?page=1',
        zlib.gzipSync(Buffer.from(JSON.stringify({ data: [], page: 1, total: 0 })))
      );

      const res = await request(app)
        .get('/v1/jobs?page=1')
        .set('X-Forwarded-For', '10.250.1.2');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.headers['cache-control']).toBe(
        'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600, stale-if-error=86400'
      );
      expect(res.headers['vercel-cache-tag']).toBe('jobs-v1');
    });

    it('uses the long 3600s s-maxage and tag when Redis is not configured (BYPASS is the normal state)', async () => {
      readThroughService.setRedisClient(null); // No Redis -> BYPASS / not_configured
      const res = await request(app)
        .get('/v1/jobs?page=1')
        .set('X-Forwarded-For', '10.250.1.3');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('BYPASS');
      expect(res.headers['x-cache-reason']).toBe('not_configured');
      expect(res.headers['cache-control']).toBe(
        'public, max-age=60, s-maxage=3600, stale-while-revalidate=3600, stale-if-error=86400'
      );
      expect(res.headers['vercel-cache-tag']).toBe('jobs-v1');
    });

    it('keeps the short 60s s-maxage without a tag when a configured cache is degraded (BYPASS / no_generation)', async () => {
      // Redis is configured but holds no generation yet: the API falls back to the database and must recover fast
      const res = await request(app)
        .get('/v1/jobs?page=1')
        .set('X-Forwarded-For', '10.250.1.4');

      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('BYPASS');
      expect(res.headers['x-cache-reason']).toBe('no_generation');
      expect(res.headers['cache-control']).toBe('public, max-age=30, s-maxage=60, stale-while-revalidate=600');
      expect(res.headers['vercel-cache-tag']).toBeUndefined();
    });

    it('sets 3600s s-maxage and tag for 200 job detail view', async () => {
      mockJob.findFirst.mockResolvedValueOnce({
        id: 'e4b52cb5-3d8a-4d2a-89a1-cb9cf540192a',
        title: 'Backend Engineer',
        active: true,
        isListed: true,
      });

      const res = await request(app)
        .get('/v1/jobs/e4b52cb5-3d8a-4d2a-89a1-cb9cf540192a')
        .set('X-Forwarded-For', '10.250.1.4');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe(
        'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      );
      expect(res.headers['vercel-cache-tag']).toBe('jobs-v1');
    });

    it('sets public, s-maxage=300 on 404 job detail', async () => {
      mockJob.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/v1/jobs/e4b52cb5-3d8a-4d2a-89a1-cb9cf540192a')
        .set('X-Forwarded-For', '10.250.1.5');

      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('public, s-maxage=300');
    });

    it('sets no-store on /health', async () => {
      const res = await request(app)
        .get('/health')
        .set('X-Forwarded-For', '10.250.1.6');

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});
