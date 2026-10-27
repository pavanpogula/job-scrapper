/**
 * @file Greenhouse ATS Client & Job Normalizer
 * @summary Implements AtsClient for public Greenhouse Job Board API (v1) with gzip, retry/backoff, 404/429 handling, and pure job normalization
 * @tags ATS, Greenhouse, Normalizer, Client, BF-023, ADR-0021
 */

import axios from 'axios';
import { BROWSER_HEADERS } from '../AshbyClient';
import { toIsoCountry } from '../Country';
import {
  CanonicalUrlOptions,
  decodeHtmlEntities,
  sanitizeJobDescriptionHtml,
  sanitizeJobDescriptionPlain,
  sanitizeJobUrl,
  sanitizeJsonMetadata,
  sanitizeText,
  ValidationIssue,
} from '../Sanitizer';
import {
  AtsClient,
  BoardFetchResult,
  BoardRef,
  CanonicalUrls,
  CompanyMetadataResult,
  NormalizedJob,
  NormalizedPostal,
  NormalizedSalary,
} from './AtsClient';
import {
  classifyFetchFailure,
  computeRetryDelayMs,
  getErrorHeaders,
  getHttpStatus,
  isRetryableError,
  parseRetryAfterSeconds,
} from './http';
import { applyUrl, boardUrl, jobUrl } from './urls';

export interface GreenhouseDepartment {
  id?: number;
  name?: string | null;
  child_ids?: number[];
  parent_id?: number | null;
}

export interface GreenhouseOffice {
  id?: number;
  name?: string | null;
  location?: string | null;
  child_ids?: number[];
  parent_id?: number | null;
}

export interface GreenhouseMetadataEntry {
  id?: number;
  name?: string | null;
  value?: unknown;
  value_type?: string | null;
}

export interface GreenhousePayRange {
  min_cents?: number | null;
  max_cents?: number | null;
  currency_type?: string | null;
  title?: string | null;
  blurb?: string | null;
}

export interface GreenhouseRawJob {
  id: number | string;
  internal_job_id?: number | string | null;
  title: string;
  updated_at?: string | null;
  first_published?: string | null;
  requisition_id?: string | null;
  location?: { name?: string | null } | null;
  absolute_url?: string | null;
  company_name?: string | null;
  content?: string | null;
  departments?: GreenhouseDepartment[] | null;
  offices?: GreenhouseOffice[] | null;
  metadata?: GreenhouseMetadataEntry[] | null;
  pay_input_ranges?: GreenhousePayRange[] | null;
}

const INVALID_ID_VALUES = new Set(['null', 'undefined', 'nan', 'true', 'false', '[object object]']);
const INVALID_ID_CHARS_REGEX = /[\s<>'"\\?#]/;
const HOURLY_INTERVAL_REGEX = /\bhourly\b|per hour/i;
const MULTI_LOCATION_SPLIT_REGEX = /\s*(?:[•;](?:\s*\bor\b)?|,?\s+\bor\b)\s*/i;

const GREENHOUSE_HEADERS = {
  ...BROWSER_HEADERS,
  'Accept-Encoding': 'gzip',
};

/**
 * @summary Builds a canonical Greenhouse job URL from atsToken, preferring the host from absoluteUrl when it is a *.greenhouse.io host
 */
export function buildGreenhouseCanonicalJobUrl(
  atsToken: string,
  externalId: string,
  absoluteUrl?: string | null
): string {
  const cleanToken = encodeURIComponent((atsToken ?? '').trim().toLowerCase());
  const cleanId = encodeURIComponent((externalId ?? '').trim());
  let host = 'job-boards.greenhouse.io';

  if (typeof absoluteUrl === 'string' && absoluteUrl.trim()) {
    try {
      const parsed = new URL(absoluteUrl.trim());
      const hostname = parsed.hostname.toLowerCase();
      if (
        (hostname === 'greenhouse.io' || hostname.endsWith('.greenhouse.io')) &&
        hostname !== 'boards.greenhouse.io'
      ) {
        host = hostname;
      }
    } catch {
      // Fall back to default host
    }
  }

  return `https://${host}/${cleanToken}/jobs/${cleanId}`;
}

/**
 * @summary Splits a Greenhouse location.name string into primary location and deduplicated secondary locations
 */
function parseGreenhouseLocations(rawLocationName: unknown): {
  location: string;
  secondaryLocations: string[];
} {
  if (typeof rawLocationName !== 'string') {
    return { location: '', secondaryLocations: [] };
  }

  const cleaned = sanitizeText(rawLocationName);
  if (!cleaned || cleaned.toLowerCase() === 'n/a') {
    return { location: '', secondaryLocations: [] };
  }

  const segments = cleaned
    .split(MULTI_LOCATION_SPLIT_REGEX)
    .map((s) => sanitizeText(s))
    .filter((s) => s.length > 0 && s.toLowerCase() !== 'n/a');

  if (segments.length === 0) {
    return { location: '', secondaryLocations: [] };
  }

  const primary = segments[0];
  const seen = new Set<string>([primary]);
  const secondary: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!seen.has(seg)) {
      seen.add(seg);
      secondary.push(seg);
    }
  }

  return { location: primary, secondaryLocations: secondary };
}

