/**
 * @file Search Tokenizer Unit Tests
 * @summary Guards BF-020 tokenizing, cache-key canonicalisation, LIKE escaping and the shape of the search filter
 * @tags tests, search, tokenizer, BF-020
 */

import {
  tokenizeSearch,
  canonicalSearch,
  escapeLike,
  buildSearchWhere,
  WORD_SEPARATORS,
  MAX_SEARCH_TOKENS,
} from '../../src/lib/search';
import { canonicalJobsKey, isCacheableView } from '../../src/lib/cache/keys';

describe('BF-020: tokenizeSearch', () => {
  it('lowercases, splits on any whitespace and drops empties', () => {
    expect(tokenizeSearch('  Senior \t ENGINEER\n')).toEqual(['senior', 'engineer']);
  });

  it('returns no tokens for empty, whitespace-only, punctuation-only or non-string input', () => {
    expect(tokenizeSearch('')).toEqual([]);
    expect(tokenizeSearch('   ')).toEqual([]);
    expect(tokenizeSearch('"" ()')).toEqual([]);
    expect(tokenizeSearch(undefined)).toEqual([]);
    expect(tokenizeSearch(null)).toEqual([]);
  });

  it('strips edge punctuation and a trailing dot but keeps tech names intact', () => {
    expect(tokenizeSearch('"senior engineer", (remote).')).toEqual(['senior', 'engineer', 'remote']);
    expect(tokenizeSearch('C++ C# Node.js R&D 100% data_engineer')).toEqual(['c++', 'c#', 'node.js', 'r&d', '100%', 'data_engineer']);
  });

  it('de-duplicates and caps tokens, token length and input length', () => {
    expect(tokenizeSearch('engineer Engineer ENGINEER')).toEqual(['engineer']);
    expect(tokenizeSearch('a b c d e f g h i j')).toHaveLength(MAX_SEARCH_TOKENS);
    expect(tokenizeSearch('x'.repeat(80))).toEqual(['x'.repeat(50)]);
    expect(tokenizeSearch(`${'y'.repeat(99)} tail`)).toEqual(['y'.repeat(50)]);
  });
});

describe('BF-020: canonicalSearch and cache keys', () => {
  it('gives the same canonical text for the same words in any order, case or spacing', () => {
    expect(canonicalSearch('Senior  Engineer')).toBe('engineer senior');
    expect(canonicalSearch('engineer senior')).toBe('engineer senior');
    expect(canonicalSearch('  ')).toBe('');
  });

  it('maps equivalent searches to one cache key and keeps searches out of the pre-rendered cache', () => {
    expect(canonicalJobsKey({ search: 'Senior Engineer' })).toBe(canonicalJobsKey({ search: 'engineer  senior' }));
    expect(canonicalJobsKey({ search: 'senior engineer' })).toBe('jobs?page=1&search=engineer%20senior');
    expect(isCacheableView({ search: 'engineer' })).toBe(false);
  });

  it('treats a search with no tokens like no search', () => {
    expect(canonicalJobsKey({ search: '""' })).toBe(canonicalJobsKey({}));
  });
});

describe('BF-020: escapeLike', () => {
  it('escapes LIKE wildcards and backslashes so they match literally', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('data_engineer')).toBe('data\\_engineer');
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('c++')).toBe('c++');
  });
});

describe('BF-020: buildSearchWhere', () => {
  it('returns null when there is nothing to search', () => {
    expect(buildSearchWhere([])).toBeNull();
  });

  it('ANDs tokens and ORs each token across title, company, department and location at word starts', () => {
    const where = buildSearchWhere(['senior', 'engineer']);
    expect(where?.AND).toHaveLength(2);
    const first = (where?.AND as Array<{ OR: unknown[] }>)[0];
    expect(first?.OR).toHaveLength(4);
    const titleConditions = (first?.OR[0] as { OR: Array<{ title: unknown }> }).OR;
    expect(titleConditions).toEqual([
      { title: { startsWith: 'senior', mode: 'insensitive' } },
      ...WORD_SEPARATORS.map((sep) => ({ title: { contains: `${sep}senior`, mode: 'insensitive' } })),
    ]);
    expect(first?.OR[1]).toHaveProperty('company.OR');
    expect(first?.OR[2]).toHaveProperty('department.OR');
    expect(first?.OR[3]).toHaveProperty('location.OR');
  });
});
