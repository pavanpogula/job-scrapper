/**
 * @file API Cache Read-Through Engine
 * @summary High-performance read-through layer querying Upstash Redis with in-memory LRU, circuit breaker, and automatic PostgreSQL fallback
 * @tags Cache, ReadThrough, Redis, Resilience, API
 */

import zlib from 'zlib';
import { Response } from 'express';
import { CircuitBreaker } from './Breaker';
import { getRedisClient } from '../../lib/cache/RedisClient';
import {
  KEY_CURRENT,
  KEY_LAST_SCRAPE_AT,
  genKey,
  detailsShardKey,
} from '../../lib/cache/keys';
import { dbGuard, singleFlight } from '../middleware/dbGuard';

interface LruEntry {
  data: any;
  expiresAt: number;
}

interface PointerCache {
  gen: string | null;
  lastScrapeAt: string | null;
  expiresAt: number;
}

/**
 * Service managing cache read-through, in-memory LRU, and database fallbacks.
 */
export class ReadThroughService {
  private breaker: CircuitBreaker;
  private lru = new Map<string, LruEntry>();
  private pointerCache: PointerCache | null = null;
  private manifestCache = new Map<string, any>();
  private customRedisClient: any = null;

  constructor(breaker?: CircuitBreaker) {
    this.breaker = breaker || new CircuitBreaker();
  }

  /**
   * Returns the underlying circuit breaker instance.
   */
  public getCircuitBreaker(): CircuitBreaker {
    return this.breaker;
  }

  /**
   * Injects a custom Redis client for testing.
   */
  public setRedisClient(client: any): void {
    this.customRedisClient = client;
  }

  /**
   * Resets in-process caches and circuit breaker state.
   */
  public resetCaches(): void {
    this.lru.clear();
    this.pointerCache = null;
    this.manifestCache.clear();
    this.breaker.reset();
  }

  /**
   * Resolves the active Redis client.
   */
  private getClient(): any {
    if (this.customRedisClient) return this.customRedisClient;
    return getRedisClient('api');
  }

  /**
   * Fetches current generation ID and last scrape timestamp with 300s TTL.
   */
  private async getPointer(): Promise<{ gen: string | null; lastScrapeAt: string | null }> {
    const now = Date.now();
    if (this.pointerCache && this.pointerCache.expiresAt > now) {
      return {
        gen: this.pointerCache.gen,
        lastScrapeAt: this.pointerCache.lastScrapeAt,
      };
    }

    const redis = this.getClient();
    if (!redis) {
      return { gen: null, lastScrapeAt: null };
    }

    try {
      const [gen, lastScrapeAt] = await Promise.all([
        redis.get(KEY_CURRENT),
        redis.get(KEY_LAST_SCRAPE_AT),
      ]);

      const ttlMs = gen ? 300000 : 60000; // 300s TTL if found, 60s if no generation
      this.pointerCache = {
        gen: gen || null,
        lastScrapeAt: lastScrapeAt || null,
        expiresAt: now + ttlMs,
      };

      return { gen: gen || null, lastScrapeAt: lastScrapeAt || null };
    } catch (err: any) {
      this.breaker.recordFailure(err);
      return { gen: null, lastScrapeAt: null };
    }
  }

  /**
   * Fetches generation manifest from Redis or in-process cache.
   */
  private async getManifest(gen: string): Promise<any | null> {
    if (this.manifestCache.has(gen)) {
      return this.manifestCache.get(gen);
    }

    const redis = this.getClient();
    if (!redis) return null;

    try {
      const raw = await redis.hget(genKey(gen), '__manifest');
      if (!raw) return null;
      const manifest = JSON.parse(raw);
      this.manifestCache.set(gen, manifest);
      return manifest;
    } catch (err: any) {
      this.breaker.recordFailure(err);
      return null;
    }
  }

