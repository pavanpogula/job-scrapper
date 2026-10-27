/**
 * @file Greenhouse Curated Board Seeding Utility
 * @summary Validates Greenhouse board tokens via GET /v1/boards/{token} and upserts Company rows with gh--<token> slugs and source GREENHOUSE
 * @tags Seed, Greenhouse, Setup, Company, BF-023, ADR-0021
 */

import { PrismaClient } from '@prisma/client';
import { CURATED_GREENHOUSE_BOARDS } from '../config/GreenhouseBoards';
import { AtsClient, BoardRef } from '../lib/ats/AtsClient';
import { GreenhouseClient } from '../lib/ats/GreenhouseClient';

const defaultPrisma = new PrismaClient();

export interface SeedGreenhouseResult {
  requested: number;
  seeded: number;
  skippedNotFound: number;
  failed: number;
}

const VALID_TOKEN_REGEX = /^[a-z0-9][a-z0-9_-]{0,98}$/;

/**
 * @summary Parses CLI arguments into a deduplicated list of lowercase Greenhouse tokens
 */
export function parseGreenhouseSeedTokens(args: string[]): string[] {
  const rawTokens: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--tokens=')) {
      rawTokens.push(...arg.slice('--tokens='.length).split(','));
    } else if (!arg.startsWith('--')) {
      rawTokens.push(...arg.split(','));
    }
  }

  const sourceList = rawTokens.length > 0 ? rawTokens : [...CURATED_GREENHOUSE_BOARDS];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of sourceList) {
    const token = item.trim().toLowerCase();
    if (!token) continue;
    if (!VALID_TOKEN_REGEX.test(token) || token.includes('--')) {
      console.warn(`⚠️ Skipping invalid Greenhouse token "${token}"`);
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result;
}

/**
 * @summary Validates each Greenhouse token with GET /v1/boards/{token} and upserts Company { slug: 'gh--' + token, source: GREENHOUSE, atsToken: token, name } by (source, atsToken)
 */
export async function seedGreenhouse(
  options: {
    tokens?: string[];
    client?: AtsClient;
    prismaClient?: PrismaClient;
  } = {}
): Promise<SeedGreenhouseResult> {
  const db = options.prismaClient ?? defaultPrisma;
  const client = options.client ?? new GreenhouseClient();
  const tokens =
    options.tokens && options.tokens.length > 0
      ? parseGreenhouseSeedTokens(options.tokens)
      : parseGreenhouseSeedTokens(process.argv.slice(2));

  console.log(`🌱 Validating and seeding ${tokens.length} Greenhouse board(s)...`);

  let seeded = 0;
  let skippedNotFound = 0;
  let failed = 0;

  for (const token of tokens) {
    const slug = `gh--${token}`;
    const ref: BoardRef = {
      slug,
      source: 'greenhouse',
      atsToken: token,
    };

    try {
      const meta = await client.fetchCompanyMetadata(ref);
      if (meta.status === 'not_found') {
        skippedNotFound++;
        console.warn(`  ⚠️ [404] Board "${token}" not found on Greenhouse; skipping`);
        continue;
      }
      if (meta.status !== 'ok') {
        failed++;
        console.warn(`  ⚠️ [${meta.status}] Could not verify board "${token}"; skipping`);
        continue;
      }

      const displayName = meta.name || token;
      await db.company.upsert({
        where: {
          source_atsToken: {
            source: 'GREENHOUSE',
            atsToken: token,
          },
        },
        create: {
          slug,
          source: 'GREENHOUSE',
          atsToken: token,
          name: displayName,
          status: 'ACTIVE',
        },
        update: {
          name: displayName,
          status: 'ACTIVE',
          consecutiveNotFound: 0,
        },
      });

      seeded++;
      console.log(`  ✅ Upserted ${slug} (${displayName})`);
    } catch (err: unknown) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed to seed ${slug}: ${message}`);
    }
  }

  console.log(
    `✅ Greenhouse seed complete: ${seeded} seeded, ${skippedNotFound} not found, ${failed} failed.`
  );

  return {
    requested: tokens.length,
    seeded,
    skippedNotFound,
    failed,
  };
}

if (require.main === module) {
  seedGreenhouse()
    .catch((err: unknown) => {
      console.error('❌ Greenhouse seed error:', err);
      process.exitCode = 1;
    })
    .finally(() => defaultPrisma.$disconnect());
}
