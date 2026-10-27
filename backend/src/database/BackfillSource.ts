/**
 * @file Multi-source ATS column backfill and index creation
 * @summary Backfills externalId and atsToken for legacy ASHBY records, validates invariants, and creates unique indexes
 * @tags Database, Backfill, Multi-source, ATS, Migration, ADR-0021
 */

import { PrismaClient } from '@prisma/client';

export interface BackfillResult {
  totalJobsUpdated: number;
  totalCompaniesUpdated: number;
  remainingNullJobs: number;
  remainingNullCompanies: number;
  indexNames: string[];
}

interface CountResult {
  count: number;
}

interface IndexResult {
  indexname: string;
}

const BATCH_SIZE = 5000;

/**
 * @summary Idempotently backfills multi-source columns for Ashby rows, validates uniqueness, and creates unique indexes
 */
export async function backfillSource(client?: PrismaClient): Promise<BackfillResult> {
  const prisma = client ?? new PrismaClient();
  const shouldDisconnect = !client;

  try {
    console.log('🔄 Starting multi-source column backfill...');

    // 1. Batched UPDATE for Job.externalId
    let totalJobsUpdated = 0;
    let continueJobs = true;
    while (continueJobs) {
      const updatedCount = await prisma.$executeRawUnsafe(
        `UPDATE "Job" SET "externalId" = "ashbyId" WHERE id IN (SELECT id FROM "Job" WHERE "externalId" IS NULL AND source = 'ASHBY' LIMIT ${BATCH_SIZE})`
      );
      totalJobsUpdated += updatedCount;
      if (updatedCount === 0) {
        continueJobs = false;
      }
    }

    // 2. Batched UPDATE for Company.atsToken
    let totalCompaniesUpdated = 0;
    let continueCompanies = true;
    while (continueCompanies) {
      const updatedCount = await prisma.$executeRawUnsafe(
        `UPDATE "Company" SET "atsToken" = slug WHERE id IN (SELECT id FROM "Company" WHERE "atsToken" IS NULL AND source = 'ASHBY' LIMIT ${BATCH_SIZE})`
      );
      totalCompaniesUpdated += updatedCount;
      if (updatedCount === 0) {
        continueCompanies = false;
      }
    }

    // 3. Validation checks before creating unique indexes
    const doubleHyphenRows = await prisma.$queryRawUnsafe<CountResult[]>(
      `SELECT count(*)::int AS count FROM "Company" WHERE source = 'ASHBY' AND slug LIKE '%--%'`
    );
    const doubleHyphenCount = doubleHyphenRows[0]?.count ?? 0;

    const duplicateJobRows = await prisma.$queryRawUnsafe<CountResult[]>(
      `SELECT count(*)::int AS count FROM (SELECT source, "externalId" FROM "Job" WHERE "externalId" IS NOT NULL GROUP BY source, "externalId" HAVING count(*) > 1) t`
    );
    const duplicateJobsCount = duplicateJobRows[0]?.count ?? 0;

    const duplicateCompanyRows = await prisma.$queryRawUnsafe<CountResult[]>(
      `SELECT count(*)::int AS count FROM (SELECT source, "atsToken" FROM "Company" WHERE "atsToken" IS NOT NULL GROUP BY source, "atsToken" HAVING count(*) > 1) t`
    );
    const duplicateCompaniesCount = duplicateCompanyRows[0]?.count ?? 0;

    const hasValidationErrors =
      doubleHyphenCount > 0 || duplicateJobsCount > 0 || duplicateCompaniesCount > 0;

    if (hasValidationErrors) {
      console.error('❌ Validation failed before creating unique indexes:');
      if (doubleHyphenCount > 0) {
        console.error(`  - Found ${doubleHyphenCount} ASHBY companies with double-hyphen ('--') slugs.`);
      }
      if (duplicateJobsCount > 0) {
        console.error(`  - Found ${duplicateJobsCount} duplicate (source, externalId) job groups.`);
      }
      if (duplicateCompaniesCount > 0) {
        console.error(`  - Found ${duplicateCompaniesCount} duplicate (source, atsToken) company groups.`);
      }

      const errMsg = `Backfill validation failed: doubleHyphen=${doubleHyphenCount}, dupJobs=${duplicateJobsCount}, dupCompanies=${duplicateCompaniesCount}`;
      if (require.main === module) {
        process.exit(1);
      }
      throw new Error(errMsg);
    }

    // 4. Create unique indexes outside any transaction
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Job_source_externalId_key" ON "Job"(source, "externalId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Company_source_atsToken_key" ON "Company"(source, "atsToken")`
    );

    // 5. Verification queries
    const nullJobRows = await prisma.$queryRawUnsafe<CountResult[]>(
      `SELECT count(*)::int AS count FROM "Job" WHERE "externalId" IS NULL AND source = 'ASHBY'`
    );
    const remainingNullJobs = nullJobRows[0]?.count ?? 0;

    const nullCompanyRows = await prisma.$queryRawUnsafe<CountResult[]>(
      `SELECT count(*)::int AS count FROM "Company" WHERE "atsToken" IS NULL AND source = 'ASHBY'`
    );
    const remainingNullCompanies = nullCompanyRows[0]?.count ?? 0;

    const indexes = await prisma.$queryRawUnsafe<IndexResult[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('Job', 'Company') AND indexname IN ('Job_source_externalId_key', 'Company_source_atsToken_key') ORDER BY indexname`
    );
    const indexNames = indexes.map((i) => i.indexname);

    console.log('✅ Multi-source backfill summary:');
    console.log(`  - Jobs updated: ${totalJobsUpdated}`);
    console.log(`  - Companies updated: ${totalCompaniesUpdated}`);
    console.log(`  - Jobs with NULL externalId (ASHBY): ${remainingNullJobs}`);
    console.log(`  - Companies with NULL atsToken (ASHBY): ${remainingNullCompanies}`);
    console.log(`  - Unique indexes present: ${indexNames.join(', ')}`);

    if (remainingNullJobs > 0 || remainingNullCompanies > 0) {
      const err = `Expected 0 NULL rows remaining, got ${remainingNullJobs} jobs and ${remainingNullCompanies} companies`;
      console.error(`❌ ${err}`);
      if (require.main === module) {
        process.exit(1);
      }
      throw new Error(err);
    }

    return {
      totalJobsUpdated,
      totalCompaniesUpdated,
      remainingNullJobs,
      remainingNullCompanies,
      indexNames,
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  backfillSource()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
