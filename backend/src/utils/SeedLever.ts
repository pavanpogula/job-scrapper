/**
 * @file Lever Curated Board Seeding Utility
 * @summary Validates Lever board tokens via Postings API and hosted board page, allocates unique lv--<sanitized> slugs, and upserts Company rows with source LEVER
 * @tags Seed, Lever, Setup, Company, BF-024, ADR-0022
 */

import { PrismaClient } from '@prisma/client';
import { CURATED_LEVER_BOARDS } from '../config/LeverBoards';
import { BoardRef } from '../lib/ats/AtsClient';
import { LeverClient } from '../lib/ats/LeverClient';
import { allocateCompanySlug } from '../lib/ats/slug';

const defaultPrisma = new PrismaClient();

export const LEVER_TOKEN_REGEX = /^[A-Za-z0-9][A-Za-z0-9._&-]{0,79}$/;

export interface SeedLeverResult {
  requested: number;
  seeded: number;
  skippedInvalid: number;
  skippedNotLive: number;
  failed: number;
}

/**
 * @summary Parses CLI arguments into a deduplicated list of case-preserving Lever board tokens
 */
export function parseLeverSeedTokens(args: string[]): { tokens: string[]; invalidCount: number } {
  const rawTokens: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--tokens=')) {
      rawTokens.push(...arg.slice('--tokens='.length).split(','));
    } else if (!arg.startsWith('--')) {
      rawTokens.push(...arg.split(','));
    }
  }

  const sourceList = rawTokens.length > 0 ? rawTokens : [...CURATED_LEVER_BOARDS];
  const seen = new Set<string>();
  const tokens: string[] = [];
  let invalidCount = 0;

  for (const item of sourceList) {
    const token = item.trim();
    if (!token) continue;
    if (!LEVER_TOKEN_REGEX.test(token)) {
      invalidCount++;
      console.warn(`⚠️ Skipping invalid Lever token "${token}"`);
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }

  return { tokens, invalidCount };
}

/**
 * @summary Validates each Lever token via validateSite ('live' only) and upserts Company { slug, source: LEVER, atsToken: token, name } by (source, atsToken)
 */
export async function seedLever(
  options: {
    tokens?: string[];
    client?: LeverClient;
    prismaClient?: PrismaClient;
  } = {}
): Promise<SeedLeverResult> {
  const db = options.prismaClient ?? defaultPrisma;
  const client = options.client ?? new LeverClient();
  const parsed =
    options.tokens && options.tokens.length > 0
      ? parseLeverSeedTokens(options.tokens)
      : parseLeverSeedTokens(process.argv.slice(2));
  const { tokens, invalidCount } = parsed;

  console.log(`🌱 Validating and seeding ${tokens.length} Lever board(s)...`);

  let seeded = 0;
  let skippedNotLive = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      const siteStatus = await client.validateSite(token);
      if (siteStatus !== 'live') {
        if (siteStatus === 'error') {
          failed++;
        } else {
          skippedNotLive++;
        }
        console.warn(`  ⚠️ [${siteStatus}] Board "${token}" is not live on Lever; skipping`);
        continue;
      }

      const slug = await allocateCompanySlug(db, 'lever', token);
      const ref: BoardRef = {
        slug,
        source: 'lever',
        atsToken: token,
      };

      const meta = await client.fetchCompanyMetadata(ref, { includeLogo: true });
      const displayName = (meta.status === 'ok' && meta.name) ? meta.name : token;
      const logoUrl = meta.status === 'ok' ? meta.logoUrl : undefined;

      await db.company.upsert({
        where: {
          source_atsToken: {
            source: 'LEVER',
            atsToken: token,
          },
        },
        create: {
          slug,
          source: 'LEVER',
          atsToken: token,
          name: displayName,
          ...(logoUrl ? { logoUrl } : {}),
          status: 'ACTIVE',
        },
        update: {
          name: displayName,
          ...(logoUrl ? { logoUrl } : {}),
          status: 'ACTIVE',
          consecutiveNotFound: 0,
        },
      });

      seeded++;
      console.log(`  ✅ Upserted ${slug} (${displayName})`);
    } catch (err: unknown) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed to seed Lever token "${token}": ${message}`);
    }
  }

  console.log(
    `✅ Lever seed complete: ${seeded} seeded, ${skippedNotLive} skipped (not live), ${invalidCount} invalid, ${failed} failed.`
  );

  return {
    requested: tokens.length + invalidCount,
    seeded,
    skippedInvalid: invalidCount,
    skippedNotLive,
    failed,
  };
}

if (require.main === module) {
  seedLever()
    .catch((err: unknown) => {
      console.error('❌ Lever seed error:', err);
      process.exitCode = 1;
    })
    .finally(() => defaultPrisma.$disconnect());
}
