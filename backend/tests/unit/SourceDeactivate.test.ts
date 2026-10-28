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
        source: 'lever',
        prismaClient: prisma as unknown as PrismaClient,
      })
    ).rejects.toThrow(/Invalid ATS source "lever"/);
  });
});