/**
 * @summary Parses the first non-null offices[].location from the right into country, region, city, and postal object
 */
function parseGreenhouseOfficePostal(offices: GreenhouseOffice[] | null | undefined): {
  postal: NormalizedPostal | null;
  country: string | null;
  region: string | null;
  city: string | null;
} {
  if (!Array.isArray(offices)) {
    return { postal: null, country: null, region: null, city: null };
  }

  const firstWithLoc = offices.find(
    (o) =>
      o &&
      typeof o.location === 'string' &&
      o.location.trim().length > 0 &&
      o.location.trim().toLowerCase() !== 'n/a'
  );

  if (!firstWithLoc || typeof firstWithLoc.location !== 'string') {
    return { postal: null, country: null, region: null, city: null };
  }

  const parts = firstWithLoc.location
    .split(',')
    .map((p) => sanitizeText(p))
    .filter((p) => p.length > 0);

  if (parts.length === 0) {
    return { postal: null, country: null, region: null, city: null };
  }

  const lastPart = parts[parts.length - 1];
  const country = toIsoCountry(lastPart);
  const city = parts.length >= 2 ? parts[0] : null;
  const region = parts.length >= 3 ? parts.slice(1, parts.length - 1).join(', ') : null;

  if (!country && !region && !city) {
    return { postal: null, country: null, region: null, city: null };
  }

  const postal: NormalizedPostal = {};
  if (country) postal.addressCountry = country;
  if (region) postal.addressRegion = region;
  if (city) postal.addressLocality = city;

  return { postal, country, region, city };
}

/**
 * @summary Extracts Workplace Type from Greenhouse custom metadata[] entries if present
 */
function extractMetadataWorkplaceType(
  metadata: GreenhouseMetadataEntry[] | null | undefined
): 'Remote' | 'Hybrid' | 'OnSite' | null {
  if (!Array.isArray(metadata)) return null;

  const entry = metadata.find(
    (m) => m && typeof m.name === 'string' && m.name.trim().toLowerCase() === 'workplace type'
  );
  if (!entry || entry.value === null || entry.value === undefined) return null;

  const rawVal = Array.isArray(entry.value)
    ? typeof entry.value[0] === 'string'
      ? entry.value[0]
      : ''
    : typeof entry.value === 'string'
    ? entry.value
    : '';

  const normalized = rawVal.trim().toLowerCase();
  if (normalized === 'remote') return 'Remote';
  if (normalized === 'hybrid') return 'Hybrid';
  if (normalized === 'on-site' || normalized === 'onsite' || normalized === 'on site') {
    return 'OnSite';
  }
  return null;
}

/**
 * @summary Infers employmentType from job title when explicit ATS field is absent
 */
