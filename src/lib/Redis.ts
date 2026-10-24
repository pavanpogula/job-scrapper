/**
 * @file Redis cache connection (thin compatibility wrapper)
 * @summary Compatibility shim delegating to RedisClient factory
 * @tags Cache, ioredis, Compatibility
 */

import { getRedisClient, createRedis } from './cache/RedisClient';

export const redis =
  getRedisClient('publisher') || createRedis({ role: 'publisher', url: 'redis://localhost:6379' })!;

export default redis;
