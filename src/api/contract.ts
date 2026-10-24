/**
 * @file API Response Contract and Mapping Helpers
 * @summary Single source of truth for API field selection, response formatting, and ID validation
 * @tags API, Contract, Types, Validation, Normalization
 */

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

/**
 * @summary Maps a database job row to the public API list item contract
 */
export function toJobListItem(job: any) {
  return {
    id: job.id,
    ashbyId: job.ashbyId,
    title: job.title,
    companySlug: job.companySlug,
    companyName: job.company?.name ?? job.companyName ?? null,
    companyLogoUrl: job.company?.logoUrl ?? job.companyLogoUrl ?? null,
    department: job.department?.name ?? job.department ?? null,
    location: job.location?.name ?? job.location ?? null,
    country: job.country ?? null,
    region: job.region ?? null,
    city: job.city ?? null,
    isRemote: Boolean(job.isRemote),
    workplaceType: job.workplaceType ?? null,
    employmentType: job.employmentType ?? null,
    publishedAt: job.publishedAt ? (job.publishedAt instanceof Date ? job.publishedAt.toISOString() : String(job.publishedAt)) : null,
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
 * @summary Maps a database job row to the public API detail contract
 */
export function toJobDetail(job: any) {
  const meta = (job.metadata as any) || {};

  const secondaryLocations: string[] = Array.isArray(meta.secondaryLocations)
    ? meta.secondaryLocations
        .map((loc: any) => (typeof loc === 'string' ? loc : loc?.location ?? loc?.locationName))
        .filter((loc: any): loc is string => Boolean(loc))
    : [];

  return {
    id: job.id,
    ashbyId: job.ashbyId,
    title: job.title,
    applyUrl: job.applyUrl,
    jobUrl: meta.jobUrl || `https://jobs.ashbyhq.com/${job.companySlug}/${job.ashbyId}`,
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
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryInterval: job.salaryInterval ?? null,
    isListed: job.isListed !== false,
    active: Boolean(job.active),
    descriptionHtml: meta.descriptionHtml || '',
    descriptionPlain: meta.descriptionPlain || '',
    team: meta.team || null,
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
