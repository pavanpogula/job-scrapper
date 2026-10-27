/**
 * @file Database Query Builders for Backend REST API
 * @summary Centralized Prisma query functions for jobs, detail, facets, and companies with deterministic sorting and filtering
 * @tags Database, Queries, Prisma, API, Jobs
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  LIST_SELECT,
  DETAIL_SELECT,
  toJobListItem,
  toJobDetail,
  isValidId,
} from '../contract';
import { buildSearchWhere, tokenizeSearch } from '../../lib/search';
import type {
  JobQueryParams,
  CompanyQueryParams,
  JobsResponseDTO,
  JobDetailDTO,
  FacetsResponseDTO,
  CompaniesResponseDTO,
  CompanyProfileDTO,
  FacetCountDTO,
} from '../types';

export const SLUG_REGEX = /^[a-z0-9-]{1,100}$/;

export type { JobQueryParams, CompanyQueryParams, CompanyProfileDTO };

/**
 * @summary Queries paginated jobs matching filters with deterministic sort tie-breakers
 */
export async function queryJobs(
  prisma: PrismaClient,
  params: JobQueryParams = {}
): Promise<JobsResponseDTO> {
  const pageNum = Math.max(1, Math.min(5000, parseInt(String(params.page || '1'), 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(String(params.pageSize || '25'), 10) || 25));
  const skip = (pageNum - 1) * limit;

  const where: Prisma.JobWhereInput = {
    active: true,
    isListed: true,
  };
  const andConditions: Prisma.JobWhereInput[] = [];

  // BF-020: every word must start a word in the title, company, department or location
  const searchWhere = buildSearchWhere(tokenizeSearch(params.search));
  if (searchWhere) {
    andConditions.push(searchWhere);
  }

  if (params.workplaceType) {
    where.workplaceType = params.workplaceType;
  }

  if (params.employmentType) {
    where.employmentType = params.employmentType;
  }

  if (params.country) {
    where.country = params.country;
  }

  if (params.isRemote === 'true' || params.isRemote === true) {
    where.isRemote = true;
  }

  if (params.hasSalary === 'true' || params.hasSalary === true) {
    andConditions.push({
      OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }],
    });
  }

  let validSalaryMin: number | null = null;
  if (params.salaryMin !== undefined && params.salaryMin !== null && params.salaryMin !== '') {
    const parsed = parseInt(String(params.salaryMin), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      validSalaryMin = parsed;
      andConditions.push({
        salaryMin: { gte: validSalaryMin },
      });
    }
  }

  // GAP-API-01 / 04 §4.1: Ignore salaryInterval unless salaryMin is a valid number
  if (validSalaryMin !== null && params.salaryInterval) {
    andConditions.push({ salaryInterval: params.salaryInterval });
  }

  if (params.company && typeof params.company === 'string' && params.company.trim()) {
    where.companySlug = params.company.trim();
  }

  if (params.postedWithin && (params.postedWithin === '1d' || params.postedWithin === '7d' || params.postedWithin === '30d')) {
    const windowDays = params.postedWithin === '1d' ? 1 : params.postedWithin === '7d' ? 7 : 30;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    andConditions.push({
      OR: [
        { lastUpdatedAt: { gte: cutoff } },
        {
          AND: [
            { lastUpdatedAt: null },
            { publishedAt: { gte: cutoff } },
          ],
        },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Determine sort order
  const sortDirection: Prisma.SortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
  let orderBy: Prisma.JobOrderByWithRelationInput[];

  if (params.sortBy === 'company') {
    orderBy = [{ companySlug: sortDirection }, { id: 'asc' }];
  } else if (params.sortBy === 'salary') {
    orderBy = [{ salaryMin: { sort: sortDirection, nulls: 'last' } }, { id: 'asc' }];
  } else {
    // Default: publishedAt desc with nulls last, createdAt desc, and id asc tie-breaker
    orderBy = [
      { publishedAt: { sort: sortDirection, nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'asc' },
    ];
  }

  const [rawJobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      select: LIST_SELECT,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.job.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    data: rawJobs.map(toJobListItem),
    meta: {
      total,
      page: pageNum,
      pageSize: limit,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
  };
}

/**
 * @summary Queries a single job by id or ashbyId with company count
 */
export async function queryJobDetail(
  prisma: PrismaClient,
  id: string
): Promise<JobDetailDTO | null> {
  if (!isValidId(id)) {
    return null;
  }

  const job = await prisma.job.findFirst({
    where: {
      OR: [{ id }, { ashbyId: id }],
    },
    select: DETAIL_SELECT,
  });

  if (!job) return null;
  return toJobDetail(job);
}

/**
 * @summary Computes faceted counts for filters with deterministic ordering
 */
export async function computeFacets(prisma: PrismaClient): Promise<FacetsResponseDTO> {
  const [workplaceGroups, employmentGroups, countryGroups, deptRows, withSalaryCount, totalActive] =
    await Promise.all([
      prisma.job.groupBy({
        by: ['workplaceType'],
        where: { active: true, isListed: true, workplaceType: { not: null } },
        _count: { _all: true },
      }),
      prisma.job.groupBy({
        by: ['employmentType'],
        where: { active: true, isListed: true, employmentType: { not: null } },
        _count: { _all: true },
      }),
      prisma.job.groupBy({
        by: ['country'],
        where: { active: true, isListed: true, country: { not: null } },
        _count: { _all: true },
      }),
      prisma.department.findMany({
        where: { jobs: { some: { active: true, isListed: true } } },
        select: {
          name: true,
          _count: {
            select: { jobs: { where: { active: true, isListed: true } } },
          },
        },
        take: 50,
      }).catch((): { name: string; _count: { jobs: number } }[] => []),
      prisma.job.count({
        where: {
          active: true,
          isListed: true,
          OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }],
        },
      }),
      prisma.job.count({ where: { active: true, isListed: true } }),
    ]);

  const countries = countryGroups
    .map((g) => ({ value: g.country!, count: g._count._all }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 20);

  const departments = (deptRows || [])
    .map((d) => ({ value: d.name, count: d._count?.jobs ?? 0 }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 30);

  return {
    workplaceTypes: workplaceGroups.map((g) => ({ value: g.workplaceType!, count: g._count._all })),
    employmentTypes: employmentGroups.map((g) => ({ value: g.employmentType!, count: g._count._all })),
    countries,
    departments,
    hasSalary: {
      yes: withSalaryCount,
      no: Math.max(0, totalActive - withSalaryCount),
    },
  };
}

/**
 * @summary Queries active companies with job counts
 */
export async function queryCompanies(
  prisma: PrismaClient,
  params: CompanyQueryParams = {}
): Promise<CompaniesResponseDTO> {
  const pageNum = Math.max(1, parseInt(String(params.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(params.pageSize || '30'), 10) || 30));
  const skip = (pageNum - 1) * limit;

  const where: Prisma.CompanyWhereInput = { status: 'ACTIVE' };

  if (params.search && typeof params.search === 'string') {
    const s = params.search.trim().slice(0, 100);
    if (s.length > 0) {
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }
  }

  if (params.sort === 'jobs') {
    return queryCompaniesByOpenJobs(prisma, where, pageNum, limit);
  }

  const orderBy: Prisma.CompanyOrderByWithRelationInput[] = [{ name: 'asc' }, { slug: 'asc' }];

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      take: limit,
      skip,
      orderBy,
      include: {
        _count: {
          select: { jobs: { where: { active: true, isListed: true } } },
        },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    data: companies.map((c) => ({
      slug: c.slug,
      name: c.name,
      logoUrl: c.logoUrl,
      jobCount: c._count?.jobs ?? 0,
    })),
    total,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * @summary "Most hiring" company page: orders by OPEN (active, listed) job count, then name, then slug
 *
 * Prisma can only order by a relation's total count, which would include closed jobs, so the open-job counts
 * come from one groupBy and the ordering and paging happen in memory (about 2k ACTIVE companies).
 */
async function queryCompaniesByOpenJobs(
  prisma: PrismaClient,
  where: Prisma.CompanyWhereInput,
  pageNum: number,
  limit: number
): Promise<CompaniesResponseDTO> {
  const [companies, openCounts] = await Promise.all([
    prisma.company.findMany({ where, select: { slug: true, name: true, logoUrl: true } }),
    prisma.job.groupBy({
      by: ['companySlug'],
      where: { active: true, isListed: true },
      _count: { _all: true },
    }),
  ]);
  const openBySlug = new Map(openCounts.map((g) => [g.companySlug, g._count._all]));
  const ranked = companies
    .map((c) => ({ slug: c.slug, name: c.name, logoUrl: c.logoUrl, jobCount: openBySlug.get(c.slug) ?? 0 }))
    .sort(
      (a, b) =>
        b.jobCount - a.jobCount ||
        compareNullsLast(a.name, b.name) ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
    );
  const total = ranked.length;
  return {
    data: ranked.slice((pageNum - 1) * limit, pageNum * limit),
    total,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * @summary Ascending string comparison with nulls last, matching Postgres ORDER BY name ASC
 */
function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * @summary Top N facet values by open-job count, ties broken by name, from a groupBy over a relation id
 */
function topByCount(
  groups: { id: string | null; count: number }[],
  names: Map<string, string>,
  n: number
): FacetCountDTO[] {
  return groups
    .filter((g): g is { id: string; count: number } => g.id !== null && names.has(g.id))
    .map((g) => ({ value: names.get(g.id) as string, count: g.count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .slice(0, n);
}

/**
 * @summary Queries full company profile with job breakdowns and facets by slug
 */
export async function queryCompanyProfile(
  prisma: PrismaClient,
  slug: string
): Promise<CompanyProfileDTO | null> {
  if (!slug || typeof slug !== 'string' || !SLUG_REGEX.test(slug.trim())) {
    return null;
  }
  const normalizedSlug = slug.trim().toLowerCase();

  const company = await prisma.company.findFirst({
    where: { slug: normalizedSlug, status: 'ACTIVE' },
    select: { slug: true, name: true, logoUrl: true },
  });
  if (!company) {
    return null;
  }

  const jobWhere: Prisma.JobWhereInput = {
    companySlug: normalizedSlug,
    active: true,
    isListed: true,
  };

  const [
    jobCount,
    withSalary,
    latestJob,
    workplaceGroups,
    employmentGroups,
    deptGroups,
    locGroups,
  ] = await Promise.all([
    prisma.job.count({ where: jobWhere }),
    prisma.job.count({
      where: {
        ...jobWhere,
        OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }],
      },
    }),
    prisma.job.findFirst({
      where: { ...jobWhere, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    }),
    prisma.job.groupBy({
      by: ['workplaceType'],
      where: { ...jobWhere, workplaceType: { not: null } },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ['employmentType'],
      where: { ...jobWhere, employmentType: { not: null } },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ['departmentId'],
      where: { ...jobWhere, departmentId: { not: null } },
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ['locationId'],
      where: { ...jobWhere, locationId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const workplaceTypes: FacetCountDTO[] = workplaceGroups
    .map((g) => ({ value: g.workplaceType!, count: g._count._all }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const employmentTypes: FacetCountDTO[] = employmentGroups
    .map((g) => ({ value: g.employmentType!, count: g._count._all }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  // Every department/location this company uses is counted, then the top 10 are taken (ties by name)
  const deptIds = deptGroups.map((g) => g.departmentId).filter((id): id is string => id !== null);
  const locIds = locGroups.map((g) => g.locationId).filter((id): id is string => id !== null);
  const [deptNames, locNames] = await Promise.all([
    deptIds.length ? prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : [],
    locIds.length ? prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : [],
  ]);
  const departments = topByCount(
    deptGroups.map((g) => ({ id: g.departmentId, count: g._count._all })),
    new Map(deptNames.map((d) => [d.id, d.name])),
    10
  );
  const locations = topByCount(
    locGroups.map((g) => ({ id: g.locationId, count: g._count._all })),
    new Map(locNames.map((l) => [l.id, l.name])),
    10
  );

  return {
    slug: company.slug,
    name: company.name,
    logoUrl: company.logoUrl,
    jobCount,
    withSalary,
    latestPublishedAt: latestJob?.publishedAt ? latestJob.publishedAt.toISOString() : null,
    workplaceTypes,
    employmentTypes,
    departments,
    locations,
  };
}
