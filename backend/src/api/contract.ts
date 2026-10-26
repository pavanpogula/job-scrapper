/**
 * @file API Response Contract and Mapping Helpers
 * @summary Single source of truth for API field selection, response formatting, and ID validation
 * @tags API, Contract, Types, Validation, Normalization
 */

import type { Prisma } from '@prisma/client';
import type { JobListItemDTO, JobDetailDTO } from './types';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @summary Validates whether an ID string is a valid UUID
 */
export function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * @summary Prisma select clause for job list queries (never selects large metadata or postalAddress)
 */
export const LIST_SELECT = {
  id: true,
  ashbyId: true,
  title: true,
  companySlug: true,
  departmentId: true,
  locationId: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryInterval: true,
  isRemote: true,
  workplaceType: true,
  employmentType: true,
  publishedAt: true,
  lastUpdatedAt: true,
  lastUpdatedSource: true,
  applyUrl: true,
  country: true,
  region: true,
  city: true,
  isListed: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      name: true,
      logoUrl: true,
    },
  },
  department: {
    select: {
      name: true,
    },
  },
  location: {
    select: {
      name: true,
    },
  },
} as const;

/**
 * @summary Prisma select clause for job detail query
 */
export const DETAIL_SELECT = {
  id: true,
  ashbyId: true,
  title: true,
  companySlug: true,
  departmentId: true,
  locationId: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryInterval: true,
  isRemote: true,
  workplaceType: true,
  employmentType: true,
  publishedAt: true,
  lastUpdatedAt: true,
  lastUpdatedSource: true,
  applyUrl: true,
  country: true,
  region: true,
  city: true,
  isListed: true,
  active: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      _count: {
        select: {
          jobs: {
            where: { active: true },
          },
        },
      },
    },
  },
  department: {
    select: {
      name: true,
    },
  },
  location: {
    select: {
      name: true,
    },
  },
} as const;

export type JobWithListRelations = Prisma.JobGetPayload<{ select: typeof LIST_SELECT }>;
export type JobWithDetailRelations = Prisma.JobGetPayload<{ select: typeof DETAIL_SELECT }>;

/**
 * @summary Maps a database job row to the public API list item contract
 */
export function toJobListItem(job: JobWithListRelations): JobListItemDTO {
  const rawJob = job as unknown as Record<string, unknown>;
  const companyName = job.company?.name ?? (typeof rawJob.companyName === 'string' ? rawJob.companyName : null);
  const companyLogoUrl = job.company?.logoUrl ?? (typeof rawJob.companyLogoUrl === 'string' ? rawJob.companyLogoUrl : null);
  const department = job.department?.name ?? (typeof rawJob.department === 'string' ? rawJob.department : null);
  const location = job.location?.name ?? (typeof rawJob.location === 'string' ? rawJob.location : null);

  return {
    id: job.id,
    ashbyId: job.ashbyId,
    title: job.title,
    companySlug: job.companySlug,
    companyName,
    companyLogoUrl,
    department,
    location,
    country: job.country ?? null,
    region: job.region ?? null,
    city: job.city ?? null,
    isRemote: Boolean(job.isRemote),
    workplaceType: job.workplaceType ?? null,
    employmentType: job.employmentType ?? null,
    publishedAt: job.publishedAt ? (job.publishedAt instanceof Date ? job.publishedAt.toISOString() : String(job.publishedAt)) : null,
    lastUpdatedAt: job.lastUpdatedAt
      ? (job.lastUpdatedAt instanceof Date ? job.lastUpdatedAt.toISOString() : String(job.lastUpdatedAt))
      : (job.publishedAt ? (job.publishedAt instanceof Date ? job.publishedAt.toISOString() : String(job.publishedAt)) : null),
    lastUpdatedSource: (job.lastUpdatedSource as JobListItemDTO['lastUpdatedSource']) ?? (job.publishedAt ? 'published' : null),
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryInterval: job.salaryInterval ?? null,
    applyUrl: job.applyUrl,
    isListed: job.isListed !== false,
    createdAt: job.createdAt ? (job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt)) : null,
    updatedAt: job.updatedAt ? (job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt)) : null,
  };
}

