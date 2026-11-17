/**
 * @file ATS Company Slug Allocator
 * @summary Allocates collision-free unique company slugs while preserving existing (source, atsToken) slugs
 * @tags ATS, Slug, Allocation, Collision, Database, ADR-0022
 */

import type { PrismaClient } from '@prisma/client';
import { AtsSource, companySlug, toDbAts } from './source';

/**
 * @summary Allocates a globally unique Company.slug for a (source, atsToken) pair, reusing any existing slug or appending -2, -3... on collision
 */
export async function allocateCompanySlug(
  db: Pick<PrismaClient, 'company'>,
  source: AtsSource,
  token: string
): Promise<string> {
  const dbSource = toDbAts(source);
  const existing = await db.company.findUnique({
    where: {
      source_atsToken: {
        source: dbSource,
        atsToken: token,
      },
    },
    select: { slug: true },
  });

  if (existing) {
    return existing.slug;
  }

  const baseSlug = companySlug(source, token);
  for (let suffix = 1; ; suffix++) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const owner = await db.company.findUnique({
      where: { slug: candidate },
      select: { source: true, atsToken: true },
    });

    if (!owner || (owner.source === dbSource && owner.atsToken === token)) {
      return candidate;
    }
  }
}