function inferEmploymentTypeFromTitle(title: string): string | null {
  if (/\bintern(ship)?\b/i.test(title)) return 'Intern';
  if (/\bcontract(or)?\b/i.test(title)) return 'Contract';
  if (/\bpart[- ]time\b/i.test(title)) return 'PartTime';
  return null;
}

/**
 * @summary Extracts salary from the first Greenhouse pay_input_ranges entry (cents -> units, hourly vs yearly interval)
 */
function extractGreenhouseSalary(
  ranges: GreenhousePayRange[] | null | undefined
): NormalizedSalary {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return { min: null, max: null, currency: null, interval: null };
  }

  const first = ranges[0];
  if (!first || typeof first !== 'object') {
    return { min: null, max: null, currency: null, interval: null };
  }

  const min =
    typeof first.min_cents === 'number' && Number.isFinite(first.min_cents)
      ? first.min_cents / 100
      : null;
  const max =
    typeof first.max_cents === 'number' && Number.isFinite(first.max_cents)
      ? first.max_cents / 100
      : null;

  if (min === null && max === null) {
    return { min: null, max: null, currency: null, interval: null };
  }

  const currency =
    typeof first.currency_type === 'string' && first.currency_type.trim().length > 0
      ? first.currency_type.trim()
      : null;

  const titleMatchesHourly =
    typeof first.title === 'string' && HOURLY_INTERVAL_REGEX.test(first.title);
  const blurbMatchesHourly =
    !titleMatchesHourly &&
    typeof first.blurb === 'string' &&
    HOURLY_INTERVAL_REGEX.test(first.blurb);

  const interval = titleMatchesHourly || blurbMatchesHourly ? '1 HOUR' : '1 YEAR';

  return { min, max, currency, interval };
}

/**
 * @summary Pure normalizer converting a Greenhouse raw job payload into a source-agnostic NormalizedJob
 */
