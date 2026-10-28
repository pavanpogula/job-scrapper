/**
 * @file Empty Greenhouse Company Hiding Tests
 * @summary Guards G5 invariant: queryCompanies and queryCompanyProfile exclude source = GREENHOUSE companies with no active listed jobs
 * @tags Unit Test, Greenhouse, Hiding, Empty Companies, queryCompanies, queryCompanyProfile, G5
 */

import { queryCompanies, queryCompanyProfile } from '../../src/api/db/queries';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { PrismaClient } from '@prisma/client';

describe('G5: Hiding Empty Greenhouse Companies', () => {
  let prisma: ReturnType<typeof createStatefulPrisma>;

  beforeEach(() => {
    prisma = createStatefulPrisma({
      companies: [
        { id: 'c1', slug: 'ashby-with-jobs', name: 'Ashby With Jobs', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c2', slug: 'ashby-empty', name: 'Ashby Empty', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c3', slug: 'gh--with-jobs', name: 'GH With Jobs', source: 'GREENHOUSE', atsToken: 'with-jobs', status: 'ACTIVE' },
        { id: 'c4', slug: 'gh--empty', name: 'GH Empty Discovered', source: 'GREENHOUSE', atsToken: 'empty', status: 'ACTIVE' },
      ],
    });

    // Add active listed jobs to ashby-with-jobs and gh--with-jobs
    prisma.seed('job', {
      id: 'j1',
      ashbyId: 'ashby-j1',
      source: 'ASHBY',
      externalId: 'ashby-j1',
      title: 'Engineer',
      companySlug: 'ashby-with-jobs',
      active: true,
      isListed: true,
      publishedAt: new Date(),
    });

    prisma.seed('job', {
      id: 'j2',
      ashbyId: 'greenhouse:101',
      source: 'GREENHOUSE',
      externalId: '101',
      title: 'GH Engineer',
      companySlug: 'gh--with-jobs',
      active: true,
      isListed: true,
      publishedAt: new Date(),
    });
  });

  describe('queryCompanies', () => {
    it('excludes Greenhouse companies with 0 active jobs while keeping empty Ashby companies and active Greenhouse companies', async () => {
      const res = await queryCompanies(prisma as unknown as PrismaClient, { page: 1, pageSize: 30 });
      const slugs = res.data.map((c) => c.slug);

      // Ashby empty is kept (Ashby behavior unchanged)
      expect(slugs).toContain('ashby-empty');
      expect(slugs).toContain('ashby-with-jobs');

      // Greenhouse with jobs is kept
      expect(slugs).toContain('gh--with-jobs');

      // Empty Greenhouse board discovered in G5 stays invisible
      expect(slugs).not.toContain('gh--empty');
      expect(res.total).toBe(3);
    });
  });

  describe('queryCompanyProfile', () => {
    it('returns null (404) for an empty Greenhouse company', async () => {
      const profile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'gh--empty');
      expect(profile).toBeNull();
    });

    it('returns profile for a Greenhouse company with active jobs', async () => {
      const profile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'gh--with-jobs');
      expect(profile).not.toBeNull();
      expect(profile?.slug).toBe('gh--with-jobs');
      expect(profile?.jobCount).toBe(1);
    });

    it('returns profile for an empty Ashby company (Ashby behavior untouched)', async () => {
      const profile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'ashby-empty');
      expect(profile).not.toBeNull();
      expect(profile?.slug).toBe('ashby-empty');
      expect(profile?.jobCount).toBe(0);
    });
  });
});
