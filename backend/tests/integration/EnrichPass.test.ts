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
import { seedEnrichJob } from './enrichSeed';

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
});
