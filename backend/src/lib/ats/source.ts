/**
 * @file Multi-source ATS enum mapping, source registry, and parsing utilities
 * @summary Single source of truth for supported ATS sources, database enum mappings, slug prefixes, and URL/token derivation
 * @tags ATS, Multi-source, Enum, Mapping, Validation, Registry, ADR-0021, ADR-0022
 */

export const SUPPORTED_ATS_SOURCES = ['ashby', 'greenhouse', 'lever'] as const;
export type AtsSource = (typeof SUPPORTED_ATS_SOURCES)[number];
export type DbAts = 'ASHBY' | 'GREENHOUSE' | 'LEVER';

/**
 * Sources accepted by the public HTTP API and frontend filter.
 */
export const API_SOURCES: readonly AtsSource[] = ['ashby', 'greenhouse', 'lever'];

export interface AtsSourceInfo {
  source: AtsSource;
  db: DbAts;
  label: string;
  slugPrefix: string;
  legacyKeyPrefix: string;
  apiName: string;
}

export const ATS_SOURCES: Record<AtsSource, AtsSourceInfo> = {
  ashby: {
    source: 'ashby',
    db: 'ASHBY',
    label: 'Ashby',
    slugPrefix: '',
    legacyKeyPrefix: '',
    apiName: 'Ashby Posting API',
  },
  greenhouse: {
    source: 'greenhouse',
    db: 'GREENHOUSE',
    label: 'Greenhouse',
    slugPrefix: 'gh--',
    legacyKeyPrefix: 'greenhouse:',
    apiName: 'Greenhouse Board API',
  },
  lever: {
    source: 'lever',
    db: 'LEVER',
    label: 'Lever',
    slugPrefix: 'lv--',
    legacyKeyPrefix: 'lever:',
    apiName: 'Lever Postings API',
  },
};

/**
 * @summary Converts a lowercase ATS source to its uppercase Prisma DB enum representation
 */
export function toDbAts(source: AtsSource): DbAts {
  switch (source) {
    case 'ashby':
    case 'greenhouse':
    case 'lever':
      return ATS_SOURCES[source].db;
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unsupported ATS source: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * @summary Converts an uppercase Prisma DB enum or raw string to a normalized lowercase AtsSource
 */
export function toAtsSource(dbAts?: string | null): AtsSource {
  if (!dbAts) return 'ashby';
  const normalized = dbAts.trim().toLowerCase();
  if (isAtsSource(normalized)) return normalized;
  throw new Error(`Invalid DB ATS source: "${dbAts}"`);
}

/**
 * @summary Type-guard asserting whether a string is a valid AtsSource
 */
export function isAtsSource(value: string): value is AtsSource {
  return (SUPPORTED_ATS_SOURCES as readonly string[]).includes(value);
}

/**
 * @summary Parses a comma-delimited string of sources (e.g. "ashby,greenhouse") into an array of AtsSource. Throws on unknown sources.
 */
export function parseAtsSources(raw: string): AtsSource[] {
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (parts.length === 0) {
    return ['ashby'];
  }

  const seen = new Set<AtsSource>();
  for (const part of parts) {
    if (!isAtsSource(part)) {
      throw new Error(`Unknown ATS source "${part}". Supported sources: ${SUPPORTED_ATS_SOURCES.join(', ')}`);
    }
    seen.add(part);
  }

  return Array.from(seen);
}

/**
 * @summary Computes the canonical company slug for a source and token
 */
export function companySlug(source: AtsSource, token: string): string {
  const info = ATS_SOURCES[source];
  const prefix = info ? info.slugPrefix : '';
  const lower = (token ?? '').trim().toLowerCase();
  const sanitized = source === 'lever' ? lower.replace(/[^a-z0-9-]/g, '-') : lower;
  return `${prefix}${sanitized}`;
}

/**
 * @summary Strips any non-empty registered prefix from a slug to extract the board token
 */
export function tokenFromSlug(slug: string): string {
  for (const info of Object.values(ATS_SOURCES)) {
    if (info.slugPrefix.length > 0 && slug.startsWith(info.slugPrefix)) {
      return slug.slice(info.slugPrefix.length);
    }
  }
  return slug;
}

/**
 * @summary Matches non-empty registered prefixes to determine ATS source from a company slug
 */
export function sourceFromSlug(slug: string): AtsSource | undefined {
  for (const info of Object.values(ATS_SOURCES)) {
    if (info.slugPrefix.length > 0 && slug.startsWith(info.slugPrefix)) {
      return info.source;
    }
  }
  return undefined;
}
