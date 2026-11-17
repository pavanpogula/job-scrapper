/**
 * @file Lever ATS Client & Job Normalizer
 * @summary Implements AtsClient for public Lever Postings API (v0) with global pacing, retry/backoff, status-based 404/429 handling, and pure job normalization
 * @tags ATS, Lever, Normalizer, Client, Pacer, BF-024, ADR-0022
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
import { inferEmploymentTypeFromTitle, parsePlace } from './place';
import { applyUrl, boardUrl, jobUrl } from './urls';

export interface LeverCategories {
  team?: string | null;
  department?: string | null;
  location?: string | null;
  allLocations?: string[] | null;
  commitment?: string | null;
}

export interface LeverList {
  text?: string | null;
  content?: string | null;
}

export interface LeverSalaryRange {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  interval?: string | null;
}

export interface LeverPosting {
  id?: string | null;
  text?: string | null;
  categories?: LeverCategories | null;
  country?: string | null;
  workplaceType?: string | null;
  createdAt?: number | null;
  description?: string | null;
  descriptionPlain?: string | null;
  opening?: string | null;
  openingPlain?: string | null;
  descriptionBody?: string | null;
  descriptionBodyPlain?: string | null;
  lists?: LeverList[] | null;
  additional?: string | null;
  additionalPlain?: string | null;
  salaryRange?: LeverSalaryRange | null;
  salaryDescription?: string | null;
  salaryDescriptionPlain?: string | null;
  hostedUrl?: string | null;
  applyUrl?: string | null;
}

export interface LeverClientOptions {
  minIntervalMs?: number;
  initialDelayMs?: number;
  timeoutMs?: number;
}

export type LeverSiteValidationStatus = 'live' | 'empty' | 'not_found' | 'dead_board' | 'error';

const INVALID_ID_VALUES = new Set(['null', 'undefined', 'nan', 'true', 'false', '[object object]']);
const INVALID_ID_CHARS_REGEX = /[\s<>'"\\?#]/;

const LEVER_HTML_HEADERS = {
  ...BROWSER_HEADERS,
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};

const LEVER_LOGO_HOST_REGEX = /^lever-client-logos\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/;

/**
 * @summary Escapes HTML special characters for plain-text headings injected into Lever job descriptions
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @summary Maps Lever commitment strings (or falls back to title heuristics) to normalized employmentType values
 */
function mapLeverCommitment(commitment: string | null | undefined, title: string): string | null {
  const raw = typeof commitment === 'string' ? commitment.trim() : '';
  if (raw) {
    if (/\bintern(ship)?s?\b|scholarship/i.test(raw)) return 'Intern';
    if (/\btemp\b|temporary|seasonal|fixed[- ]?term|short[- ]?term/i.test(raw)) return 'Temporary';
    if (/contract|freelance/i.test(raw)) return 'Contract';
    if (/full[- ]?time|permanent/i.test(raw)) return 'FullTime';
    if (/part[- ]?time|\bpt\b/i.test(raw)) return 'PartTime';
  }
  return inferEmploymentTypeFromTitle(title);
}

/**
 * @summary Maps Lever salaryRange into NormalizedSalary without dividing amounts by 100
 */
function extractLeverSalary(range: LeverSalaryRange | null | undefined): NormalizedSalary {
  const empty: NormalizedSalary = { min: null, max: null, currency: null, interval: null };
  if (!range || typeof range !== 'object') return empty;

  let interval: string | null = null;
  switch (range.interval) {
    case 'per-year-salary':
      interval = '1 YEAR';
      break;
    case 'per-month-salary':
      interval = '1 MONTH';
      break;
    case 'per-hour-wage':
      interval = '1 HOUR';
      break;
    default:
      return empty;
  }

  const min = typeof range.min === 'number' && Number.isFinite(range.min) ? range.min : null;
  const max = typeof range.max === 'number' && Number.isFinite(range.max) ? range.max : null;

  if (min === null && max === null) {
    return empty;
  }

  const currency =
    typeof range.currency === 'string' && range.currency.trim().length > 0
      ? range.currency.trim()
      : null;

  return { min, max, currency, interval };
}

/**
 * @summary Combines Lever description, lists[], salaryDescription, and additional into sanitized HTML without entity-unescaping
 */
