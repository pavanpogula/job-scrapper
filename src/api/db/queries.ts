/**
 * @file Database Query Builders for Backend REST API
 * @summary Centralized Prisma query functions for jobs, detail, facets, and companies with deterministic sorting and filtering
 * @tags Database, Queries, Prisma, API, Jobs
 */

import { PrismaClient } from '@prisma/client';
import {
  LIST_SELECT,
  DETAIL_SELECT,
  toJobListItem,
  toJobDetail,
  isValidId,
} from '../contract';

export interface JobQueryParams {
  search?: string;
  workplaceType?: string;
  employmentType?: string;
  country?: string;
  isRemote?: string | boolean;
  hasSalary?: string | boolean;
  salaryMin?: string | number;
  salaryInterval?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: string | number;
  pageSize?: string | number;
}

/**
 * @summary Queries paginated jobs matching filters with deterministic sort tie-breakers
 */
export async function queryJobs(prisma: PrismaClient, params: JobQueryParams = {}) {
  const pageNum = Math.max(1, Math.min(5000, parseInt(String(params.page || '1'), 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(String(params.pageSize || '25'), 10) || 25));
  const skip = (pageNum - 1) * limit;

  const where: any = {
    active: true,
    isListed: true,
  };
  const andConditions: any[] = [];

  if (params.search && typeof params.search === 'string') {
    const s = params.search.trim().slice(0, 100);
    if (s.length > 0) {
      andConditions.push({
        OR: [
          { title: { contains: s, mode: 'insensitive' } },
          { company: { name: { contains: s, mode: 'insensitive' } } },
          { department: { name: { contains: s, mode: 'insensitive' } } },
          { location: { name: { contains: s, mode: 'insensitive' } } },
        ],
      });
    }
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

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Determine sort order
  const sortDirection: 'asc' | 'desc' = params.sortOrder === 'asc' ? 'asc' : 'desc';
  let orderBy: any[];

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
export async function queryJobDetail(prisma: PrismaClient, id: string) {
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
export async function computeFacets(prisma: PrismaClient) {
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
      }).catch(() => []),
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
    .map((d: any) => ({ value: d.name, count: d._count?.jobs ?? 0 }))
    .sort((a: any, b: any) => b.count - a.count || a.value.localeCompare(b.value))
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
  params: { search?: string; page?: string | number; pageSize?: string | number } = {}
) {
  const pageNum = Math.max(1, parseInt(String(params.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(params.pageSize || '30'), 10) || 30));
  const skip = (pageNum - 1) * limit;

  const where: any = { status: 'ACTIVE' };

  if (params.search && typeof params.search === 'string') {
    const s = params.search.trim().slice(0, 100);
    if (s.length > 0) {
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      take: limit,
      skip,
      orderBy: { name: 'asc' },
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
      jobCount: c._count.jobs,
    })),
    total,
    page: pageNum,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
  };
}
