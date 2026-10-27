/**
 * @file Ashby ATS Client Adapter
 * @summary Implements AtsClient for Ashby job boards, wrapping fetchAshbyBoardWithFallback and normalizing jobs
 * @tags ATS, Ashby, Adapter, Normalizer, ADR-0021
 */

import {
  AshbyJob,
  extractSalary,
  fetchAshbyBoardWithFallback,
  fetchOrganizationMetadata,
} from '../AshbyClient';
import { toIsoCountry } from '../Country';
import { sanitizeJobUrl, sanitizeJsonMetadata, sanitizeText } from '../Sanitizer';
import {
  AtsClient,
  BoardFetchResult,
  BoardRef,
  CanonicalUrls,
  CompanyMetadataResult,
  NormalizedJob,
} from './AtsClient';
import { applyUrl, boardUrl, jobUrl } from './urls';

/**
 * @summary Pure normalizer converting an AshbyJob payload to a normalized source-agnostic job model
 */
export function normalizeAshbyJob(
  job: AshbyJob,
  companySlug: string,
  source: 'rest' | 'graphql' = 'rest'
): NormalizedJob | null {
  const cleanTitle = sanitizeText(job.title);
  if (!cleanTitle || !job.id) {
    return null;
  }

  const cleanDept = sanitizeText(job.department);
  const cleanLoc = sanitizeText(job.location);
  const salary = extractSalary(job);
  const cleanApplyUrl = sanitizeJobUrl(job.applyUrl, companySlug, job.id, true);
  const cleanJobUrl = sanitizeJobUrl(job.jobUrl, companySlug, job.id, false);
  const cleanMetadata =
    (sanitizeJsonMetadata(job) as Record<string, unknown> | null) || {};
  cleanMetadata._source = source;
  const postal = job.address?.postalAddress as
    | {
        addressCountry?: string;
        addressRegion?: string;
        addressLocality?: string;
        [key: string]: unknown;
      }
    | undefined;
  const parsedPublishedAt = job.publishedAt ? new Date(job.publishedAt) : null;
  const validPublishedAt =
    parsedPublishedAt && !isNaN(parsedPublishedAt.getTime())
      ? parsedPublishedAt
      : null;
  const parsedUpdatedAt = job.updatedAt ? new Date(job.updatedAt) : null;
  const validUpdatedAt =
    parsedUpdatedAt && !isNaN(parsedUpdatedAt.getTime())
      ? parsedUpdatedAt
      : null;
  const cleanCountry = toIsoCountry(postal?.addressCountry);
  const cleanRegion = postal?.addressRegion
    ? sanitizeText(postal.addressRegion)
    : null;
  const cleanCity = postal?.addressLocality
    ? sanitizeText(postal.addressLocality)
    : null;

  return {
    externalId: job.id,
    legacyKey: job.id,
    title: cleanTitle,
    department: cleanDept || null,
    location: cleanLoc || null,
    employmentType: job.employmentType ?? null,
    applyUrl: cleanApplyUrl,
    jobUrl: cleanJobUrl,
    isRemote: Boolean(job.isRemote),
    workplaceType: job.workplaceType ?? null,
    isListed: job.isListed !== false,
    publishedAt: validPublishedAt,
    sourceUpdatedAt: validUpdatedAt,
    postal: postal ?? null,
    salary: {
      min: salary.min ?? null,
      max: salary.max ?? null,
      currency: salary.currency ?? null,
      interval: salary.interval ?? null,
    },
    descriptionHtml:
      (cleanMetadata?.descriptionHtml as string | undefined) ||
      job.descriptionHtml ||
      '',
    descriptionPlain:
      (cleanMetadata?.descriptionPlain as string | undefined) ||
      job.descriptionPlain ||
      '',
    team: (cleanMetadata?.team as string | undefined) || job.team || null,
    secondaryLocations:
      job.secondaryLocations ||
      (cleanMetadata?.secondaryLocations as Array<{ location?: string } | string> | undefined) ||
      [],
    country: cleanCountry,
    region: cleanRegion,
    city: cleanCity,
    raw: cleanMetadata,
  };
}

/**
 * @summary Ashby ATS client implementation behind the AtsClient interface
 */
export class AshbyAtsClient implements AtsClient {
  public readonly source = 'ashby' as const;

  /**
   * @summary Fetches active job postings from an Ashby board and normalizes all records
   */
  public async fetchBoard(
    ref: BoardRef,
    opts?: { includeCompensation?: boolean; maxRetries?: number; baseDelayMs?: number }
  ): Promise<BoardFetchResult> {
    const rawResult = await fetchAshbyBoardWithFallback(ref.atsToken, opts);

    const fetchMode: 'primary' | 'fallback' | 'none' =
      rawResult.source === 'rest'
        ? 'primary'
        : rawResult.source === 'graphql'
        ? 'fallback'
        : 'none';

    const normalizedJobs: NormalizedJob[] = [];
    const sourceMode = rawResult.source === 'graphql' ? 'graphql' : 'rest';

    for (const job of rawResult.jobs) {
      const normalized = normalizeAshbyJob(job, ref.slug, sourceMode);
      if (normalized) {
        normalizedJobs.push(normalized);
      }
    }

    return {
      slug: ref.slug,
      source: 'ashby',
      jobs: normalizedJobs,
      notFound: rawResult.notFound,
      rateLimited: rawResult.rateLimited,
      fetchMode,
      validationIssues: rawResult.validationIssues,
      failure: rawResult.failure,
    };
  }

  /**
   * @summary Fetches company organization metadata (name, logo) from Ashby hosted careers page
   */
  public async fetchCompanyMetadata(
    ref: BoardRef
  ): Promise<CompanyMetadataResult> {
    return fetchOrganizationMetadata(ref.atsToken);
  }

  /**
   * @summary Builds canonical URL set for an Ashby job and board
   */
  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: jobUrl('ashby', ref.atsToken, externalId),
      applyUrl: applyUrl('ashby', ref.atsToken, externalId),
      boardUrl: boardUrl('ashby', ref.atsToken),
    };
  }
}