export function normalizeGreenhouseJob(
  raw: GreenhouseRawJob,
  ref: BoardRef,
  issues: ValidationIssue[] = []
): NormalizedJob | null {
  if (!raw || typeof raw !== 'object') {
    issues.push({
      companySlug: ref.slug,
      jobId: 'unknown',
      field: 'job',
      reason: 'Job entry is null or not an object',
      action: 'filtered',
    });
    return null;
  }

  const externalId =
    typeof raw.id === 'string' ? raw.id.trim() : String(raw.id ?? '').trim();
  if (
    !externalId ||
    externalId.length > 128 ||
    INVALID_ID_VALUES.has(externalId.toLowerCase()) ||
    INVALID_ID_CHARS_REGEX.test(externalId)
  ) {
    issues.push({
      companySlug: ref.slug,
      jobId: externalId || 'missing',
      field: 'id',
      reason: `Invalid or missing job id "${externalId.slice(0, 40)}"`,
      action: 'filtered',
    });
    return null;
  }

  const cleanTitle = sanitizeText(raw.title);
  if (!cleanTitle || INVALID_ID_VALUES.has(cleanTitle.toLowerCase())) {
    issues.push({
      companySlug: ref.slug,
      jobId: externalId,
      field: 'title',
      reason: 'Job title is empty or placeholder after sanitization',
      action: 'filtered',
    });
    return null;
  }

  const legacyKey = `greenhouse:${externalId}`;
  const department = sanitizeText(raw.departments?.[0]?.name ?? '');
  const { location, secondaryLocations } = parseGreenhouseLocations(raw.location?.name);
  const { postal, country, region, city } = parseGreenhouseOfficePostal(raw.offices);

  const metaWorkplace = extractMetadataWorkplaceType(raw.metadata);
  const rawLocationString = typeof raw.location?.name === 'string' ? raw.location.name : '';
  const isRemote =
    /\bremote\b/i.test(rawLocationString) ||
    /\bremote\b/i.test(cleanTitle) ||
    metaWorkplace === 'Remote';
  const workplaceType = metaWorkplace ?? (isRemote ? 'Remote' : null);
  const employmentType = inferEmploymentTypeFromTitle(cleanTitle);

  const parsedPublished = raw.first_published ? new Date(raw.first_published) : null;
  const publishedAt =
    parsedPublished && !Number.isNaN(parsedPublished.getTime()) ? parsedPublished : null;

  const salary = extractGreenhouseSalary(raw.pay_input_ranges);

  const rawContent = typeof raw.content === 'string' ? raw.content : '';
  const unescapedHtml = decodeHtmlEntities(rawContent);
  const descriptionHtml = sanitizeJobDescriptionHtml(unescapedHtml);
  const descriptionPlain = sanitizeJobDescriptionPlain(undefined, descriptionHtml);

  const cleanToken = (ref.atsToken || ref.slug).trim().toLowerCase();
  const urlOptions: CanonicalUrlOptions = {
    baseUrl: 'https://job-boards.greenhouse.io',
    sourceName: 'Greenhouse',
    fallbackUrl: (_slug, jobId) =>
      buildGreenhouseCanonicalJobUrl(cleanToken, jobId, raw.absolute_url),
  };

  const cleanJobUrl = sanitizeJobUrl(
    raw.absolute_url,
    ref.slug,
    externalId,
    false,
    (reason) => {
      issues.push({
        companySlug: ref.slug,
        jobId: externalId,
        field: 'jobUrl',
        reason,
        action: 'sanitized',
      });
    },
    urlOptions
  );

  const cleanApplyUrl = sanitizeJobUrl(
    raw.absolute_url,
    ref.slug,
    externalId,
    true,
    (reason) => {
      issues.push({
        companySlug: ref.slug,
        jobId: externalId,
        field: 'applyUrl',
        reason,
        action: 'sanitized',
      });
    },
    urlOptions
  );

  const metadataPayload: Record<string, unknown> = {
    descriptionHtml,
    descriptionPlain,
    jobUrl: cleanJobUrl,
    team: null,
    secondaryLocations,
    _source: 'rest',
    _ats: 'greenhouse',
    _normVersion: 1,
    updated_at: raw.updated_at ?? null,
    departments: Array.isArray(raw.departments) ? raw.departments : [],
    offices: Array.isArray(raw.offices) ? raw.offices : [],
    metadata: Array.isArray(raw.metadata) ? raw.metadata : null,
  };

  const sanitizedRaw =
    (sanitizeJsonMetadata(metadataPayload) as Record<string, unknown> | null) || {};
  delete sanitizedRaw.content;

  return {
    externalId,
    legacyKey,
    title: cleanTitle,
    department,
    location,
    employmentType,
    applyUrl: cleanApplyUrl,
    jobUrl: cleanJobUrl,
    isRemote,
    workplaceType,
    isListed: true,
    publishedAt,
    sourceUpdatedAt: null,
    postal,
    salary,
    descriptionHtml,
    descriptionPlain,
    team: null,
    secondaryLocations,
    country,
    region,
    city,
    raw: sanitizedRaw,
  };
}

/**
 * @summary Greenhouse ATS client implementation behind the AtsClient interface
 */
export class GreenhouseClient implements AtsClient {
  public readonly source = 'greenhouse' as const;

