/**
 * @file Unit tests for cache key canonicalization, hashing, and shard helpers
 * @summary Validates canonicalJobsKey, isCacheableView, detailsShard, and key constants (P2-T01)
 */

import { describe, it, expect } from '@jest/globals';
import {
  canonicalJobsKey,
  isCacheableView,
  detailsShard,
  crc32,
  KEY_CURRENT,
  KEY_DETAILS_INDEX,
  KEY_LAST_SCRAPE_AT,
  KEY_LAST_PUBLISH,
  KEY_LOCK_PUBLISH,
  genKey,
  detailsShardKey,
} from '../../src/lib/cache/keys';

describe('Cache Key Constants', () => {
  it('defines the standard jc:v1 key prefixes and names', () => {
    expect(KEY_CURRENT).toBe('jc:v1:current');
    expect(KEY_DETAILS_INDEX).toBe('jc:v1:details:index');
    expect(KEY_LAST_SCRAPE_AT).toBe('jc:v1:meta:lastScrapeAt');
    expect(KEY_LAST_PUBLISH).toBe('jc:v1:meta:lastPublish');
    expect(KEY_LOCK_PUBLISH).toBe('jc:v1:lock:publish');
    expect(genKey('g20261024T061932Z-4f2a')).toBe('jc:v1:gen:g20261024T061932Z-4f2a');
    expect(detailsShardKey(3)).toBe('jc:v1:details:3');
  });
});

describe('CRC32 and detailsShard', () => {
  it('computes standard IEEE 802.3 CRC32 hashes', () => {
    expect(crc32('')).toBe(0);
    expect(crc32('hello')).toBe(0x3610a686);
    expect(crc32('123456789')).toBe(0xcbf43926);
  });

  it('maps UUIDs deterministically into shards 0..7', () => {
    const id1 = 'e4b52cb5-3d8a-4d2a-89a1-cb9cf540192a';
    const id2 = 'c7a1e2f3-4b5c-6d7e-8f9a-0b1c2d3e4f5a';
    const shard1 = detailsShard(id1);
    const shard2 = detailsShard(id2);
    expect(shard1).toBeGreaterThanOrEqual(0);
    expect(shard1).toBeLessThan(8);
    expect(shard2).toBeGreaterThanOrEqual(0);
    expect(shard2).toBeLessThan(8);
    expect(detailsShard(id1)).toBe(shard1);
  });
});

