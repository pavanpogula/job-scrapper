/**
 * @file Unit tests for RedisClient factory
 * @summary Validates createRedis configuration for API and publisher roles (P2-T02)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRedis, getRedisClient, calculateRetryDelay } from '../../src/lib/cache/RedisClient';

describe('RedisClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createRedis({ role: "api" }) returns null when REDIS_URL is unset', () => {
    process.env.NODE_ENV = 'production';
    const client = createRedis({ role: 'api' });
    expect(client).toBeNull();
  });

  it('createRedis({ role: "publisher" }) returns null when REDIS_URL is unset', () => {
    process.env.NODE_ENV = 'production';
    const client = createRedis({ role: 'publisher' });
    expect(client).toBeNull();
  });

  it('creates an ioredis client with API configuration when REDIS_URL is set', () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const client = createRedis({ role: 'api' });
    expect(client).not.toBeNull();
    expect(client?.options.lazyConnect).toBe(true);
    expect(client?.options.enableOfflineQueue).toBe(false);
    expect(client?.options.maxRetriesPerRequest).toBe(0);
    expect(client?.options.commandTimeout).toBe(150);
    expect(client?.options.connectTimeout).toBe(1000);
    expect(client?.options.connectionName).toBe('api');
    client?.disconnect();
  });

  it('creates an ioredis client with publisher configuration when REDIS_URL is set', () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const client = createRedis({ role: 'publisher' });
    expect(client).not.toBeNull();
    expect(client?.options.lazyConnect).toBe(true);
    expect(client?.options.enableOfflineQueue).toBe(true);
    expect(client?.options.maxRetriesPerRequest).toBe(3);
    expect(client?.options.connectionName).toBe('publisher');
    client?.disconnect();
  });

  it('calculateRetryDelay implements linear backoff capped at 2000ms (resolving 09 #48)', () => {
    expect(calculateRetryDelay(1)).toBe(200);
    expect(calculateRetryDelay(2)).toBe(400);
    expect(calculateRetryDelay(5)).toBe(1000);
    expect(calculateRetryDelay(15)).toBe(2000);
  });

  it('reuses singleton instance via getRedisClient', () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const client1 = getRedisClient('api');
    const client2 = getRedisClient('api');
    expect(client1).toBe(client2);
    client1?.disconnect();
  });
});
