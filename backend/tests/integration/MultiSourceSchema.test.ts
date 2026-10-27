/**
 * @file Multi-Source ATS Schema Migration & Backfill Integration Test
 * @summary Proves two-step unique index migration, additive schema push, idempotent backfill, and -- guard on real Postgres
 * @tags Integration, Postgres, Schema, Multi-source, ATS, Migration, ADR-0021
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { backfillSource } from '../../src/database/BackfillSource';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

interface IndexRow {
  indexname: string;
}

interface RawJobRow {
  source: string;
  externalId: string | null;
}

interface RawCompanyRow {
  source: string;
  atsToken: string | null;
}

interface ExecResult {
  stdout: string;
  status: number;
}

describeIfDb('ADR-0021: Multi-source schema expansion, dual-write backfill, and safe @@unique on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;

  const preG1Fixture = path.resolve(__dirname, 'fixtures/schema.pre-g1.prisma');
  const g1Fixture = path.resolve(__dirname, 'fixtures/schema.g1.prisma');
  const g1UniquesFixture = path.resolve(__dirname, 'fixtures/schema.g1-uniques.prisma');

  function pushSchema(schemaFile: string, extraFlags = ''): ExecResult {
    try {
      const stdout = execSync(
        `npx prisma db push --schema="${schemaFile}" --skip-generate ${extraFlags}`,
        {
          cwd: path.resolve(__dirname, '../..'),
          env: { ...process.env, DATABASE_URL: isolatedUrl },
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );
      return { stdout, status: 0 };
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
      const stdout = (execErr.stdout?.toString() || '') + (execErr.stderr?.toString() || '');
      return { stdout, status: execErr.status ?? 1 };
    }
  }

  beforeAll(async () => {
    const url = new URL(TEST_DATABASE_URL as string);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(`TEST_DATABASE_URL must point to localhost, got ${url.hostname}`);
    }

    url.searchParams.set('schema', 'multisource');
    isolatedUrl = url.toString();

    // 1. Initial push of pre-G1 frozen schema with --force-reset on isolated schema
    const initPush = pushSchema(preG1Fixture, '--force-reset');
    if (initPush.status !== 0) {
      throw new Error(`Failed to push pre-G1 schema: ${initPush.stdout}`);
    }

    prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Step 1: seeds initial data under pre-G1 schema', async () => {
    // Raw SQL: the generated client matches the live schema and always sends `source`,
    // which does not exist yet under the pre-G1 schema.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Company" (id, slug, name) VALUES ('c-acme', 'acme-corp', 'Acme Corp'), ('c-beta', 'beta-corp', 'Beta Corp')`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Job" (id, "ashbyId", title, "applyUrl", "companySlug", metadata, "contentHash", "updatedAt") VALUES
        ('j-1', 'ashby-job-1', 'Software Engineer', 'https://jobs.ashbyhq.com/acme-corp/ashby-job-1', 'acme-corp', '{}', 'hash-1', NOW()),
        ('j-2', 'ashby-job-2', 'Product Manager', 'https://jobs.ashbyhq.com/beta-corp/ashby-job-2', 'beta-corp', '{}', 'hash-2', NOW())`
    );

    const counts = await prisma.$queryRawUnsafe<{ companies: number; jobs: number }[]>(
      `SELECT (SELECT count(*)::int FROM "Company") AS companies, (SELECT count(*)::int FROM "Job") AS jobs`
    );
    expect(counts[0]).toEqual({ companies: 2, jobs: 2 });
  });

  it('Step 2: pushes schema.g1.prisma without data loss flags; rows default to source=ASHBY and NULL externalId/atsToken', async () => {
    const g1Push = pushSchema(g1Fixture);
    expect(g1Push.status).toBe(0);

    const jobs = await prisma.$queryRawUnsafe<RawJobRow[]>(
      `SELECT source::text AS source, "externalId" FROM "Job" ORDER BY "ashbyId"`
    );
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      expect(j.source).toBe('ASHBY');
      expect(j.externalId).toBeNull();
    }

    const companies = await prisma.$queryRawUnsafe<RawCompanyRow[]>(
      `SELECT source::text AS source, "atsToken" FROM "Company" ORDER BY slug`
    );
    expect(companies).toHaveLength(2);
    for (const c of companies) {
      expect(c.source).toBe('ASHBY');
      expect(c.atsToken).toBeNull();
    }
  });

  it('Step 3: runs backfill twice; second run updates 0 rows; unique indexes are created', async () => {
    // First backfill run: populates externalId & atsToken and creates unique indexes
    const run1 = await backfillSource(prisma);
    expect(run1.totalJobsUpdated).toBe(2);
    expect(run1.totalCompaniesUpdated).toBe(2);
    expect(run1.remainingNullJobs).toBe(0);
    expect(run1.remainingNullCompanies).toBe(0);
    expect(run1.indexNames).toContain('Job_source_externalId_key');
    expect(run1.indexNames).toContain('Company_source_atsToken_key');

    // Second backfill run: idempotent, 0 updates
    const run2 = await backfillSource(prisma);
    expect(run2.totalJobsUpdated).toBe(0);
    expect(run2.totalCompaniesUpdated).toBe(0);
    expect(run2.remainingNullJobs).toBe(0);
    expect(run2.remainingNullCompanies).toBe(0);
    expect(run2.indexNames).toContain('Job_source_externalId_key');
    expect(run2.indexNames).toContain('Company_source_atsToken_key');
  });

  it('Step 4: pushes schema.g1-uniques.prisma reporting already in sync (proves G2 safety)', async () => {
    const uniquesPush = pushSchema(g1UniquesFixture);
    expect(uniquesPush.status).toBe(0);
    expect(uniquesPush.stdout.toLowerCase()).toContain('already in sync');
  });

  it('Step 4b: pushes live schema.prisma reporting already in sync (G2 live schema confirmation)', async () => {
    const liveSchemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    const livePush = pushSchema(liveSchemaPath);
    expect(livePush.status).toBe(0);
    expect(livePush.stdout.toLowerCase()).toContain('already in sync');
  });

  it('Step 5: backfill refuses and exits 1 without creating indexes when an ASHBY company has slug with --', async () => {
    // Drop existing indexes to verify failure prevents creation
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Company_source_atsToken_key"`);
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Job_source_externalId_key"`);

    // Insert an invalid ASHBY company containing double-hyphen
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Company" (id, slug, name, source, status, "createdAt") VALUES ('c-bad', 'bad--slug', 'Bad Corp', 'ASHBY', 'ACTIVE', NOW())`
    );

    // Run backfill via CLI process
    let exitStatus = 0;
    let cliOutput = '';
    try {
      cliOutput = execSync('npm run db:backfill-source', {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, DATABASE_URL: isolatedUrl },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err: unknown) {
      const execErr = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      exitStatus = execErr.status ?? 1;
      cliOutput = (execErr.stdout?.toString() || '') + (execErr.stderr?.toString() || '');
    }

    expect(exitStatus).toBe(1);
    expect(cliOutput).toContain('double-hyphen');

    // Verify indexes were NOT created
    const indexes = await prisma.$queryRawUnsafe<IndexRow[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('Job', 'Company') AND indexname IN ('Job_source_externalId_key', 'Company_source_atsToken_key')`
    );
    expect(indexes).toHaveLength(0);

    // Clean up bad company
    await prisma.$executeRawUnsafe(`DELETE FROM "Company" WHERE id = 'c-bad'`);
  });
});