  /**
   * @summary Fetches all active jobs from a Greenhouse board with retry/backoff, 404/429 handling, and normalization
   */
  public async fetchBoard(
    ref: BoardRef,
    opts?: { includeCompensation?: boolean; maxRetries?: number; baseDelayMs?: number }
  ): Promise<BoardFetchResult> {
    const { maxRetries = 2, baseDelayMs = 300 } = opts ?? {};
    const token = encodeURIComponent(ref.atsToken.trim().toLowerCase());
    const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true&pay_transparency=true`;

    let lastError: unknown = null;
    let sawRateLimit = false;
    let attemptsCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attemptsCount = attempt + 1;
      try {
        const { data } = await axios.get<{ jobs?: GreenhouseRawJob[] }>(url, {
          timeout: 15000,
          headers: GREENHOUSE_HEADERS,
        });

        const rawJobs = data?.jobs;
        const validationIssues: ValidationIssue[] = [];
        const normalizedJobs: NormalizedJob[] = [];

        if (!Array.isArray(rawJobs)) {
          validationIssues.push({
            companySlug: ref.slug,
            jobId: 'batch',
            field: 'jobs',
            reason: 'Jobs payload is not an array',
            action: 'filtered',
          });
        } else {
          const seenIds = new Set<string>();
          for (const rawJob of rawJobs) {
            const rawId =
              rawJob && typeof rawJob === 'object' ? String(rawJob.id ?? '').trim() : '';
            if (rawId && seenIds.has(rawId)) {
              validationIssues.push({
                companySlug: ref.slug,
                jobId: rawId,
                field: 'id',
                reason: 'Duplicate job ID in same company board response',
                action: 'filtered',
              });
              continue;
            }
            const normalized = normalizeGreenhouseJob(rawJob, ref, validationIssues);
            if (!normalized) continue;
            seenIds.add(normalized.externalId);
            normalizedJobs.push(normalized);
          }
        }

        return {
          slug: ref.slug,
          source: 'greenhouse',
          jobs: normalizedJobs,
          notFound: false,
          rateLimited: sawRateLimit,
          fetchMode: 'primary',
          validationIssues,
        };
      } catch (err: unknown) {
        lastError = err;
        const status = getHttpStatus(err);
        if (status === 429) {
          sawRateLimit = true;
        }

        if (attempt < maxRetries && isRetryableError(err)) {
          const delay = computeRetryDelayMs(
            attempt,
            baseDelayMs,
            status,
            getErrorHeaders(err)
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    const status = getHttpStatus(lastError);
    if (status === 404) {
      return {
        slug: ref.slug,
        source: 'greenhouse',
        jobs: [],
        notFound: true,
        rateLimited: sawRateLimit,
        fetchMode: 'none',
      };
    }

    const failure = classifyFetchFailure(lastError, attemptsCount);
    return {
      slug: ref.slug,
      source: 'greenhouse',
      jobs: [],
      notFound: false,
      rateLimited: sawRateLimit,
      fetchMode: 'none',
      failure,
    };
  }

  /**
   * @summary Fetches company display name from Greenhouse board info endpoint GET /v1/boards/{token}
   */
  public async fetchCompanyMetadata(ref: BoardRef): Promise<CompanyMetadataResult> {
    const token = encodeURIComponent(ref.atsToken.trim().toLowerCase());
    const url = `https://boards-api.greenhouse.io/v1/boards/${token}`;

    try {
      const { data } = await axios.get<{ name?: string | null }>(url, {
        timeout: 10000,
        headers: GREENHOUSE_HEADERS,
      });

      const name =
        typeof data?.name === 'string' && data.name.trim().length > 0
          ? sanitizeText(data.name)
          : undefined;

      return {
        status: 'ok',
        name,
        logoUrl: undefined,
      };
    } catch (err: unknown) {
      const status = getHttpStatus(err);
      if (status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(getErrorHeaders(err), 10);
        return { status: 'rate_limited', retryAfterSeconds };
      }
      if (status === 404) {
        return { status: 'not_found' };
      }
      return { status: 'error' };
    }
  }

  /**
   * @summary Builds canonical URL set for a Greenhouse job and board from atsToken (never from gh-- slug)
   */
  public canonicalUrls(
    ref: BoardRef,
    externalId: string,
    absoluteUrl?: string | null
  ): CanonicalUrls {
    const canonicalJob = absoluteUrl
      ? buildGreenhouseCanonicalJobUrl(ref.atsToken, externalId, absoluteUrl)
      : jobUrl('greenhouse', ref.atsToken, externalId);
    const canonicalApply = absoluteUrl
      ? buildGreenhouseCanonicalJobUrl(ref.atsToken, externalId, absoluteUrl)
      : applyUrl('greenhouse', ref.atsToken, externalId);
    return {
      jobUrl: canonicalJob,
      applyUrl: canonicalApply,
      boardUrl: boardUrl('greenhouse', ref.atsToken),
    };
  }
}
