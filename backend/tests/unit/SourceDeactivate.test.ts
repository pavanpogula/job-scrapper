/**
 * @file Source Deactivation CLI Unit Tests
 * @summary Guards G6 rollback invariant: dry-run counts, real run touches target source only, ashby guard
 * @tags Unit Test, Rollback, Deactivate, Multi-source, ATS, G6
 */

import { deactivateSource } from '../../src/database/SourceDeactivate';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { PrismaClient } from '@prisma/client';

describe('G6: Source Deactivation CLI', () => {
  let prisma: ReturnType<typeof createStatefulPrisma>;

  beforeEach(() => {
    prisma = createStatefulPrisma({
      companies: [
        { id: 'c1', slug: 'ashby-corp', name: 'Ashby Corp', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c2', slug: 'gh--greenhouse-corp', name: 'GH Corp', source: 'GREENHOUSE', status: 'ACTIVE' },
      ],
      jobs: [
        // 2 active Ashby jobs
        {
          id: 'j1',
          ashbyId: 'ashby-1',
          source: 'ASHBY',
          companySlug: 'ashby-corp',
          active: true,
          isListed: true,
        },
        {
          id: 'j2',
          ashbyId: 'ashby-2',
          source: 'ASHBY',
          companySlug: 'ashby-corp',
          active: true,
          isListed: true,
        },
        // 3 active Greenhouse jobs and 1 inactive Greenhouse job
        {
          id: 'j3',
          ashbyId: 'greenhouse:101',
          source: 'GREENHOUSE',
          companySlug: 'gh--greenhouse-corp',
          active: true,
          isListed: true,
        },
        {
          id: 'j4',
          ashbyId: 'greenhouse:102',
          source: 'GREENHOUSE',
          companySlug: 'gh--greenhouse-corp',
          active: true,
          isListed: true,
        },
        {
          id: 'j5',
          ashbyId: 'greenhouse:103',
          source: 'GREENHOUSE',
          companySlug: 'gh--greenhouse-corp',
          active: true,
          isListed: true,
        },
        {
          id: 'j6',
          ashbyId: 'greenhouse:104',
          source: 'GREENHOUSE',
          companySlug: 'gh--greenhouse-corp',
          active: false,
          isListed: true,
        },
      ],
    });
  });

  it('performs dry-run without mutating database, returning accurate counts', async () => {
    const res = await deactivateSource({
      source: 'greenhouse',
      dryRun: true,
      prismaClient: prisma as unknown as PrismaClient,
    });

    expect(res.dryRun).toBe(true);
    expect(res.source).toBe('greenhouse');
    expect(res.activeJobs).toBe(3);
    expect(res.totalJobs).toBe(4);
    expect(res.deactivatedCount).toBe(0);

    // Verify all 3 Greenhouse jobs remain active in DB
    const activeCount = await (prisma as unknown as PrismaClient).job.count({
      where: { source: 'GREENHOUSE', active: true },
    });
    expect(activeCount).toBe(3);
  });

  it('real run deactivates only target source jobs and leaves other sources and company status unchanged', async () => {
    const res = await deactivateSource({
      source: 'greenhouse',
      dryRun: false,
      prismaClient: prisma as unknown as PrismaClient,
    });

    expect(res.dryRun).toBe(false);
    expect(res.source).toBe('greenhouse');
    expect(res.activeJobs).toBe(3);
    expect(res.totalJobs).toBe(4);
    expect(res.deactivatedCount).toBe(3);

    // Verify Greenhouse active jobs are now 0
    const ghActiveCount = await (prisma as unknown as PrismaClient).job.count({
      where: { source: 'GREENHOUSE', active: true },
    });
    expect(ghActiveCount).toBe(0);

    // Verify Ashby active jobs remain completely untouched (still 2)
    const ashbyActiveCount = await (prisma as unknown as PrismaClient).job.count({
      where: { source: 'ASHBY', active: true },
    });
    expect(ashbyActiveCount).toBe(2);

    // Verify Company status is unchanged (status remains ACTIVE)
    const companies = await (prisma as unknown as PrismaClient).company.findMany();
    const ghCompany = companies.find((c: { slug: string }) => c.slug === 'gh--greenhouse-corp');
    const ashbyCompany = companies.find((c: { slug: string }) => c.slug === 'ashby-corp');
    expect(ghCompany?.status).toBe('ACTIVE');
    expect(ashbyCompany?.status).toBe('ACTIVE');
  });

  it('refuses to deactivate primary source ashby without --i-know flag', async () => {
    await expect(
      deactivateSource({
        source: 'ashby',
        iKnow: false,
        prismaClient: prisma as unknown as PrismaClient,
      })
    ).rejects.toThrow(/Refusing to deactivate primary source "ashby" without --i-know/);

    // Verify Ashby jobs were not modified
    const ashbyActiveCount = await (prisma as unknown as PrismaClient).job.count({
      where: { source: 'ASHBY', active: true },
    });
    expect(ashbyActiveCount).toBe(2);
  });

  it('allows deactivating ashby when --i-know flag is explicitly passed', async () => {
    const res = await deactivateSource({
      source: 'ashby',
      iKnow: true,
      prismaClient: prisma as unknown as PrismaClient,
    });

    expect(res.deactivatedCount).toBe(2);
    const ashbyActiveCount = await (prisma as unknown as PrismaClient).job.count({
      where: { source: 'ASHBY', active: true },
    });
    expect(ashbyActiveCount).toBe(0);
  });

  it('throws for unknown or invalid source names', async () => {
    await expect(
      deactivateSource({
        source: 'workday',
        prismaClient: prisma as unknown as PrismaClient,
      })
    ).rejects.toThrow(/Invalid ATS source "workday"/);
  });

  it('supports lever dry-run and real deactivation without touching ashby or greenhouse jobs or company status', async () => {
    const multiPrisma = createStatefulPrisma({
      companies: [
        { id: 'c1', slug: 'ashby-corp', name: 'Ashby Corp', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c2', slug: 'gh--greenhouse-corp', name: 'GH Corp', source: 'GREENHOUSE', status: 'ACTIVE' },
        { id: 'c3', slug: 'lv--lever-corp', name: 'Lever Corp', source: 'LEVER', status: 'ACTIVE' },
      ],
      jobs: [
        { id: 'j1', ashbyId: 'ashby-1', source: 'ASHBY', companySlug: 'ashby-corp', active: true, isListed: true },
        { id: 'j2', ashbyId: 'greenhouse:101', source: 'GREENHOUSE', companySlug: 'gh--greenhouse-corp', active: true, isListed: true },
        { id: 'j3', ashbyId: 'lever:uuid-1', source: 'LEVER', companySlug: 'lv--lever-corp', active: true, isListed: true },
        { id: 'j4', ashbyId: 'lever:uuid-2', source: 'LEVER', companySlug: 'lv--lever-corp', active: true, isListed: true },
        { id: 'j5', ashbyId: 'lever:uuid-3', source: 'LEVER', companySlug: 'lv--lever-corp', active: false, isListed: true },
      ],
    });
    const client = multiPrisma as unknown as PrismaClient;

    const dry = await deactivateSource({ source: 'lever', dryRun: true, prismaClient: client });
    expect(dry.dryRun).toBe(true);
    expect(dry.source).toBe('lever');
    expect(dry.activeJobs).toBe(2);
    expect(dry.totalJobs).toBe(3);
    expect(dry.deactivatedCount).toBe(0);
    expect(await client.job.count({ where: { source: 'LEVER', active: true } })).toBe(2);

    const real = await deactivateSource({ source: 'lever', dryRun: false, prismaClient: client });
    expect(real.dryRun).toBe(false);
    expect(real.deactivatedCount).toBe(2);
    expect(await client.job.count({ where: { source: 'LEVER', active: true } })).toBe(0);
    expect(await client.job.count({ where: { source: 'ASHBY', active: true } })).toBe(1);
    expect(await client.job.count({ where: { source: 'GREENHOUSE', active: true } })).toBe(1);

    const companies = await client.company.findMany();
    expect(companies.find((c: { slug: string }) => c.slug === 'lv--lever-corp')?.status).toBe('ACTIVE');
  });
});
