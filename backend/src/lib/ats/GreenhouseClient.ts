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

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'district of columbia', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
  'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
  'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming',
];
const US_STATE_NAME_SET = new Set(US_STATE_NAMES);
const CA_PROVINCE_CODE_SET = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const US_MARKER_REGEX = /^(?:us|usa|u\.s\.a?\.?|united states)$/i;
const US_STATE_CODE_SET = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);
// Case-sensitive codes so the English word "us" never matches
const US_TEXT_REGEX = /\b(?:[Uu]nited [Ss]tates|USA|US)\b|\bU\.S\./;

/**
 * @summary True when a place part is a US state: an upper-case 2-letter code ("CA", "IL") or a full state name
 */
function isUsState(part: string, allowName: boolean): boolean {
  if (US_STATE_CODE_SET.has(part)) return true;
  return allowName && US_STATE_NAME_SET.has(part.toLowerCase());
}

/**
 * @summary Parses a "City, Region, Country" style place string from the right into country, region and city.
 * A trailing US state ("Chicago, IL", "Atlanta, Georgia", "Alabama") maps to US — never to Canada, Israel or
 * the country Georgia — and "Remote …" parts are skipped so "US, Remote Zone 1" still resolves to US.
 */
export function parseGreenhousePlace(text: string | null | undefined): {
  postal: NormalizedPostal | null;
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const empty = { postal: null, country: null, region: null, city: null };
  if (typeof text !== 'string') return empty;

  const parts = text
    .split(',')
    // "Remote - California" / "Remote (U.S.)" -> "California" / "U.S."
    .map((p) =>
      sanitizeText(p)
        .replace(/^remote\s*[-–:(]\s*/i, '')
        .replace(/\)$/, '')
        // US ZIP suffix: "NC - 27410" -> "NC", "TX 78701" -> "TX", a lone "10036" -> ""
        .replace(/\s*[-–]?\s*\b\d{5}(?:-\d{4})?\s*$/, '')
        .replace(/[\s.,–-]+$/, '')
        .trim()
    )
    .filter((p) => p.length > 0 && p.toLowerCase() !== 'n/a')
    // "Atlanta GA" / "Denver CO" / "Toronto ON" -> ["Atlanta", "GA"] so the region code is recognised
    .flatMap((p) => {
      const m = p.match(/^(.+?)\s+([A-Z]{2})$/);
      return m && (US_STATE_CODE_SET.has(m[2]) || CA_PROVINCE_CODE_SET.has(m[2])) ? [m[1], m[2]] : [p];
    });
  if (parts.length === 0) return empty;

  let country: string | null = null;
  let region: string | null = null;
  let countryIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/\bremote\b/i.test(part) && i > 0) continue;
    // Full state names only count at the end of a short string ("Atlanta, Georgia"), so
    // "Tbilisi, Tbilisi, Georgia" style three-part strings keep their country.
    // "Remote, US, Georgia": a US marker right before it makes Georgia the state, not the country
    const afterUsMarker = i > 0 && US_MARKER_REGEX.test(parts[i - 1]);
    if (isUsState(part, parts.length <= 2 || i < parts.length - 1 || afterUsMarker)) {
      country = 'US';
      region = part;
      countryIdx = i;
      break;
    }
    if (CA_PROVINCE_CODE_SET.has(part)) {
      country = 'CA';
      region = part;
      countryIdx = i;
      break;
    }
    // "United Kingdom - Deliveroo" (company suffix) and "Sao Paulo / SP / Brazil" (slash list) also name a country
    const iso =
      toIsoCountry(part) ?? toIsoCountry(part.split(/\s+[-–]\s+/)[0]) ?? toIsoCountry(part.split(/\s*\/\s*/).pop());
    if (iso) {
      country = iso;
      countryIdx = i;
      break;
    }
    if (/\bremote\b/i.test(part)) continue;
    break;
  }

  if (countryIdx === -1) return empty;

  const before = parts.slice(0, countryIdx).filter((p) => !/^remote\b/i.test(p) && !US_MARKER_REGEX.test(p));
  if (!region && before.length >= 2) {
    region = before.slice(1).join(', ');
  }
  // Address-style parts ("Hawthorne at Friendly - 900 Hobbs Rd - Greensboro") keep only the last " - " segment.
  // With a matched US state the city is the part right before it ("1114 Avenue, NYC, NY" -> NYC).
  const rawCity =
    before.length === 0 ? null : region === parts[countryIdx] ? before[before.length - 1] : before[0];
  const city = rawCity ? (rawCity.split(/\s+[-–]\s+/).pop() ?? rawCity).trim() || null : null;

  const postal: NormalizedPostal = {};
  if (country) postal.addressCountry = country;
  if (region) postal.addressRegion = region;
  if (city) postal.addressLocality = city;
  return { postal, country, region, city };
}

/**
 * @summary Resolves country/region/city for a job. The job's own location text wins when it names a country
 * ("Dublin, Ireland" stays Ireland even if the office list says Berlin). Otherwise the office list is used,
 * preferring the office whose city equals the job's city ("Berlin" picks Berlin over Dublin), then the first one.
 */
