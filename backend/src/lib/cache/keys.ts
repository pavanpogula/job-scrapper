/**
 * @file Cache key definitions and canonical query helpers
 * @summary Standard keys for Upstash Redis jc:v1:* cache and canonical query builder
 * @tags cache, redis, keys, canonicalizer
 */

import { canonicalSearch } from '../search';

export const KEY_PREFIX = 'jc:v1:';
export const KEY_CURRENT = 'jc:v1:current';
export const KEY_DETAILS_INDEX = 'jc:v1:details:index';
export const KEY_LAST_SCRAPE_AT = 'jc:v1:meta:lastScrapeAt';
export const KEY_LAST_PUBLISH = 'jc:v1:meta:lastPublish';
export const KEY_LOCK_PUBLISH = 'jc:v1:lock:publish';

/**
 * Returns the Redis key for a generation hash.
 * @param gen Generation identifier
 */
export function genKey(gen: string): string {
  return `jc:v1:gen:${gen}`;
}

/**
 * Returns the Redis key for a details shard hash (0..7), accepting either a shard number or job ID.
 * @param shardOrId Shard index (0..7) or job UUID
 */
export function detailsShardKey(shardOrId: number | string): string {
  const shard = typeof shardOrId === 'string' ? detailsShard(shardOrId) : shardOrId;
  return `jc:v1:details:${shard}`;
}

/**
 * Precomputed CRC32 lookup table (IEEE 802.3 standard).
 */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

/**
 * Computes the IEEE 802.3 standard CRC32 checksum for a string.
 * @param str Input string
 */
export function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ code) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Calculates the details shard index (0..7) for a given job UUID.
 * @param id Job identifier
 */
export function detailsShard(id: string): number {
  return crc32(id) % 8;
}

export const KNOWN_PARAMS = new Set([
  'search',
  'workplaceType',
  'employmentType',
  'country',
  'isRemote',
  'hasSalary',
  'salaryMin',
  'salaryInterval',
  'page',
  'pageSize',
  'sortBy',
  'sortOrder',
  'company',
  'postedWithin',
]);

const ALLOWED_WORKPLACE_TYPES = new Set(['Remote', 'Hybrid', 'OnSite']);
const ALLOWED_EMPLOYMENT_TYPES = new Set(['FullTime', 'PartTime', 'Contract', 'Intern', 'Temporary']);

/**
 * Parses and normalizes query parameters into canonical forms.
 * @param query Raw query object
 */
