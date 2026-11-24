/**
 * @file EnrichPass Integration Test
 * @summary Real PostgreSQL tests for keyset picker, SQL change detection, raw-SQL writer, and batched run loop (BF-027)
 * @tags integration, postgres, enrichment, picker, writer, BF-027
 */

import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ATTRS_VERSION } from '../../src/enrichment/version';
import { getDescriptionText } from '../../src/enrichment/text';
import { pickJobsForEnrichment, countPickable } from '../../src/enrichment/picker';
import { writeAttributes } from '../../src/enrichment/writer';
import { runEnrichment } from '../../src/enrichment/run';
import { seedEnrichJob, seedEnrichJobs } from './enrichSeed';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('BF-027: Job attribute enrichment pass on real PostgreSQL', () => {
  let isolatedUrl: string;
  let prisma: PrismaClient;

  beforeAll(() => {
    const url = new URL(TEST_DATABASE_URL as string);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(`TEST_DATABASE_URL must point to localhost, got ${url.hostname}`);
    }
    url.searchParams.set('schema', 'enrich_pass');
    isolatedUrl = url.toString();

    execSync('npx prisma db push --skip-generate --force-reset', {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: isolatedUrl },
      stdio: 'pipe',
    });

    prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.job.deleteMany({});
    await prisma.company.deleteMany({});
  });

  it('picker picks unprocessed, old-version, changed and low+model rows and skips processed ones', async () => {
    await seedEnrichJob(prisma, 'n1', { attrsVersion: null });
    await seedEnrichJob(prisma, 'o1', { attrsVersion: ATTRS_VERSION - 1, attrsDescHash: 'h' });
    await seedEnrichJob(prisma, 'c1', { attrsVersion: ATTRS_VERSION, attrsDescHash: 'old', contentHash: 'h' });
    await seedEnrichJob(prisma, 'l1', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'low',
      attrsModelVersion: null,
    });
    await seedEnrichJob(prisma, 'l2', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'low',
      attrsModelVersion: ATTRS_VERSION,
    });
    await seedEnrichJob(prisma, 'p1', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'high',
      attrsModelVersion: null,
    });

    const off = (await pickJobsForEnrichment(prisma, { limit: 100, modelEnabled: false })).map((j) => j.id);
    expect(off).toEqual(['c1', 'n1', 'o1']);

    const on = (await pickJobsForEnrichment(prisma, { limit: 100, modelEnabled: true })).map((j) => j.id);
    expect(on).toEqual(['c1', 'l1', 'n1', 'o1']);
  });

  it('picker skips inactive jobs', async () => {
    await seedEnrichJob(prisma, 'n1', { active: true, attrsVersion: null });
    await seedEnrichJob(prisma, 'n2', { active: false, attrsVersion: null });

    const picked = await pickJobsForEnrichment(prisma, { limit: 100, modelEnabled: false });
    expect(picked.map((j) => j.id)).toEqual(['n1']);
    expect(await countPickable(prisma, { modelEnabled: false })).toBe(1);
  });

  it('picker pages by id after afterId', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await seedEnrichJob(prisma, id);
    }

    const p1 = await pickJobsForEnrichment(prisma, { limit: 2, modelEnabled: false });
    expect(p1.map((j) => j.id)).toEqual(['a', 'b']);

    const p2 = await pickJobsForEnrichment(prisma, { limit: 2, afterId: 'b', modelEnabled: false });
    expect(p2.map((j) => j.id)).toEqual(['c', 'd']);

    const p3 = await pickJobsForEnrichment(prisma, { limit: 2, afterId: 'd', modelEnabled: false });
    expect(p3.map((j) => j.id)).toEqual(['e']);

    const p4 = await pickJobsForEnrichment(prisma, { limit: 2, afterId: 'e', modelEnabled: false });
    expect(p4).toEqual([]);
  });

  it('picker reads only the description key and returns descHash = contentHash', async () => {
    await seedEnrichJob(prisma, 'j-plain', { contentHash: 'h' });
    await seedEnrichJob(prisma, 'j-html', {
      contentHash: 'h-html',
      metadata: {
        descriptionPlain: '',
        descriptionHtml: '<p>Requires <strong>4+ years</strong> experience</p>',
        other: 'x'.repeat(5000),
      },
    });

    const picked = await pickJobsForEnrichment(prisma, { limit: 10, modelEnabled: false });
    const plainJob = picked.find((j) => j.id === 'j-plain')!;
    const htmlJob = picked.find((j) => j.id === 'j-html')!;

    expect(plainJob.descriptionPlain).toContain('5+ years');
    expect(plainJob.descHash).toBe('h');
    expect(htmlJob.descriptionPlain).toBe(
      getDescriptionText({ descriptionHtml: '<p>Requires <strong>4+ years</strong> experience</p>' })
    );
    expect(htmlJob.descriptionPlain).toContain('4+ years');

    const [plainMetaRow] = await prisma.$queryRaw<{ metadata: Record<string, unknown> }[]>`
      SELECT CASE WHEN COALESCE(btrim(j."metadata"->>'descriptionPlain'), '') <> ''
                  THEN jsonb_build_object('descriptionPlain', j."metadata"->'descriptionPlain')
                  ELSE jsonb_build_object('descriptionHtml',  j."metadata"->'descriptionHtml')
             END AS "metadata"
      FROM "Job" j
      WHERE j."id" = ${'j-plain'}
    `;
    expect(Object.keys(plainMetaRow.metadata)).toEqual(['descriptionPlain']);

    const [htmlMetaRow] = await prisma.$queryRaw<{ metadata: Record<string, unknown> }[]>`
      SELECT CASE WHEN COALESCE(btrim(j."metadata"->>'descriptionPlain'), '') <> ''
                  THEN jsonb_build_object('descriptionPlain', j."metadata"->'descriptionPlain')
                  ELSE jsonb_build_object('descriptionHtml',  j."metadata"->'descriptionHtml')
             END AS "metadata"
      FROM "Job" j
      WHERE j."id" = ${'j-html'}
    `;
    expect(Object.keys(htmlMetaRow.metadata)).toEqual(['descriptionHtml']);
  });

  it('picker re-picks on description change', async () => {
    await seedEnrichJob(prisma, 'p1', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h1',
      contentHash: 'h1',
      attrsConfidence: 'high',
      metadata: { descriptionPlain: '5+ years of experience' },
    });

    expect(await pickJobsForEnrichment(prisma, { limit: 10, modelEnabled: false })).toEqual([]);

    await prisma.job.update({
      where: { id: 'p1' },
      data: {
        contentHash: 'h2',
        metadata: { descriptionPlain: '10+ years required' },
      },
    });

    const picked = await pickJobsForEnrichment(prisma, { limit: 10, modelEnabled: false });
    expect(picked.map((j) => j.id)).toEqual(['p1']);
    expect(picked[0]).toMatchObject({
      descHash: 'h2',
      descriptionPlain: expect.stringContaining('10+ years'),
    });
  });

  it('countPickable equals the number of rows the picker would return', async () => {
    await seedEnrichJob(prisma, 'n1', { attrsVersion: null });
    await seedEnrichJob(prisma, 'o1', { attrsVersion: ATTRS_VERSION - 1, attrsDescHash: 'h' });
    await seedEnrichJob(prisma, 'c1', { attrsVersion: ATTRS_VERSION, attrsDescHash: 'old', contentHash: 'h' });
    await seedEnrichJob(prisma, 'l1', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'low',
      attrsModelVersion: null,
    });
    await seedEnrichJob(prisma, 'l2', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'low',
      attrsModelVersion: ATTRS_VERSION,
    });
    await seedEnrichJob(prisma, 'p1', {
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      contentHash: 'h',
      attrsConfidence: 'high',
      attrsModelVersion: null,
    });

    expect(await countPickable(prisma, { modelEnabled: false })).toBe(3);
    expect(await countPickable(prisma, { modelEnabled: true })).toBe(4);
  });

  it('writer leaves updatedAt untouched', async () => {
    const fixedLastUpdated = new Date('2026-01-01T00:00:00.000Z');
    await seedEnrichJob(prisma, 'n1', {
      contentHash: 'h',
      lastUpdatedAt: fixedLastUpdated,
      lastUpdatedSource: 'ashby',
    });

    const before = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updated = await writeAttributes(prisma, [
      {
        id: 'n1',
        descHash: 'h',
        modelTried: false,
        attrs: {
          experienceMinYears: 5,
          clearanceRequired: true,
          confidence: 'high',
          source: 'rules',
          evidence: { years: '5+ years', clearance: 'TS/SCI' },
        },
      },
    ]);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
    expect(updated).toBe(1);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.lastUpdatedAt?.getTime()).toBe(before.lastUpdatedAt?.getTime());
    expect(after.lastUpdatedSource).toBe(before.lastUpdatedSource);
    expect(after.metadata).toEqual(before.metadata);
    expect(after).toMatchObject({
      experienceMinYears: 5,
      clearanceRequired: true,
      attrsVersion: ATTRS_VERSION,
      attrsDescHash: 'h',
      attrsSource: 'rules',
      attrsConfidence: 'high',
      attrsModelVersion: null,
      attrsEvidence: { years: '5+ years', clearance: 'TS/SCI' },
    });
  });

  it('writer stores null years and false clearance', async () => {
    await seedEnrichJob(prisma, 'n1', { contentHash: 'h' });

    const updated = await writeAttributes(prisma, [
      {
        id: 'n1',
        descHash: 'h',
        modelTried: false,
        attrs: {
          experienceMinYears: null,
          clearanceRequired: false,
          confidence: 'high',
          source: 'rules',
          evidence: {},
        },
      },
    ]);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
    expect(updated).toBe(1);
    expect(after.experienceMinYears).toBeNull();
    expect(after.clearanceRequired).toBe(false);
    expect(after.attrsVersion).toBe(ATTRS_VERSION);
    expect(after.attrsEvidence).toEqual({});
  });

  it('writer skips a row whose contentHash changed after pick', async () => {
    await seedEnrichJob(prisma, 'n1', { contentHash: 'h2' });

    const updated = await writeAttributes(prisma, [
      {
        id: 'n1',
        descHash: 'h1',
        modelTried: false,
        attrs: {
          experienceMinYears: 5,
          clearanceRequired: false,
          confidence: 'high',
          source: 'rules',
          evidence: { years: '5+ years' },
        },
      },
    ]);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
    expect(updated).toBe(0);
    expect(after.attrsVersion).toBeNull();
  });

  it('writer skips inactive rows', async () => {
    await seedEnrichJob(prisma, 'n1', { active: false, contentHash: 'h' });

    const updated = await writeAttributes(prisma, [
      {
        id: 'n1',
        descHash: 'h',
        modelTried: false,
        attrs: {
          experienceMinYears: 3,
          clearanceRequired: false,
          confidence: 'high',
          source: 'rules',
          evidence: { years: '3+ years' },
        },
      },
    ]);

    const after = await prisma.job.findUniqueOrThrow({ where: { id: 'n1' } });
    expect(updated).toBe(0);
    expect(after.attrsVersion).toBeNull();
  });

  it('writer sets attrsModelVersion only when the model was tried', async () => {
    await seedEnrichJob(prisma, 'm1', { contentHash: 'h1' });
    await seedEnrichJob(prisma, 'm2', { contentHash: 'h2' });

    const firstWrite = await writeAttributes(prisma, [
      {
        id: 'm1',
        descHash: 'h1',
        modelTried: true,
        attrs: {
          experienceMinYears: 4,
          clearanceRequired: false,
          confidence: 'high',
          source: 'model',
          evidence: { years: '4+ years' },
        },
      },
      {
        id: 'm2',
        descHash: 'h2',
        modelTried: false,
        attrs: {
          experienceMinYears: null,
          clearanceRequired: false,
          confidence: 'low',
          source: 'rules',
          evidence: {},
        },
      },
    ]);

    expect(firstWrite).toBe(2);
    const m1First = await prisma.job.findUniqueOrThrow({ where: { id: 'm1' } });
    const m2First = await prisma.job.findUniqueOrThrow({ where: { id: 'm2' } });
    expect(m1First.attrsModelVersion).toBe(ATTRS_VERSION);
    expect(m2First.attrsModelVersion).toBeNull();

    // Rewriting m1 without calling the model resets attrsModelVersion to null
    const secondWrite = await writeAttributes(prisma, [
      {
        id: 'm1',
        descHash: 'h1',
        modelTried: false,
        attrs: {
          experienceMinYears: 4,
          clearanceRequired: false,
          confidence: 'high',
          source: 'rules',
          evidence: { years: '4+ years' },
        },
      },
    ]);

    expect(secondWrite).toBe(1);
    const m1Second = await prisma.job.findUniqueOrThrow({ where: { id: 'm1' } });
    expect(m1Second.attrsModelVersion).toBeNull();
  });

  it('writer writes a 500-row batch in one call', async () => {
    await seedEnrichJob(prisma, 'init', { active: false });
    const batchData = Array.from({ length: 500 }, (_, i) => {
      const id = `b-${String(i).padStart(3, '0')}`;
      return {
        id,
        ashbyId: id,
        source: 'ASHBY' as const,
        externalId: id,
        title: `Engineer ${i}`,
        applyUrl: `https://jobs.ashbyhq.com/enrich-acme/${id}`,
        companySlug: 'enrich-acme',
        metadata: { descriptionPlain: i % 2 === 0 ? `${(i % 10) + 1}+ years` : 'No years stated' },
        contentHash: `bh-${i}`,
        active: true,
      };
    });
    await prisma.job.createMany({ data: batchData });

    const writes = Array.from({ length: 500 }, (_, i) => ({
      id: `b-${String(i).padStart(3, '0')}`,
      descHash: `bh-${i}`,
      modelTried: false,
      attrs: {
        experienceMinYears: i % 2 === 0 ? (i % 10) + 1 : null,
        clearanceRequired: i % 10 === 0,
        confidence: 'high' as const,
        source: 'rules' as const,
        evidence: i % 2 === 0 ? { years: `${(i % 10) + 1}+ years` } : {},
      },
    }));

    const written = await writeAttributes(prisma, writes);
    expect(written).toBe(500);

    const nullRow = await prisma.job.findUniqueOrThrow({ where: { id: 'b-001' } });
    const numRow = await prisma.job.findUniqueOrThrow({ where: { id: 'b-002' } });
    expect(nullRow.experienceMinYears).toBeNull();
    expect(numRow.experienceMinYears).toBe(3);
  });

  it('runEnrichment fills every active job and is idempotent', async () => {
    await seedEnrichJobs(prisma, 1200);
    await seedEnrichJob(prisma, 'inactive-1', { active: false });
    await seedEnrichJob(prisma, 'inactive-2', { active: false });
    await seedEnrichJob(prisma, 'inactive-3', { active: false });

    const first = await runEnrichment(prisma, {
      maxJobs: null,
      budgetMin: 10,
      dryRun: false,
      modelMaxCalls: 0,
    });
    expect(first.written).toBe(1200);
    expect(first.picked).toBe(1200);
    expect(first.remaining).toBe(0);
    expect(first.stoppedBy).toBe('done');

    const second = await runEnrichment(prisma, {
      maxJobs: null,
      budgetMin: 10,
      dryRun: false,
      modelMaxCalls: 0,
    });
    expect(second.picked).toBe(0);
    expect(second.written).toBe(0);
    expect(second.remaining).toBe(0);
    expect(second.stoppedBy).toBe('done');
  });

  it('budget stop leaves the rest pickable', async () => {
    await seedEnrichJobs(prisma, 1200);

    const times = [0, 0, 11 * 60_000, 11 * 60_000];
    let idx = 0;
    const now = (): number => times[idx++];

    const res = await runEnrichment(
      prisma,
      { maxJobs: null, budgetMin: 10, dryRun: false, modelMaxCalls: 0 },
      { now }
    );

    expect(res.written).toBe(500);
    expect(res.remaining).toBe(700);
    expect(res.stoppedBy).toBe('budget');
  });

  it('dry run writes nothing', async () => {
    await seedEnrichJobs(prisma, 1200);

    const res = await runEnrichment(prisma, {
      maxJobs: null,
      budgetMin: 10,
      dryRun: true,
      modelMaxCalls: 0,
    });

    expect(res.picked).toBe(1200);
    expect(res.written).toBe(0);
    expect(res.remaining).toBe(1200);

    const processedCount = await prisma.job.count({
      where: { attrsVersion: { not: null } },
    });
    expect(processedCount).toBe(0);
  });

  it('inactive jobs are never written', async () => {
    await seedEnrichJob(prisma, 'active-1', { active: true });
    await seedEnrichJob(prisma, 'inactive-1', { active: false });
    await seedEnrichJob(prisma, 'inactive-2', { active: false });
    await seedEnrichJob(prisma, 'inactive-3', { active: false });

    const res = await runEnrichment(prisma, {
      maxJobs: null,
      budgetMin: 10,
      dryRun: false,
      modelMaxCalls: 0,
    });
    expect(res.written).toBe(1);
    expect(res.remaining).toBe(0);

    const inactiveRows = await prisma.job.findMany({
      where: { id: { in: ['inactive-1', 'inactive-2', 'inactive-3'] } },
    });
    expect(inactiveRows).toHaveLength(3);
    for (const row of inactiveRows) {
      expect(row.attrsVersion).toBeNull();
    }
  });
});
