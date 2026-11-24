/**
 * @file Experience Buckets
 * @summary URL-safe experience year buckets and pure range/classification helpers
 * @tags enrichment, buckets, experience, job-attributes, BF-026
 */

export const EXPERIENCE_BUCKETS = ['0-2', '3-5', '6-9', '10plus', 'unspecified'] as const;

export type ExperienceBucket = (typeof EXPERIENCE_BUCKETS)[number];

const BUCKET_RANGES: Record<
  Exclude<ExperienceBucket, 'unspecified'>,
  { min: number; max: number | null }
> = {
  '0-2': { min: 0, max: 2 },
  '3-5': { min: 3, max: 5 },
  '6-9': { min: 6, max: 9 },
  '10plus': { min: 10, max: null },
};

/**
 * @summary Returns the inclusive numeric year bounds for a ranged experience bucket
 */
export function bucketRange(
  b: Exclude<ExperienceBucket, 'unspecified'>
): { min: number; max: number | null } {
  return BUCKET_RANGES[b];
}

/**
 * @summary Maps a non-negative integer year requirement (or null) to its experience bucket
 */
export function bucketOf(years: number | null): ExperienceBucket {
  if (years === null) {
    return 'unspecified';
  }
  if (!Number.isInteger(years) || years < 0) {
    throw new RangeError(`Expected null or non-negative integer years, got ${String(years)}`);
  }
  if (years <= 2) return '0-2';
  if (years <= 5) return '3-5';
  if (years <= 9) return '6-9';
  return '10plus';
}