function buildLeverDescriptionHtml(raw: LeverPosting): string {
  const sections: string[] = [];

  if (typeof raw.description === 'string' && raw.description.trim()) {
    sections.push(raw.description.trim());
  }

  if (Array.isArray(raw.lists)) {
    for (const list of raw.lists) {
      if (!list || typeof list !== 'object') continue;
      const heading =
        typeof list.text === 'string' && list.text.trim()
          ? `<h3>${escapeHtml(list.text.trim())}</h3>`
          : '';
      const rawContent = typeof list.content === 'string' ? list.content.trim() : '';
      const wrappedContent = rawContent
        ? rawContent.toLowerCase().startsWith('<li')
          ? `<ul>${rawContent}</ul>`
          : rawContent
        : '';
      const combined = `${heading}${wrappedContent}`;
      if (combined) {
        sections.push(combined);
      }
    }
  }

  if (typeof raw.salaryDescription === 'string' && raw.salaryDescription.trim()) {
    sections.push(raw.salaryDescription.trim());
  }

  if (typeof raw.additional === 'string' && raw.additional.trim()) {
    sections.push(raw.additional.trim());
  }

  return sanitizeJobDescriptionHtml(sections.join('\n'));
}

/**
 * @summary Resolves Lever workplaceType ('Remote' | 'Hybrid' | 'OnSite' | null) and isRemote flag
 */
function resolveLeverWorkplace(
  rawWorkplaceType: unknown,
  location: string,
  commitment: string
): { workplaceType: 'Remote' | 'Hybrid' | 'OnSite' | null; isRemote: boolean } {
  const normalizedWt =
    typeof rawWorkplaceType === 'string' ? rawWorkplaceType.trim().toLowerCase() : '';
  const isRemote =
    normalizedWt === 'remote' ||
    /\bremote\b/i.test(location) ||
    /\bremote\b/i.test(commitment);

  if (normalizedWt === 'remote') return { workplaceType: 'Remote', isRemote };
  if (normalizedWt === 'hybrid') return { workplaceType: 'Hybrid', isRemote };
  if (normalizedWt === 'onsite' || normalizedWt === 'on-site') {
    return { workplaceType: 'OnSite', isRemote };
  }

  return {
    workplaceType: isRemote ? 'Remote' : null,
    isRemote,
  };
}

/**
 * @summary Pure normalizer converting a raw Lever posting into a source-agnostic NormalizedJob
 */
export function normalizeLeverJob(
  raw: LeverPosting,
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

  const externalId = typeof raw.id === 'string' ? raw.id.trim() : String(raw.id ?? '').trim();
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

  const cleanTitle = sanitizeText(raw.text);
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

  const legacyKey = `lever:${externalId}`;
  const rawDept = sanitizeText(raw.categories?.department ?? '');
  const rawTeam = sanitizeText(raw.categories?.team ?? '');
  const department = rawDept || rawTeam || '';
  const team = rawDept ? rawTeam || null : null;

  const rawLoc = sanitizeText(raw.categories?.location ?? '');
  const allLocations = Array.isArray(raw.categories?.allLocations)
    ? raw.categories.allLocations
        .map((loc) => sanitizeText(loc))
        .filter((loc) => loc.length > 0)
    : [];
  const location = rawLoc || allLocations[0] || '';

  const seenSec = new Set<string>(location ? [location] : []);
  const secondaryLocations: Array<{ location: string }> = [];
  for (const loc of allLocations) {
    if (!seenSec.has(loc)) {
      seenSec.add(loc);
      secondaryLocations.push({ location: loc });
    }
  }

  const parsedPlace = parsePlace(location);
  const explicitCountry = typeof raw.country === 'string' ? toIsoCountry(raw.country) : null;
  const country = explicitCountry ?? parsedPlace.country;
  const region = parsedPlace.region;
  const city = parsedPlace.city;
  let postal: NormalizedPostal | null = null;
  if (country || region || city) {
    postal = {};
    if (country) postal.addressCountry = country;
    if (region) postal.addressRegion = region;
    if (city) postal.addressLocality = city;
  }

  const rawCommitment = sanitizeText(raw.categories?.commitment ?? '');
  const { workplaceType, isRemote } = resolveLeverWorkplace(raw.workplaceType, location, rawCommitment);
  const employmentType = mapLeverCommitment(rawCommitment, cleanTitle);

  const createdAtNum =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : null;
  const parsedDate = createdAtNum !== null ? new Date(createdAtNum) : null;
  const publishedAt =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

  const salary = extractLeverSalary(raw.salaryRange);
  const descriptionHtml = buildLeverDescriptionHtml(raw);
  const descriptionPlain = sanitizeJobDescriptionPlain(undefined, descriptionHtml);

  const canonicalJobFallback = jobUrl('lever', ref.atsToken, externalId);
  const canonicalApplyFallback = applyUrl('lever', ref.atsToken, externalId);
  const urlOptions: CanonicalUrlOptions = {
    baseUrl: 'https://jobs.lever.co',
    sourceName: 'Lever',
    fallbackUrl: (_slug, _jobId, isApply) =>
      isApply ? canonicalApplyFallback : canonicalJobFallback,
  };

  const cleanJobUrl = sanitizeJobUrl(
    raw.hostedUrl,
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
    raw.applyUrl,
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
    team,
    secondaryLocations,
    _source: 'rest',
    _ats: 'lever',
    _normVersion: 1,
    categories: raw.categories ?? null,
    country: raw.country ?? null,
    workplaceType: raw.workplaceType ?? null,
    createdAt: createdAtNum,
  };

  const sanitizedRaw =
    (sanitizeJsonMetadata(metadataPayload) as Record<string, unknown> | null) || {};

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
    descriptionHtml: (sanitizedRaw.descriptionHtml as string | undefined) ?? descriptionHtml,
    descriptionPlain: (sanitizedRaw.descriptionPlain as string | undefined) ?? descriptionPlain,
    team: (sanitizedRaw.team as string | null | undefined) ?? team,
    secondaryLocations:
      (sanitizedRaw.secondaryLocations as Array<{ location: string }> | undefined) ??
      secondaryLocations,
    country,
    region,
    city,
    raw: sanitizedRaw,
  };
}

