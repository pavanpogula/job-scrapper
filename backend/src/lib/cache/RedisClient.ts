/**
 * @file Redis client factory and connection manager
 * @summary Configures role-based ioredis instances for API and publisher with adaptive retries
 * @tags cache, redis, client, connection
 */

import Redis, { RedisOptions } from 'ioredis';

export type RedisRole = 'api' | 'publisher';

export interface CreateRedisOptions {
  role: RedisRole;
  url?: string;
}

/**
 * Calculates retry delay with linear backoff capped at 2000ms.
 * Resolves issue #48 from documentation/09-known-issues-and-tech-debt.md.
 * @param times Attempt counter
 */
export function calculateRetryDelay(times: number): number {
  return Math.min(times * 200, 2000);
}

/**
 * Creates an ioredis client configured for the given role, or returns null if unconfigured.
 * @param options Client configuration options
 */
export function createRedis(options: CreateRedisOptions): Redis | null {
  const envUrl = process.env.REDIS_URL;
  let url = options.url || envUrl;

  if (!url) {
    if (process.env.NODE_ENV === 'development') {
      url = 'redis://localhost:6379';
    } else {
      return null;
    }
  }

  const isApi = options.role === 'api';

  const baseOptions: RedisOptions = {
    lazyConnect: true,
    retryStrategy: calculateRetryDelay,
    connectionName: options.role,
  };

  if (isApi) {
    return new Redis(url, {
      ...baseOptions,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 150,
      connectTimeout: 1000,
      enableReadyCheck: false,
      keepAlive: 10000,
    });
  }

  // Publisher options
  return new Redis(url, {
    ...baseOptions,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 3,
    commandTimeout: 10000,
    connectTimeout: 5000,
  });
}

const singletons: Partial<Record<RedisRole, Redis | null>> = {};

/**
 * Returns or initializes a shared singleton Redis client for the specified role.
 * @param role Client role ('api' or 'publisher')
 */
export function getRedisClient(role: RedisRole): Redis | null {
  if (singletons[role] === undefined) {
    singletons[role] = createRedis({ role });
  }
  return singletons[role] ?? null;
}