  /**
   * @summary Serves a list, facets, companies, or meta query through cache or DB fallback
   */
  public async serveView(
    key: string,
    isCacheable: boolean,
    res: Response,
    fetchDb: () => Promise<any>,
    viewContext?: { viewName?: string; page?: number; totalItems?: number }
  ): Promise<any> {

    // 1. Uncacheable views bypass cache directly
    if (!isCacheable) {
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Reason', 'view_not_cached');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    const redis = this.getClient();
    if (!redis) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'not_configured');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    if (this.breaker.isBudgetExhausted()) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'budget_exhausted');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    if (!this.breaker.canAttempt()) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'circuit_open');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    // 2. Fetch generation pointer
    const { gen, lastScrapeAt } = await this.getPointer();
    if (!gen) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'no_generation');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    res.setHeader('X-Cache-Generation', gen);
    if (lastScrapeAt) {
      res.setHeader('X-Data-Updated-At', lastScrapeAt);
    }

    // 3. Look up Manifest
    const manifest = await this.getManifest(gen);
    if (!manifest) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'missing_generation');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    if (manifest.scrapeFinishedAt) {
      res.setHeader('X-Data-Updated-At', manifest.scrapeFinishedAt);
    }

    // 4. Check View Limits in Manifest
    const requestedPage = viewContext?.page ?? 1;

    // Default or single-filter jobs view checks
    if (key.startsWith('jobs')) {
      const viewKey = viewContext?.viewName || (key.includes('page=') && !key.includes('&') ? 'default' : null);
      const viewManifest = viewKey ? manifest.views?.[viewKey] : null;

      if (viewKey && !viewManifest) {
        // Filter not in manifest
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Reason', 'view_not_cached');
        const startDb = Date.now();
        const result = await dbGuard.run(() => singleFlight(key, fetchDb));
        const dbDur = Date.now() - startDb;
        res.setHeader('Server-Timing', `db;dur=${dbDur}`);
        return result;
      }

      if (viewManifest) {
        if (requestedPage > viewManifest.totalPages) {
          // Page beyond totalPages returns synthetic empty page HIT
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('Server-Timing', `redis;dur=0`);
          return {
            data: [],
            meta: {
              page: requestedPage,
              pageSize: 25,
              total: viewManifest.total,
              totalPages: viewManifest.totalPages,
              hasNext: false,
              hasPrev: requestedPage > 1,
            },
          };
        }

        if (requestedPage > viewManifest.pagesCached) {
          // Beyond cached pages
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('X-Cache-Reason', 'page_not_cached');
          const startDb = Date.now();
          const result = await dbGuard.run(() => singleFlight(key, fetchDb));
          const dbDur = Date.now() - startDb;
          res.setHeader('Server-Timing', `db;dur=${dbDur}`);
          return result;
        }
      }
    } else if (key.startsWith('companies')) {
      if (manifest.companies) {
        if (requestedPage > manifest.companies.totalPages) {
          res.setHeader('X-Cache', 'HIT');
          res.setHeader('Server-Timing', `redis;dur=0`);
          return {
            data: [],
            total: manifest.companies.total,
            page: requestedPage,
            pageSize: 30,
            totalPages: manifest.companies.totalPages,
          };
        }

        if (requestedPage > manifest.companies.pagesCached) {
          res.setHeader('X-Cache', 'MISS');
          res.setHeader('X-Cache-Reason', 'page_not_cached');
          const startDb = Date.now();
          const result = await dbGuard.run(() => singleFlight(key, fetchDb));
          const dbDur = Date.now() - startDb;
          res.setHeader('Server-Timing', `db;dur=${dbDur}`);
          return result;
        }
      }
    }

    // 5. In-process LRU Check
    const lruKey = `${gen}:${key}`;
    const lruCached = this.lru.get(lruKey);
    if (lruCached && lruCached.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Server-Timing', `redis;dur=0`);
      return lruCached.data;
    }

    // 6. Redis HGET
    const redisStart = Date.now();
    let rawBuffer: Buffer | null = null;

    try {
      if (typeof redis.hgetBuffer === 'function') {
        rawBuffer = await redis.hgetBuffer(genKey(gen), key);
      } else {
        const val = await redis.hget(genKey(gen), key);
        rawBuffer = val ? Buffer.isBuffer(val) ? val : Buffer.from(val, 'utf8') : null;
      }
      this.breaker.recordSuccess();
    } catch (err: any) {
      this.breaker.recordFailure(err);
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', err.message?.includes('timeout') ? 'timeout' : 'redis_error');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `db;dur=${dbDur}`);
      return result;
    }

    const redisDur = Date.now() - redisStart;

    if (!rawBuffer) {
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Reason', 'field_missing');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(key, fetchDb));
      const dbDur = Date.now() - startDb;
      res.setHeader('Server-Timing', `redis;dur=${redisDur}, db;dur=${dbDur}`);
      return result;
    }

    // Gunzip and decode
    let parsed: any;
    try {
      const gunzipped = zlib.gunzipSync(rawBuffer).toString('utf8');
      parsed = JSON.parse(gunzipped);
    } catch {
      // If buffer is plain text or gunzip fails
      parsed = JSON.parse(rawBuffer.toString('utf8'));
    }

    // Check Staleness
    const builtAtMs = manifest.builtAt ? new Date(manifest.builtAt).getTime() : 0;
    const isStaleByAge = builtAtMs > 0 && Date.now() - builtAtMs > 36 * 3600 * 1000; // 36 hours
    const scrapeFinishedAtMs = manifest.scrapeFinishedAt ? new Date(manifest.scrapeFinishedAt).getTime() : 0;
    const lastScrapeAtMs = lastScrapeAt ? new Date(lastScrapeAt).getTime() : 0;
    const isStaleByScrape =
      scrapeFinishedAtMs > 0 &&
      lastScrapeAtMs > 0 &&
      lastScrapeAtMs - scrapeFinishedAtMs > 5 * 60 * 1000; // 5 min

    const cacheHeader = isStaleByAge || isStaleByScrape ? 'STALE' : 'HIT';
    res.setHeader('X-Cache', cacheHeader);
    res.setHeader('Server-Timing', `redis;dur=${redisDur}`);

    // Store in LRU
    if (this.lru.size >= 200) {
      const oldestKey = this.lru.keys().next().value;
      if (oldestKey) this.lru.delete(oldestKey);
    }
    this.lru.set(lruKey, {
      data: parsed,
      expiresAt: Date.now() + 30000, // 30s TTL
    });

    return parsed;
  }

  /**
   * @summary Serves a job detail query through shard hash, negative 404 LRU, or DB fallback
   */
  public async serveDetail(
    id: string,
    res: Response,
    fetchDb: () => Promise<any>
  ): Promise<any> {
    const notFoundKey = `detail_404:${id}`;
    const cached404 = this.lru.get(notFoundKey);
    if (cached404 && cached404.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Server-Timing', 'redis;dur=0');
      return null;
    }

    const lruDetailKey = `detail:${id}`;
    const cachedDetail = this.lru.get(lruDetailKey);
    if (cachedDetail && cachedDetail.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Server-Timing', 'redis;dur=0');
      return cachedDetail.data;
    }

    const redis = this.getClient();
    if (!redis) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'not_configured');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(`detail:${id}`, fetchDb));
      res.setHeader('Server-Timing', `db;dur=${Date.now() - startDb}`);
      if (!result) {
        this.lru.set(notFoundKey, {
          data: null,
          expiresAt: Date.now() + 600000,
        });
      }
      return result;
    }

    if (this.breaker.isBudgetExhausted()) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'budget_exhausted');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(`detail:${id}`, fetchDb));
      res.setHeader('Server-Timing', `db;dur=${Date.now() - startDb}`);
      if (!result) {
        this.lru.set(notFoundKey, {
          data: null,
          expiresAt: Date.now() + 600000,
        });
      }
      return result;
    }

    if (!this.breaker.canAttempt()) {
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'circuit_open');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(`detail:${id}`, fetchDb));
      res.setHeader('Server-Timing', `db;dur=${Date.now() - startDb}`);
      if (!result) {
        this.lru.set(notFoundKey, {
          data: null,
          expiresAt: Date.now() + 600000,
        });
      }
      return result;
    }

    const { gen, lastScrapeAt } = await this.getPointer();
    if (gen) res.setHeader('X-Cache-Generation', gen);
    if (lastScrapeAt) res.setHeader('X-Data-Updated-At', lastScrapeAt);

    const shardKey = detailsShardKey(id);
    const startRedis = Date.now();
    let rawBuffer: Buffer | null = null;

    try {
      if (typeof redis.hgetBuffer === 'function') {
        rawBuffer = await redis.hgetBuffer(shardKey, id);
      } else {
        const val = await redis.hget(shardKey, id);
        rawBuffer = val ? Buffer.isBuffer(val) ? val : Buffer.from(val, 'utf8') : null;
      }
      this.breaker.recordSuccess();
    } catch (err: any) {
      this.breaker.recordFailure(err);
      res.setHeader('X-Cache', 'BYPASS');
      res.setHeader('X-Cache-Reason', 'redis_error');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(`detail:${id}`, fetchDb));
      res.setHeader('Server-Timing', `db;dur=${Date.now() - startDb}`);
      if (!result) {
        this.lru.set(notFoundKey, {
          data: null,
          expiresAt: Date.now() + 600000,
        });
      }
      return result;
    }

    const redisDur = Date.now() - startRedis;

    if (!rawBuffer) {
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Reason', 'field_missing');
      const startDb = Date.now();
      const result = await dbGuard.run(() => singleFlight(`detail:${id}`, fetchDb));
      res.setHeader('Server-Timing', `redis;dur=${redisDur}, db;dur=${Date.now() - startDb}`);
      if (!result) {
        this.lru.set(notFoundKey, {
          data: null,
          expiresAt: Date.now() + 600000, // 10 min negative cache
        });
      } else {
        this.lru.set(lruDetailKey, {
          data: result,
          expiresAt: Date.now() + 30000,
        });
      }
      return result;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(zlib.gunzipSync(rawBuffer).toString('utf8'));
    } catch {
      parsed = JSON.parse(rawBuffer.toString('utf8'));
    }

    const detailData = parsed.data || parsed;
    this.lru.set(lruDetailKey, {
      data: detailData,
      expiresAt: Date.now() + 30000,
    });

    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Server-Timing', `redis;dur=${redisDur}`);
    return detailData;
  }
}

export const readThroughService = new ReadThroughService();
