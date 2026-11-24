/**
 * @file Job Attributes Schema Migration Integration Test
 * @summary Proves additive Job attribute column and index migration on real Postgres in isolated schema
 * @tags Integration, Postgres, Schema, JobAttributes, Migration, ADR-0023
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

interface ExecResult {
  stdout: string;
  status: number;
}

interface JobAttributeRow {
  id: string;
  contentHash: string;
  updatedAt: Date;
  experienceMinYears: number | null;
  clearanceRequired: boolean | null;
  attrsVersion: number | null;
  attrsModelVersion: number | null;
  attrsDescHash: string | null;
  attrsSource: string | null;
  attrsConfidence: string | null;
  attrsEvidence: unknown;
}

interface PgIndexRow {
  indexname: string;
  indexdef: string;
}

interface ExplainRow {
  'QUERY PLAN': string;
}

const ATTRIBUTE_INDEXES = [
  'Job_active_attrsVersion_idx',
  'Job_experienceMinYears_idx',
  'Job_clearanceRequired_idx',
] as const;

class RollbackPlanCapture extends Error {
  constructor(public readonly plans: { picker: string; years: string; clearance: string }) {
    super('rollback after EXPLAIN capture');
  }
}

describeIfDb('ADR-0023 E1: Additive Job attribute columns and indexes on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;
  let seededUpdatedAt: string[] = [];

  const preE1Fixture = path.resolve(__dirname, 'fixtures/schema.pre-e1.prisma');
  const liveSchema = path.resolve(__dirname, '../../prisma/schema.prisma');

  function pushSchema(schemaFile: string, extraFlags = ''): ExecResult {
    try {
      const stdout = execSync(
        `npx prisma db push --schema="${schemaFile}" --skip-generate ${extraFlags}`,
        {
          cwd: path.resolve(__dirname, '../..'),
          env: { ...process.env, DATABASE_URL: isolatedUrl },
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
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

    url.searchParams.set('schema', 'job_attrs_e1');
    isolatedUrl = url.toString();

    const initPush = pushSchema(preE1Fixture, '--force-reset');
    if (initPush.status !== 0) {
      throw new Error(`Failed to push pre-E1 schema: ${initPush.stdout}`);
    }

    prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Step 1: seeds rows under the pre-E1 schema', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Company" (id, slug, name, source, "atsToken") VALUES
        ('c-ashby', 'acme-corp', 'Acme Corp', 'ASHBY', 'acme-corp')`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Job" (id, "ashbyId", title, "applyUrl", "companySlug", source, "externalId", metadata, "contentHash", "updatedAt") VALUES
        ('j-1', 'ashby-job-1', 'Software Engineer', 'https://jobs.ashbyhq.com/acme-corp/ashby-job-1', 'acme-corp', 'ASHBY', 'ashby-job-1', '{}', 'hash-1', '2026-01-01 00:00:00'::timestamp),
        ('j-2', 'greenhouse:12345', 'Product Manager', 'https://job-boards.greenhouse.io/acme-corp/jobs/12345', 'acme-corp', 'GREENHOUSE', '12345', '{}', 'hash-2', '2026-01-01 00:00:00'::timestamp)`
    );

    const seededRows = await prisma.$queryRawUnsafe<Array<{ id: string; updatedAt: Date }>>(
      `SELECT id, "updatedAt" FROM "Job" ORDER BY id`
    );
    seededUpdatedAt = seededRows.map((r) => new Date(r.updatedAt).toISOString());

    const counts = await prisma.$queryRawUnsafe<{ companies: number; jobs: number }[]>(
      `SELECT (SELECT count(*)::int FROM "Company") AS companies, (SELECT count(*)::int FROM "Job") AS jobs`
    );
    expect(counts[0]).toEqual({ companies: 1, jobs: 2 });
  });

  it('Step 2: pushes the live schema additively (exit 0, no data loss)', () => {
    const r = pushSchema(liveSchema);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/data loss|--accept-data-loss/i);
  });

  it('Step 3: keeps existing rows and leaves every attribute column NULL', async () => {
    const countRows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "Job"`
    );
    expect(countRows[0].count).toBe(2);

    const rows = await prisma.$queryRawUnsafe<JobAttributeRow[]>(
      `SELECT id, "contentHash", "updatedAt",
              "experienceMinYears", "clearanceRequired", "attrsVersion", "attrsModelVersion",
              "attrsDescHash", "attrsSource", "attrsConfidence", "attrsEvidence"
       FROM "Job"
       ORDER BY id`
    );
    expect(rows).toHaveLength(2);

    const expectedHashes = ['hash-1', 'hash-2'];
    rows.forEach((row, idx) => {
      expect(row.contentHash).toBe(expectedHashes[idx]);
      expect(new Date(row.updatedAt).toISOString()).toBe(seededUpdatedAt[idx]);
      expect(row.experienceMinYears).toBeNull();
      expect(row.clearanceRequired).toBeNull();
      expect(row.attrsVersion).toBeNull();
      expect(row.attrsModelVersion).toBeNull();
      expect(row.attrsDescHash).toBeNull();
      expect(row.attrsSource).toBeNull();
      expect(row.attrsConfidence).toBeNull();
      expect(row.attrsEvidence).toBeNull();
    });
  });

  it('Step 4: second push is a no-op', () => {
    const r = pushSchema(liveSchema);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/already in sync/i);
  });

  it('Step 5: creates the three attribute indexes', async () => {
    const indexes = await prisma.$queryRawUnsafe<PgIndexRow[]>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'job_attrs_e1' AND tablename = 'Job'
       ORDER BY indexname`
    );

    const names = indexes.map((i) => i.indexname);
    for (const expectedIdx of ATTRIBUTE_INDEXES) {
      expect(names).toContain(expectedIdx);
    }

    const otherIndexes = indexes.filter(
      (i) => !(ATTRIBUTE_INDEXES as readonly string[]).includes(i.indexname)
    );
    for (const idx of otherIndexes) {
      const usingClause = idx.indexdef.slice(idx.indexdef.indexOf(' USING '));
      expect(usingClause).not.toMatch(/experienceMinYears|clearanceRequired|attrs/i);
    }

    // Job preserves its 14 existing indexes (PK, 2 unique constraints, 11 @@index) plus the 3 new ones
    expect(indexes).toHaveLength(17);
  });

  it('Step 6: the indexes are usable for the picker and filter predicates', async () => {
    let plans: { picker: string; years: string; clearance: string } | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        // Seed realistic processed distribution so planner statistics prefer the selective attribute indexes
        await tx.$executeRawUnsafe(
          `INSERT INTO "Job" (id, "ashbyId", title, "applyUrl", "companySlug", source, "externalId", metadata, "contentHash", "updatedAt", active, "attrsVersion", "experienceMinYears", "clearanceRequired")
           SELECT
             'j-bulk-' || g,
             'ashby-bulk-' || g,
             'Engineer ' || g,
             'https://jobs.ashbyhq.com/acme-corp/' || g,
             'acme-corp',
             'ASHBY',
             'bulk-' || g,
             '{}',
             'h-' || g,
             NOW(),
             true,
             1,
             CASE WHEN g % 10 = 0 THEN 4 ELSE 10 END,
             (g % 20 = 0)
           FROM generate_series(1, 300) AS g`
        );
        await tx.$executeRawUnsafe('ANALYZE "Job"');
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

        const pickerPlan = await tx.$queryRawUnsafe<ExplainRow[]>(
          `EXPLAIN SELECT id FROM "Job" WHERE active = true AND "attrsVersion" IS NULL`
        );
        const yearsPlan = await tx.$queryRawUnsafe<ExplainRow[]>(
          `EXPLAIN SELECT id FROM "Job" WHERE "experienceMinYears" BETWEEN 3 AND 5`
        );
        const clearancePlan = await tx.$queryRawUnsafe<ExplainRow[]>(
          `EXPLAIN SELECT id FROM "Job" WHERE "clearanceRequired" = true`
        );

        throw new RollbackPlanCapture({
          picker: pickerPlan.map((r) => r['QUERY PLAN']).join('\n'),
          years: yearsPlan.map((r) => r['QUERY PLAN']).join('\n'),
          clearance: clearancePlan.map((r) => r['QUERY PLAN']).join('\n'),
        });
      });
    } catch (err: unknown) {
      if (err instanceof RollbackPlanCapture) {
        plans = err.plans;
      } else {
        throw err;
      }
    }

    expect(plans).not.toBeNull();
    expect(plans!.picker).toContain('Job_active_attrsVersion_idx');
    expect(plans!.years).toContain('Job_experienceMinYears_idx');
    expect(plans!.clearance).toContain('Job_clearanceRequired_idx');
  });
});
