/**
 * @file CLI Interface for Redis Cache Management
 * @summary Command line entry points for cache:publish, cache:status, and cache:purge-legacy
 * @tags CLI, Cache, Redis, Maintenance
 */

import { PrismaClient } from '@prisma/client';
import {
  publishCacheGeneration,
  runCacheStatus,
  runCachePurgeLegacy,
} from './Publisher';
import { getRedisClient } from '../lib/cache/RedisClient';

/**
 * @summary Parses CLI args and runs the requested cache command
 */
export async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'publish') {
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const prisma = new PrismaClient();
    const redis = getRedisClient('publisher');

    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const sha = process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'manual';
    const runId = `${timestamp}-publish-${sha.slice(0, 7)}`;

    console.log(`🚀 Starting cache publication (runId: ${runId}, dryRun: ${dryRun}, force: ${force})...`);

    try {
      const result = await publishCacheGeneration({
        runId,
        scrapeFinishedAt: new Date().toISOString(),
        prisma,
        redis,
        dryRun,
        force,
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      if (result.status === 'published' || result.status.startsWith('skipped')) {
        process.exit(0);
      } else {
        process.exit(2);
      }
    } catch (err: any) {
      console.error('❌ Cache publish error:', err.message);
      process.exit(2);
    } finally {
      await prisma.$disconnect().catch(() => {});
      if (redis?.quit) await redis.quit().catch(() => {});
    }
  } else if (command === 'status') {
    try {
      const output = await runCacheStatus();
      console.log(output);
      process.exit(0);
    } catch (err: any) {
      console.error('❌ Error getting cache status:', err.message);
      process.exit(1);
    }
  } else if (command === 'purge-legacy') {
    console.log('🧹 Purging legacy job:*:hash keys from Redis...');
    try {
      const count = await runCachePurgeLegacy();
      console.log(`✅ Successfully unlinked ${count} legacy keys.`);
      process.exit(0);
    } catch (err: any) {
      console.error('❌ Error purging legacy keys:', err.message);
      process.exit(1);
    }
  } else {
    console.error(`Unknown cache command: "${command}". Available commands: publish, status, purge-legacy.`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