describe('canonicalJobsKey and isCacheableView (20-case test table)', () => {
  const cases: Array<{
    name: string;
    query: Record<string, any>;
    expectedKey: string;
    isCacheable: boolean;
  }> = [
    // 1. Default UI view
    {
      name: 'Default UI view (empty query)',
      query: {},
      expectedKey: 'jobs?page=1',
      isCacheable: true,
    },
    // 2. Explicit default values
    {
      name: 'Explicit default values',
      query: { page: '1', pageSize: '25', sortBy: 'publishedAt', sortOrder: 'desc' },
      expectedKey: 'jobs?page=1',
      isCacheable: true,
    },
    // 3. Remote filter, page 3
    {
      name: 'WorkplaceType Remote, page 3',
      query: { workplaceType: 'Remote', page: 3 },
      expectedKey: 'jobs?page=3&workplaceType=Remote',
      isCacheable: true,
    },
    // 4. WorkplaceType Hybrid
    {
      name: 'WorkplaceType Hybrid',
      query: { workplaceType: 'Hybrid', page: 1 },
      expectedKey: 'jobs?page=1&workplaceType=Hybrid',
      isCacheable: true,
    },
    // 5. WorkplaceType OnSite
    {
      name: 'WorkplaceType OnSite',
      query: { workplaceType: 'OnSite', page: 2 },
      expectedKey: 'jobs?page=2&workplaceType=OnSite',
      isCacheable: true,
    },
    // 6. Country filter (e.g. US)
    {
      name: 'Country US, page 1',
      query: { country: 'US', page: 1 },
      expectedKey: 'jobs?country=US&page=1',
      isCacheable: true,
    },
    // 7. EmploymentType FullTime
    {
      name: 'EmploymentType FullTime',
      query: { employmentType: 'FullTime', page: 5 },
      expectedKey: 'jobs?employmentType=FullTime&page=5',
      isCacheable: true,
    },
    // 8. hasSalary=true with boolean
    {
      name: 'hasSalary=true',
      query: { hasSalary: true, page: 1 },
      expectedKey: 'jobs?hasSalary=true&page=1',
      isCacheable: true,
    },
    // 9. hasSalary="1" string representation
    {
      name: 'hasSalary="1"',
      query: { hasSalary: '1', page: 1 },
      expectedKey: 'jobs?hasSalary=true&page=1',
      isCacheable: true,
    },
    // 10. Unknown params are stripped
    {
      name: 'Unknown params dropped',
      query: { page: 1, foo: 'bar', trackingId: '123' },
      expectedKey: 'jobs?page=1',
      isCacheable: true,
    },
    // 11. Search is NOT cacheable
    {
      name: 'Search query present',
      query: { search: 'react', page: 1 },
      expectedKey: 'jobs?page=1&search=react',
      isCacheable: false,
    },
    // 12. Two filters together NOT cacheable
    {
      name: 'Two filters together (workplaceType + country)',
      query: { workplaceType: 'Remote', country: 'US', page: 1 },
      expectedKey: 'jobs?country=US&page=1&workplaceType=Remote',
      isCacheable: false,
    },
    // 13. Non-default sort NOT cacheable
    {
      name: 'Non-default sort (sortBy=salary)',
      query: { sortBy: 'salary', page: 1 },
      expectedKey: 'jobs?page=1&sortBy=salary',
      isCacheable: false,
    },
    // 14. Non-default sortOrder NOT cacheable
    {
      name: 'Non-default sortOrder (sortOrder=asc)',
      query: { sortOrder: 'asc', page: 1 },
      expectedKey: 'jobs?page=1&sortOrder=asc',
      isCacheable: false,
    },
    // 15. Non-default pageSize NOT cacheable
    {
      name: 'Non-default pageSize (pageSize=50)',
      query: { pageSize: 50, page: 1 },
      expectedKey: 'jobs?page=1&pageSize=50',
      isCacheable: false,
    },
    // 16. salaryMin NOT cacheable
    {
      name: 'salaryMin provided',
      query: { salaryMin: 100000, page: 1 },
      expectedKey: 'jobs?page=1&salaryMin=100000',
      isCacheable: false,
    },
    // 17. salaryInterval alone dropped when salaryMin absent
    {
      name: 'salaryInterval alone dropped',
      query: { salaryInterval: '1 YEAR', page: 1 },
      expectedKey: 'jobs?page=1',
      isCacheable: true,
    },
    // 18. salaryInterval kept when salaryMin present
    {
      name: 'salaryInterval kept with salaryMin',
      query: { salaryMin: 80000, salaryInterval: '1 YEAR', page: 1 },
      expectedKey: 'jobs?page=1&salaryInterval=1%20YEAR&salaryMin=80000',
      isCacheable: false,
    },
    // 19. Page clamping to 5000 and integer sanitization
    {
      name: 'Page clamped to 5000',
      query: { page: 99999 },
      expectedKey: 'jobs?page=5000',
      isCacheable: true,
    },
    // 20. Trimming strings and alphabetical sorting of keys
    {
      name: 'Value trimming and alphabetical key sorting',
      query: { country: '  CA  ', page: '  4  ' },
      expectedKey: 'jobs?country=CA&page=4',
      isCacheable: true,
    },
  ];

  cases.forEach(({ name, query, expectedKey, isCacheable }, idx) => {
    it(`Case ${idx + 1}: ${name}`, () => {
      expect(canonicalJobsKey(query)).toBe(expectedKey);
      expect(isCacheableView(query)).toBe(isCacheable);
    });
  });
});