/**
 * @summary Extracts the header company logo from Lever hosted board HTML, ignoring og:image banners
 */
export function extractLeverLogo(html: string): string | undefined {
  if (!html || typeof html !== 'string') return undefined;

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const altMatch = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const rawAlt = altMatch?.[1] ?? altMatch?.[2];
    if (!rawAlt) continue;

    const alt = decodeHtmlEntities(rawAlt).trim().toLowerCase();
    if (!alt.endsWith(' logo')) continue;

    const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const rawSrc = srcMatch?.[1] ?? srcMatch?.[2];
    if (!rawSrc) continue;

    try {
      const parsed = new URL(decodeHtmlEntities(rawSrc.trim()));
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'https:' && LEVER_LOGO_HOST_REGEX.test(host)) {
        return parsed.toString();
      }
    } catch {
      // Invalid URL: continue searching remaining <img> tags
    }
  }

  return undefined;
}

/**
 * @summary Extracts and sanitizes the HTML <title> text from a Lever hosted board page
 */
function extractLeverTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return undefined;
  const decoded = decodeHtmlEntities(match[1]);
  const clean = sanitizeText(decoded);
  return clean.length > 0 ? clean : undefined;
}

/**
 * @summary Lever ATS client implementation behind the AtsClient interface with global request-start pacing
 */
export class LeverClient implements AtsClient {
  public readonly source = 'lever' as const;
  private readonly minIntervalMs: number;
  private readonly initialDelayMs: number;
  private readonly timeoutMs: number;
  private paceChain: Promise<void> = Promise.resolve();
  private lastStartMs: number | null = null;

  constructor(options: LeverClientOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.initialDelayMs = options.initialDelayMs ?? 0;
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  /**
   * @summary Serializes every Lever request start so starts are spaced by at least minIntervalMs after an initialDelayMs delay
   */
  private pace(): Promise<void> {
    const next = this.paceChain.then(async () => {
      if (this.lastStartMs === null) {
        if (this.initialDelayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, this.initialDelayMs));
        }
        this.lastStartMs = Date.now();
        return;
      }

      const elapsed = Date.now() - this.lastStartMs;
      const waitMs = Math.max(0, this.minIntervalMs - elapsed);
      if (waitMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      }
      this.lastStartMs = Date.now();
    });

