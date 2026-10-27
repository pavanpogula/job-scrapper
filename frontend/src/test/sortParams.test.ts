/**
 * @file sortParams.test.ts
 * @summary Guards URL sort/order parsing so stale bookmarks (e.g. ?sort=title, removed in P8a/O4) fall back to defaults
 * @tags frontend, url, sort, filters, P8a
 */
import { describe, it, expect } from 'vitest';
import { parseSortParam, parseOrderParam } from '../hooks/useJobFilters';

describe('P8a: URL sort/order parsing', () => {
  it('keeps every sort the backend supports', () => {
    expect(parseSortParam('publishedAt')).toBe('publishedAt');
    expect(parseSortParam('salary')).toBe('salary');
    expect(parseSortParam('company')).toBe('company');
  });

  it('falls back to publishedAt for removed or unknown sorts and a missing param', () => {
    expect(parseSortParam('title')).toBe('publishedAt');
    expect(parseSortParam('bogus')).toBe('publishedAt');
    expect(parseSortParam(null)).toBe('publishedAt');
  });

  it('accepts asc/desc and falls back to desc otherwise', () => {
    expect(parseOrderParam('asc')).toBe('asc');
    expect(parseOrderParam('desc')).toBe('desc');
    expect(parseOrderParam('sideways')).toBe('desc');
    expect(parseOrderParam(null)).toBe('desc');
  });
});
