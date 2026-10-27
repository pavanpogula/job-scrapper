/**
 * @file Multi-source ATS enum mapping and parsing utilities
 * @summary Single source of truth for converting between DB Ats enums ('ASHBY', 'GREENHOUSE') and normalized lowercase source tokens ('ashby', 'greenhouse')
 * @tags ATS, Multi-source, Enum, Mapping, Validation, ADR-0021
 */

export type AtsSource = 'ashby' | 'greenhouse';
export type DbAts = 'ASHBY' | 'GREENHOUSE';

export const SUPPORTED_ATS_SOURCES: readonly AtsSource[] = ['ashby', 'greenhouse'] as const;

/**
 * @summary Converts a lowercase ATS source to its uppercase Prisma DB enum representation
 */
export function toDbAts(source: AtsSource): DbAts {
  switch (source) {
    case 'ashby':
      return 'ASHBY';
    case 'greenhouse':
      return 'GREENHOUSE';
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
  if (normalized === 'ashby') return 'ashby';
  if (normalized === 'greenhouse') return 'greenhouse';
  throw new Error(`Invalid DB ATS source: "${dbAts}"`);
}

/**
 * @summary Type-guard asserting whether a string is a valid AtsSource
 */
export function isAtsSource(value: string): value is AtsSource {
  return value === 'ashby' || value === 'greenhouse';
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
