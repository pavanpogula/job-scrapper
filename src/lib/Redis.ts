/**
 * @file Redis cache connection
 * @summary Provides Redis client for caching job content hashes. Enables change detection to avoid redundant DB writes.
 * @tags Cache, ioredis, Change Detection, Performance
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis connection URL
 * 
 * - Reads from REDIS_URL environment variable
 * - Falls back to localhost:6379 for local development
 * - Format: redis://[user:password@]host:port[/db]
 * 
 * @example
 * // Production (Upstash, Redis Cloud, etc.)
 * REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
 * 
 * // Local development
 * REDIS_URL=redis://localhost:6379
 */
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Redis client instance
 * 
 * Used by the scraper to cache job content hashes for change detection.
 * This avoids unnecessary database writes when job data hasn't changed.
 * 
 * @example
 * // Store a job hash with 7-day TTL
 * await redis.set(`job:${jobId}:hash`, contentHash, 'EX', 60 * 60 * 24 * 7);
 * 
 * // Check if job has changed
 * const cachedHash = await redis.get(`job:${jobId}:hash`);
 * if (cachedHash === newHash) {
 *   // Skip DB write - job unchanged
 * }
 * 
 * @configuration
 * - lazyConnect: true - Doesn't connect until first command (fail-safe)
 * - retryStrategy: Tries 3 times, then gives up (graceful degradation)
 * 
 * @behavior
 * - If Redis is unavailable, scraper continues without caching
 * - All jobs get written to DB (no optimization, but still works)
 */
export const redis = new Redis(redisUrl, {
    // Don't connect immediately - wait until first command
    // This allows the scraper to start even if Redis isn't available
    lazyConnect: true,

    /**
     * Retry strategy for connection failures
     * 
     * @param times - Number of retry attempts so far
     * @returns Delay in ms before next retry, or null to stop retrying
     */
    retryStrategy(times) {
        if (times > 3) {
            console.warn('Redis connection failed. Disabling cache for this run.');
            return null; // Stop retrying - scraper will work without cache
        }
        // Exponential backoff: 50ms, 100ms, 150ms (max 2000ms)
        return Math.min(times * 50, 2000);
    },
});

/**
 * Error handler for Redis connection
 * 
 * Suppresses ECONNREFUSED errors (Redis not running) to avoid
 * spamming the console during local development without Redis.
 * Other errors are logged for debugging.
 */
redis.on('error', (err) => {
    if ((err as any).code === 'ECONNREFUSED') {
        // Silent - Redis not running, cache disabled
        // Scraper will continue without caching
    } else {
        // Log unexpected errors for debugging
        console.error('Redis Error:', err);
    }
});
