/**
 * @file Lever L1 Schema Migration Integration Test
 * @summary Proves additive Ats enum expansion with LEVER on real Postgres in isolated schema
 * @tags Integration, Postgres, Schema, Lever, ATS, Migration, ADR-0022
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

describeIfDb('ADR-0022 L1: Additive Ats.LEVER enum migration on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;

  const preL1Fixture = path.resolve(__dirname, 'fixtures/schema.pre-l1.prisma');
  const liveSchema = path.resolve(__dirname, '../../prisma/schema.prisma');

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

    url.searchParams.set('schema', 'lever_l1');
    isolatedUrl = url.toString();

    // 1. Initial push of pre-L1 frozen schema with --force-reset on isolated schema
    const initPush = pushSchema(preL1Fixture, '--force-reset');
    if (initPush.status !== 0) {
      throw new Error(`Failed to push pre-L1 schema: ${initPush.stdout}`);
    }

    prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('Step 1: seeds initial data under pre-L1 schema', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Company" (id, slug, name, source, "atsToken") VALUES
        ('c-ashby', 'acme-corp', 'Acme Corp', 'ASHBY', 'acme-corp'),
        ('c-gh', 'gh--stripe', 'Stripe', 'GREENHOUSE', 'stripe')`
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Job" (id, "ashbyId", title, "applyUrl", "companySlug", source, "externalId", metadata, "contentHash", "updatedAt") VALUES
        ('j-1', 'ashby-job-1', 'Software Engineer', 'https://jobs.ashbyhq.com/acme-corp/ashby-job-1', 'acme-corp', 'ASHBY', 'ashby-job-1', '{}', 'hash-1', NOW()),
        ('j-2', 'greenhouse:12345', 'Product Manager', 'https://job-boards.greenhouse.io/stripe/jobs/12345', 'gh--stripe', 'GREENHOUSE', '12345', '{}', 'hash-2', NOW())`
    );

    const counts = await prisma.$queryRawUnsafe<{ companies: number; jobs: number }[]>(
      `SELECT (SELECT count(*)::int FROM "Company") AS companies, (SELECT count(*)::int FROM "Job") AS jobs`
    );
    expect(counts[0]).toEqual({ companies: 2, jobs: 2 });
  });

  it('Step 2: pushes live schema containing Ats.LEVER without prompts, data loss, or errors', async () => {
    const pushResult = pushSchema(liveSchema);
    expect(pushResult.status).toBe(0);
    expect(pushResult.stdout).not.toMatch(/data loss/i);
    expect(pushResult.stdout).not.toMatch(/unexecutable/i);

    // Second push must be a no-op "already in sync"
    const secondPush = pushSchema(liveSchema);
    expect(secondPush.status).toBe(0);
    expect(secondPush.stdout).toMatch(/already in sync/i);

    // Initial rows must remain intact
    const counts = await prisma.$queryRawUnsafe<{ companies: number; jobs: number }[]>(
      `SELECT (SELECT count(*)::int FROM "Company") AS companies, (SELECT count(*)::int FROM "Job") AS jobs`
    );
    expect(counts[0]).toEqual({ companies: 2, jobs: 2 });
  });

  it('Step 3: inserts Company with source=LEVER and verifies record', async () => {
    await prisma.company.create({
      data: {
        id: 'c-lever',
        source: 'LEVER',
        slug: 'lv--acme',
        atsToken: 'acme',
        name: 'Acme Lever',
      },
    });

    const leverCompany = await prisma.company.findUnique({
      where: { slug: 'lv--acme' },
    });
    expect(leverCompany).not.toBeNull();
    expect(leverCompany?.source).toBe('LEVER');
    expect(leverCompany?.slug).toBe('lv--acme');
    expect(leverCompany?.atsToken).toBe('acme');
  });
});
