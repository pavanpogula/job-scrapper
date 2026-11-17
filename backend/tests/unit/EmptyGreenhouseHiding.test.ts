/**
 * @file Empty Non-Ashby Company Hiding Tests
 * @summary Guards G5 / L1 / L4 invariant: queryCompanies and queryCompanyProfile exclude GREENHOUSE and LEVER companies with no active listed jobs
 * @tags Unit Test, Greenhouse, Lever, Hiding, Empty Companies, queryCompanies, queryCompanyProfile, G5, ADR-0022
 */

import { queryCompanies, queryCompanyProfile } from '../../src/api/db/queries';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { PrismaClient } from '@prisma/client';

describe('G5 / ADR-0022: Hiding Empty Greenhouse & Lever Companies', () => {
  let prisma: ReturnType<typeof createStatefulPrisma>;

  beforeEach(() => {
    prisma = createStatefulPrisma({
      companies: [
        { id: 'c1', slug: 'ashby-with-jobs', name: 'Ashby With Jobs', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c2', slug: 'ashby-empty', name: 'Ashby Empty', source: 'ASHBY', status: 'ACTIVE' },
        { id: 'c3', slug: 'gh--with-jobs', name: 'GH With Jobs', source: 'GREENHOUSE', atsToken: 'with-jobs', status: 'ACTIVE' },
        { id: 'c4', slug: 'gh--empty', name: 'GH Empty Discovered', source: 'GREENHOUSE', atsToken: 'empty', status: 'ACTIVE' },
        { id: 'c5', slug: 'lv--with-jobs', name: 'Lever With Jobs', source: 'LEVER', atsToken: 'lv-with-jobs', status: 'ACTIVE' },
        { id: 'c6', slug: 'lv--empty', name: 'Lever Empty Discovered', source: 'LEVER', atsToken: 'lv-empty', status: 'ACTIVE' },
      ],
    });

    // Add active listed jobs to ashby-with-jobs, gh--with-jobs, and lv--with-jobs
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

    prisma.seed('job', {
      id: 'j3',
      ashbyId: 'lever:33333333-3333-4333-8333-333333333333',
      source: 'LEVER',
      externalId: '33333333-3333-4333-8333-333333333333',
      title: 'Lever Engineer',
      companySlug: 'lv--with-jobs',
      active: true,
      isListed: true,
      publishedAt: new Date(),
    });
  });

  describe('queryCompanies', () => {
    it('excludes Greenhouse and Lever companies with 0 active jobs while keeping empty Ashby companies and active boards', async () => {
      const res = await queryCompanies(prisma as unknown as PrismaClient, { page: 1, pageSize: 30 });
      const slugs = res.data.map((c) => c.slug);

      // Ashby empty is kept (Ashby behavior unchanged)
      expect(slugs).toContain('ashby-empty');
      expect(slugs).toContain('ashby-with-jobs');

      // Greenhouse & Lever with jobs are kept
      expect(slugs).toContain('gh--with-jobs');
      expect(slugs).toContain('lv--with-jobs');

      // Empty Greenhouse & Lever discovered boards stay invisible
      expect(slugs).not.toContain('gh--empty');
      expect(slugs).not.toContain('lv--empty');
      expect(res.total).toBe(4);
    });
  });

  describe('queryCompanyProfile', () => {
    it('returns null (404) for an empty Greenhouse or Lever company', async () => {
      const ghProfile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'gh--empty');
      expect(ghProfile).toBeNull();

      const lvProfile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'lv--empty');
      expect(lvProfile).toBeNull();
    });

    it('returns profile for Greenhouse and Lever companies with active jobs', async () => {
      const ghProfile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'gh--with-jobs');
      expect(ghProfile).not.toBeNull();
      expect(ghProfile?.slug).toBe('gh--with-jobs');
      expect(ghProfile?.jobCount).toBe(1);

      const lvProfile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'lv--with-jobs');
      expect(lvProfile).not.toBeNull();
      expect(lvProfile?.slug).toBe('lv--with-jobs');
      expect(lvProfile?.jobCount).toBe(1);
    });

    it('returns profile for an empty Ashby company (Ashby behavior untouched)', async () => {
      const profile = await queryCompanyProfile(prisma as unknown as PrismaClient, 'ashby-empty');
      expect(profile).not.toBeNull();
      expect(profile?.slug).toBe('ashby-empty');
      expect(profile?.jobCount).toBe(0);
    });
  });
});