    this.paceChain = next.catch(() => {});
    return next;
  }

  /**
   * @summary Fetches all active jobs from a Lever board with pacing, retry/backoff, status-based 404/429 handling, and normalization
   */
  public async fetchBoard(
    ref: BoardRef,
    opts?: { includeCompensation?: boolean; maxRetries?: number; baseDelayMs?: number }
  ): Promise<BoardFetchResult> {
    const { maxRetries = 2, baseDelayMs = 300 } = opts ?? {};
    const token = encodeURIComponent(ref.atsToken.trim());
    const url = `https://api.lever.co/v0/postings/${token}?mode=json`;

    let lastError: unknown = null;
    let sawRateLimit = false;
    let attemptsCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attemptsCount = attempt + 1;
      await this.pace();

      try {
        const { data } = await axios.get<unknown>(url, {
          timeout: this.timeoutMs,
          headers: BROWSER_HEADERS,
        });

        if (!Array.isArray(data)) {
          return {
            slug: ref.slug,
            source: 'lever',
            jobs: [],
            notFound: false,
            rateLimited: sawRateLimit,
            fetchMode: 'none',
            failure: {
              kind: 'http',
              status: 200,
              code: 'unexpected_body',
              attempts: attemptsCount,
            },
          };
        }

        const validationIssues: ValidationIssue[] = [];
        const normalizedJobs: NormalizedJob[] = [];
        const seenIds = new Set<string>();

        for (const rawPosting of data as LeverPosting[]) {
          const rawId =
            rawPosting && typeof rawPosting === 'object' ? String(rawPosting.id ?? '').trim() : '';
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

          const normalized = normalizeLeverJob(rawPosting, ref, validationIssues);
          if (!normalized) continue;
          seenIds.add(normalized.externalId);
          normalizedJobs.push(normalized);
        }

        return {
          slug: ref.slug,
          source: 'lever',
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
        source: 'lever',
        jobs: [],
        notFound: true,
        rateLimited: sawRateLimit,
        fetchMode: 'none',
      };
    }

    const failure = classifyFetchFailure(lastError, attemptsCount);
    return {
      slug: ref.slug,
      source: 'lever',
      jobs: [],
      notFound: false,
      rateLimited: sawRateLimit,
      fetchMode: 'none',
      failure,
    };
  }

  /**
   * @summary Validates whether a Lever token has at least one posting and a live hosted board page (rejecting dead boards)
   */
  public async validateSite(token: string): Promise<LeverSiteValidationStatus> {
    const cleanToken = encodeURIComponent(token.trim());
    const apiUrl = `https://api.lever.co/v0/postings/${cleanToken}?mode=json&limit=1`;

    await this.pace();
    try {
      const { data } = await axios.get<unknown>(apiUrl, {
        timeout: this.timeoutMs,
        headers: BROWSER_HEADERS,
      });
      if (!Array.isArray(data)) {
        return 'error';
      }
      if (data.length === 0) {
        return 'empty';
      }
    } catch (err: unknown) {
      const status = getHttpStatus(err);
      if (status === 404) return 'not_found';
      return 'error';
    }

    const boardPageUrl = `https://jobs.lever.co/${cleanToken}`;
    await this.pace();
    try {
      const res = await axios.get<string>(boardPageUrl, {
        timeout: this.timeoutMs,
        headers: LEVER_HTML_HEADERS,
        responseType: 'text',
      });
      const status = (res as { status?: number } | undefined)?.status ?? 200;
      if (status === 200) {
        return 'live';
      }
      return 'error';
    } catch (err: unknown) {
      const status = getHttpStatus(err);
      if (status === 404) return 'dead_board';
      return 'error';
    }
  }

  /**
   * @summary Fetches company name and logo from the Lever hosted board page HTML
   */
  public async fetchCompanyMetadata(
    ref: BoardRef,
    opts?: { includeLogo?: boolean }
  ): Promise<CompanyMetadataResult> {
    const token = encodeURIComponent(ref.atsToken.trim());
    const pageUrl = `https://jobs.lever.co/${token}`;

    await this.pace();
    try {
      const { data: html } = await axios.get<string>(pageUrl, {
        timeout: this.timeoutMs,
        headers: LEVER_HTML_HEADERS,
        responseType: 'text',
      });

      if (typeof html !== 'string') {
        return { status: 'error' };
      }

      const name = extractLeverTitle(html);
      const logoUrl = opts?.includeLogo === false ? undefined : extractLeverLogo(html);
      return {
        status: 'ok',
        name,
        logoUrl,
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
   * @summary Builds canonical URL set for a Lever job and board from atsToken (never from lv-- slug)
   */
  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: jobUrl('lever', ref.atsToken, externalId),
      applyUrl: applyUrl('lever', ref.atsToken, externalId),
      boardUrl: boardUrl('lever', ref.atsToken),
    };
  }
}