export function parseJobsQuery(query: Record<string, any>) {
  const normalized: Record<string, string> = {};

  // 1. page (clamped to 1..5000, default 1)
  let page = 1;
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const parsed = parseInt(String(query.page).trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      page = Math.min(parsed, 5000);
    }
  }
  normalized.page = String(page);

  // 2. pageSize (clamped to 1..100, default 25)
  if (query.pageSize !== undefined && query.pageSize !== null && query.pageSize !== '') {
    const parsed = parseInt(String(query.pageSize).trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      const clamped = Math.max(1, Math.min(parsed, 100));
      if (clamped !== 25) {
        normalized.pageSize = String(clamped);
      }
    }
  }

  // 3. sortBy (default publishedAt)
  if (query.sortBy && typeof query.sortBy === 'string') {
    const s = query.sortBy.trim();
    if (['publishedAt', 'salary', 'title', 'company'].includes(s) && s !== 'publishedAt') {
      normalized.sortBy = s;
    }
  }

  // 4. sortOrder (default desc)
  if (query.sortOrder && typeof query.sortOrder === 'string') {
    const o = query.sortOrder.trim().toLowerCase();
    if (['asc', 'desc'].includes(o) && o !== 'desc') {
      normalized.sortOrder = o;
    }
  }

  // 5. search (BF-020: same tokens in any order, case or spacing give identical results, so share one key)
  if (typeof query.search === 'string') {
    const search = canonicalSearch(query.search);
    if (search) normalized.search = search;
  }

  // 6. workplaceType
  if (query.workplaceType && typeof query.workplaceType === 'string' && query.workplaceType.trim()) {
    normalized.workplaceType = query.workplaceType.trim();
  }

  // 7. employmentType
  if (query.employmentType && typeof query.employmentType === 'string' && query.employmentType.trim()) {
    normalized.employmentType = query.employmentType.trim();
  }

  // 8. country
  if (query.country && typeof query.country === 'string' && query.country.trim()) {
    normalized.country = query.country.trim();
  }

  // 9. hasSalary / isRemote boolean conversions
  if (query.hasSalary !== undefined && (query.hasSalary === true || query.hasSalary === 'true' || query.hasSalary === '1' || query.hasSalary === 1)) {
    normalized.hasSalary = 'true';
  }
  if (query.isRemote !== undefined && (query.isRemote === true || query.isRemote === 'true' || query.isRemote === '1' || query.isRemote === 1)) {
    normalized.isRemote = 'true';
  }

  // 10. salaryMin and salaryInterval (interval dropped unless min is valid number)
  let validSalaryMin: number | null = null;
  if (query.salaryMin !== undefined && query.salaryMin !== null && query.salaryMin !== '') {
    const minVal = parseFloat(String(query.salaryMin).trim());
    if (!isNaN(minVal)) {
      validSalaryMin = minVal;
      normalized.salaryMin = String(minVal);
    }
  }

  if (validSalaryMin !== null && query.salaryInterval && typeof query.salaryInterval === 'string' && query.salaryInterval.trim()) {
    normalized.salaryInterval = query.salaryInterval.trim();
  }

  // 11. company
  if (query.company && typeof query.company === 'string' && query.company.trim()) {
    normalized.company = query.company.trim();
  }

  // 12. postedWithin (only 1d, 7d, 30d supported; others dropped)
  if (query.postedWithin && typeof query.postedWithin === 'string') {
    const pw = query.postedWithin.trim().toLowerCase();
    if (['1d', '7d', '30d'].includes(pw)) {
      normalized.postedWithin = pw;
    }
  }

  return normalized;
}

/**
 * Builds the canonical cache key for a jobs listing query.
 * @param query Raw query object
 */
export function canonicalJobsKey(query: Record<string, any>): string {
  const normalized = parseJobsQuery(query);
  const keys = Object.keys(normalized).sort();
  const pairs = keys.map((k) => `${k}=${encodeURIComponent(normalized[k])}`);
  return `jobs?${pairs.join('&')}`;
}

/**
 * Determines whether a query can be served from the pre-rendered cache.
 * Must be either the default view or a single allowed filter, with default pagination & sorting.
 * @param query Raw query object or canonical string
 */
export function isCacheableView(query: Record<string, any> | string): boolean {
  let parsedQuery: Record<string, any>;
  if (typeof query === 'string') {
    parsedQuery = {};
    const qs = query.includes('?') ? query.slice(query.indexOf('?') + 1) : query;
    for (const part of qs.split('&')) {
      if (!part) continue;
      const [k, v] = part.split('=');
      parsedQuery[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    }
  } else {
    parsedQuery = query;
  }

  const normalized = parseJobsQuery(parsedQuery);

  // Must not have search, salaryMin, or custom sort/pagination
  if (normalized.search) return false;
  if (normalized.salaryMin) return false;
  if (normalized.pageSize) return false;
  if (normalized.sortBy) return false;
  if (normalized.sortOrder) return false;

  // Filter keys present other than page
  const filterKeys = Object.keys(normalized).filter((k) => k !== 'page');

  // Default view (no filters) is cacheable
  if (filterKeys.length === 0) {
    return true;
  }

  // More than 1 filter is not cacheable in pre-rendered cache
  if (filterKeys.length > 1) {
    return false;
  }

  const singleFilter = filterKeys[0];
  const value = normalized[singleFilter];

  if (singleFilter === 'workplaceType') {
    return ALLOWED_WORKPLACE_TYPES.has(value);
  }
  if (singleFilter === 'employmentType') {
    return ALLOWED_EMPLOYMENT_TYPES.has(value);
  }
  if (singleFilter === 'country') {
    return value.length > 0;
  }
  if (singleFilter === 'hasSalary') {
    return value === 'true';
  }

  return false;
}
