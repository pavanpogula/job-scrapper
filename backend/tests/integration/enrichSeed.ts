/**
 * @file Enrichment Integration Test Seed Helper
 * @summary Shared seed helper for EnrichPass integration tests and localhost-only local rehearsal CLI
 * @tags integration, enrichment, seed, test-helper, BF-027
 */

import { Prisma, PrismaClient } from '@prisma/client';

export const ENRICH_SEED_COMPANY_SLUG = 'enrich-acme';

export interface SeedJobOverrides {
  active?: boolean;
  title?: string;
  contentHash?: string;
  attrsVersion?: number | null;
  attrsDescHash?: string | null;
  attrsConfidence?: string | null;
  attrsModelVersion?: number | null;
  lastUpdatedAt?: Date | null;
  lastUpdatedSource?: string | null;
  metadata?: Prisma.InputJsonValue;
}

const SAMPLE_DESCRIPTIONS = [
  'Requirements\n5+ years of software engineering experience\nActive Secret clearance',
  'Preferred qualifications\n3+ years of experience with Kubernetes',
  'Minimum 2 years of experience building backend services in TypeScript.',
  'We build developer tools and distributed data platforms.',
] as const;

/**
 * @summary Ensures the shared test company exists once before seeding enrichment test jobs
 */
async function ensureSeedCompany(prisma: PrismaClient): Promise<void> {
  await prisma.company.createMany({
    data: [
      {
        slug: ENRICH_SEED_COMPANY_SLUG,
        name: 'Enrich Acme',
        source: 'ASHBY',
        atsToken: ENRICH_SEED_COMPANY_SLUG,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * @summary Seeds a single synthetic Job row for enrichment integration tests
 */
export async function seedEnrichJob(
  prisma: PrismaClient,
  id: string,
  overrides: SeedJobOverrides = {}
): Promise<void> {
  await ensureSeedCompany(prisma);
  const metadata: Prisma.InputJsonValue = overrides.metadata ?? {
    descriptionPlain: '5+ years of experience',
    descriptionHtml: '<p>x</p>',
    other: 'x'.repeat(5000),
  };

  await prisma.job.create({
    data: {
      id,
      ashbyId: id,
      source: 'ASHBY',
      externalId: id,
      title: overrides.title ?? `Software Engineer (${id})`,
      applyUrl: `https://jobs.ashbyhq.com/${ENRICH_SEED_COMPANY_SLUG}/${id}`,
      companySlug: ENRICH_SEED_COMPANY_SLUG,
      metadata,
      contentHash: overrides.contentHash ?? 'h',
      active: overrides.active ?? true,
      attrsVersion: overrides.attrsVersion ?? null,
      attrsDescHash: overrides.attrsDescHash ?? null,
      attrsConfidence: overrides.attrsConfidence ?? null,
      attrsModelVersion: overrides.attrsModelVersion ?? null,
      lastUpdatedAt: overrides.lastUpdatedAt ?? null,
      lastUpdatedSource: overrides.lastUpdatedSource ?? null,
    },
  });
}

/**
 * @summary Bulk-seeds n active unprocessed jobs with realistic varied descriptions for tests and rehearsal
 */
export async function seedEnrichJobs(prisma: PrismaClient, n: number): Promise<number> {
  await ensureSeedCompany(prisma);
  const batchSize = 500;
  let inserted = 0;

  for (let offset = 0; offset < n; offset += batchSize) {
    const count = Math.min(batchSize, n - offset);
    const data = Array.from({ length: count }, (_, idx) => {
      const seq = offset + idx + 1;
      const id = `enr-${String(seq).padStart(5, '0')}`;
      const desc = SAMPLE_DESCRIPTIONS[(seq - 1) % SAMPLE_DESCRIPTIONS.length];
      return {
        id,
        ashbyId: id,
        source: 'ASHBY' as const,
        externalId: id,
        title: `Software Engineer ${seq}`,
        applyUrl: `https://jobs.ashbyhq.com/${ENRICH_SEED_COMPANY_SLUG}/${id}`,
        companySlug: ENRICH_SEED_COMPANY_SLUG,
        metadata: {
          descriptionPlain: desc,
          descriptionHtml: `<p>${desc.replace(/\n/g, '</p><p>')}</p>`,
          other: 'x'.repeat(512),
        },
        contentHash: `hash-${seq}`,
        active: true,
      };
    });

    const res = await prisma.job.createMany({ data, skipDuplicates: true });
    inserted += res.count;
  }

  return inserted;
}

/**
 * @summary Asserts that DATABASE_URL is explicitly set and targets localhost or 127.0.0.1
 */
function assertLocalDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error('DATABASE_URL must be exported explicitly before running enrichSeed');
  }
  const parsed = new URL(raw);
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`Refusing non-local DATABASE_URL host: ${parsed.hostname}`);
  }
  return raw;
}

if (require.main === module) {
  (async () => {
    assertLocalDatabaseUrl();
    const nArg = Number.parseInt(process.argv[2] ?? '1000', 10);
    if (!Number.isInteger(nArg) || nArg < 1) {
      throw new Error(`Invalid job count "${process.argv[2] ?? ''}"`);
    }
    const prisma = new PrismaClient();
    try {
      const inserted = await seedEnrichJobs(prisma, nArg);
      console.log(`✅ Seeded ${inserted} enrichment jobs (requested ${nArg}).`);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ enrichSeed failed: ${msg}`);
    process.exit(1);
  });
}