/**
 * @summary Alias for toJobListItem matching card view terminology
 */
export const toJobCard = toJobListItem;

/**
 * @summary Maps a database job row to the public API detail contract
 */
export function toJobDetail(job: JobWithDetailRelations): JobDetailDTO {
  const rawMetadata = job.metadata;
  const meta: Record<string, unknown> =
    typeof rawMetadata === 'object' && rawMetadata !== null && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, unknown>)
      : {};

  const secondaryLocations: string[] = Array.isArray(meta.secondaryLocations)
    ? meta.secondaryLocations
        .map((loc: unknown) => {
          if (typeof loc === 'string') return loc;
          if (typeof loc === 'object' && loc !== null) {
            const l = loc as Record<string, unknown>;
            if (typeof l.location === 'string') return l.location;
            if (typeof l.locationName === 'string') return l.locationName;
          }
          return null;
        })
        .filter((loc: unknown): loc is string => Boolean(loc))
    : [];

  const jobUrl =
    typeof meta.jobUrl === 'string' && meta.jobUrl.length > 0
      ? meta.jobUrl
      : `https://jobs.ashbyhq.com/${job.companySlug}/${job.ashbyId}`;

  const descriptionHtml = typeof meta.descriptionHtml === 'string' ? meta.descriptionHtml : '';
  const descriptionPlain = typeof meta.descriptionPlain === 'string' ? meta.descriptionPlain : '';
  const team = typeof meta.team === 'string' ? meta.team : null;

  return {
    id: job.id,
    ashbyId: job.ashbyId,
    title: job.title,
    applyUrl: job.applyUrl,
    jobUrl,
    companySlug: job.companySlug,
    companyName: job.company?.name ?? null,
    companyLogoUrl: job.company?.logoUrl ?? null,
    department: job.department?.name ?? null,
    location: job.location?.name ?? null,
    country: job.country ?? null,
    region: job.region ?? null,
    city: job.city ?? null,
    isRemote: Boolean(job.isRemote),
    workplaceType: job.workplaceType ?? null,
    employmentType: job.employmentType ?? null,
    publishedAt: job.publishedAt ? (job.publishedAt instanceof Date ? job.publishedAt.toISOString() : String(job.publishedAt)) : null,
    lastUpdatedAt: job.lastUpdatedAt
      ? (job.lastUpdatedAt instanceof Date ? job.lastUpdatedAt.toISOString() : String(job.lastUpdatedAt))
      : (job.publishedAt ? (job.publishedAt instanceof Date ? job.publishedAt.toISOString() : String(job.publishedAt)) : null),
    lastUpdatedSource: (job.lastUpdatedSource as JobListItemDTO['lastUpdatedSource']) ?? (job.publishedAt ? 'published' : null),
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryInterval: job.salaryInterval ?? null,
    isListed: job.isListed !== false,
    active: Boolean(job.active),
    descriptionHtml,
    descriptionPlain,
    team,
    secondaryLocations,
    companyJobCount: job.company?._count?.jobs ?? 0,
    company: job.company
      ? {
          name: job.company.name,
          slug: job.company.slug,
          logoUrl: job.company.logoUrl,
        }
      : null,
  };
}

export interface SingleFilter {
  workplaceType?: string;
  employmentType?: string;
  country?: string;
  hasSalary?: boolean | string;
}

/**
 * @summary Evaluates whether a job item matches a single filter criteria
 */
export function matchesFilter(item: JobListItemDTO, filter: SingleFilter): boolean {
  if (filter.workplaceType && item.workplaceType !== filter.workplaceType) {
    return false;
  }
  if (filter.employmentType && item.employmentType !== filter.employmentType) {
    return false;
  }
  if (filter.country && item.country !== filter.country) {
    return false;
  }
  if (filter.hasSalary) {
    const has = item.salaryMin !== null || item.salaryMax !== null;
    if (!has) return false;
  }
  return true;
}