function parseGreenhouseOfficePostal(
  offices: GreenhouseOffice[] | null | undefined,
  locationText?: string | null
): {
  postal: NormalizedPostal | null;
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const fromLocation = parseGreenhousePlace(locationText);
  const parsedOffices = Array.isArray(offices)
    ? offices.map((o) => parseGreenhousePlace(o?.location)).filter((p) => p.country)
    : [];

  if (fromLocation.country) {
    // Same country and same city in an office: use the office's fuller data (full region name)
    const fuller = parsedOffices.find(
      (p) =>
        p.country === fromLocation.country &&
        p.region &&
        p.city &&
        fromLocation.city &&
        p.city.toLowerCase() === fromLocation.city.toLowerCase()
    );
    return fuller ?? fromLocation;
  }

  if (parsedOffices.length > 0) {
    const wanted = typeof locationText === 'string' ? sanitizeText(locationText).split(',')[0].trim().toLowerCase() : '';
    const sameCity = wanted ? parsedOffices.find((p) => p.city && p.city.toLowerCase() === wanted) : undefined;
    return sameCity ?? parsedOffices[0];
  }
  if (typeof locationText === 'string' && US_TEXT_REGEX.test(locationText)) {
    return { postal: { addressCountry: 'US' }, country: 'US', region: null, city: null };
  }
  return { postal: null, country: null, region: null, city: null };
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
  const { postal, country, region, city } = parseGreenhouseOfficePostal(raw.offices, location);

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
 * Greenhouse stores a board's uploaded logo under this path on its CDN. Boards without an uploaded logo
 * (e.g. Figma, Robinhood) set og:image to a marketing banner on another CDN, which must never become an avatar.
 */
const GREENHOUSE_LOGO_PATH = '/external_greenhouse_job_boards/logos/';

/**
 * @summary Extracts the board's own uploaded logo from Greenhouse hosted job board HTML, or undefined.
 * Candidates (og:image, then header logo <img>) are accepted only when they are an absolute https URL on a
 * greenhouse.io host under the Greenhouse logo path; any other og:image is a banner and the UI shows initials.
 */
export function extractGreenhouseLogo(html: string): string | undefined {
  if (!html || typeof html !== 'string') return undefined;

  const ogMatch =
    html.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    html.match(/<meta\s+[^>]*name=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']og:image["']/i);

  const headerImgMatch =
    html.match(/<img\s+[^>]*id=["'](?:logo|header-logo)["'][^>]*src=["']([^"']+)["']/i) ||
    html.match(/<img\s+[^>]*class=["'][^"']*\b(?:logo|header-logo)\b[^"']*["'][^>]*src=["']([^"']+)["']/i) ||
    html.match(/<header[^>]*>[\s\S]*?<img\s+[^>]*src=["']([^"']+)["']/i) ||
    html.match(/<div\s+[^>]*id=["']header["'][^>]*>[\s\S]*?<img\s+[^>]*src=["']([^"']+)["']/i);

  for (const raw of [ogMatch?.[1], headerImgMatch?.[1]]) {
    if (!raw) continue;
    try {
      const parsed = new URL(decodeHtmlEntities(raw.trim()));
      const host = parsed.hostname.toLowerCase();
      const onGreenhouse = host === 'greenhouse.io' || host.endsWith('.greenhouse.io');
      if (parsed.protocol === 'https:' && onGreenhouse && parsed.pathname.includes(GREENHOUSE_LOGO_PATH)) {
        return parsed.toString();
      }
    } catch {
      // Not an absolute URL: try the next candidate
    }
  }
  return undefined;
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
   * @summary Fetches company display name from Greenhouse board info endpoint GET /v1/boards/{token} and best-effort logo from hosted board page
   */
  public async fetchCompanyMetadata(
    ref: BoardRef,
    opts?: { includeLogo?: boolean }
  ): Promise<CompanyMetadataResult> {
    const token = encodeURIComponent(ref.atsToken.trim().toLowerCase());
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}`;

    let name: string | undefined = undefined;

    try {
      const { data } = await axios.get<{ name?: string | null }>(apiUrl, {
        timeout: 10000,
        headers: GREENHOUSE_HEADERS,
      });

      if (typeof data?.name === 'string' && data.name.trim().length > 0) {
        name = sanitizeText(data.name);
      }
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

    // Best-effort logo fetch from hosted board page when includeLogo is not false
    let logoUrl: string | undefined = undefined;
    if (opts?.includeLogo !== false) {
      try {
        const pageUrl = `https://job-boards.greenhouse.io/${token}`;
        const { data: html } = await axios.get<string>(pageUrl, {
          timeout: 10000,
          headers: GREENHOUSE_HEADERS,
          responseType: 'text',
        });
        if (typeof html === 'string') {
          logoUrl = extractGreenhouseLogo(html);
        }
      } catch {
        // Best-effort: ignore HTML fetch failure
      }
    }

    return {
      status: 'ok',
      name,
      logoUrl,
    };
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
