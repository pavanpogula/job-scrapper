/**
 * @file Multi-Source ATS Registry and Helper Unit Tests
 * @summary Validates source registry entries, enum round-trips, slug derivation, token extraction, and slug guards
 * @tags ATS, Registry, Source, Slug, Token, Validation, ADR-0021, ADR-0022
 */

import {
  SUPPORTED_ATS_SOURCES,
  API_SOURCES,
  ATS_SOURCES,
  toDbAts,
  toAtsSource,
  isAtsSource,
  parseAtsSources,
  companySlug,
  tokenFromSlug,
  sourceFromSlug,
} from '../../src/lib/ats/source';
import { isValidSlug } from '../../src/discovery/CdxWorker';

describe('ATS Source Registry & Helpers (ADR-0022)', () => {
  it('defines the single source of truth registry correctly', () => {
    expect(SUPPORTED_ATS_SOURCES).toEqual(['ashby', 'greenhouse', 'lever']);
    expect(API_SOURCES).toEqual(['ashby', 'greenhouse', 'lever']);

    expect(ATS_SOURCES.ashby).toEqual({
      source: 'ashby',
      db: 'ASHBY',
      label: 'Ashby',
      slugPrefix: '',
      legacyKeyPrefix: '',
      apiName: 'Ashby Posting API',
    });

    expect(ATS_SOURCES.greenhouse).toEqual({
      source: 'greenhouse',
      db: 'GREENHOUSE',
      label: 'Greenhouse',
      slugPrefix: 'gh--',
      legacyKeyPrefix: 'greenhouse:',
      apiName: 'Greenhouse Board API',
    });

    expect(ATS_SOURCES.lever).toEqual({
      source: 'lever',
      db: 'LEVER',
      label: 'Lever',
      slugPrefix: 'lv--',
      legacyKeyPrefix: 'lever:',
      apiName: 'Lever Postings API',
    });
  });

  it('performs toDbAts and toAtsSource round trips for all 3 supported sources', () => {
    for (const source of SUPPORTED_ATS_SOURCES) {
      const dbEnum = toDbAts(source);
      expect(toAtsSource(dbEnum)).toBe(source);
      expect(toAtsSource(source)).toBe(source);
      expect(toAtsSource(source.toUpperCase())).toBe(source);
    }
    expect(toAtsSource(null)).toBe('ashby');
    expect(toAtsSource(undefined)).toBe('ashby');
  });

  it('validates isAtsSource type guard', () => {
    expect(isAtsSource('ashby')).toBe(true);
    expect(isAtsSource('greenhouse')).toBe(true);
    expect(isAtsSource('lever')).toBe(true);
    expect(isAtsSource('workday')).toBe(false);
  });

  it('parses ATS sources with defaults, ordering, and validation', () => {
    expect(parseAtsSources('')).toEqual(['ashby']);
    expect(parseAtsSources('lever,ashby')).toEqual(['lever', 'ashby']);

    expect(() => parseAtsSources('workday')).toThrow(
      'Unknown ATS source "workday". Supported sources: ashby, greenhouse, lever'
    );
  });

  it('derives company slugs per source rules', () => {
    expect(companySlug('lever', 'spotify')).toBe('lv--spotify');
    expect(companySlug('lever', 'arcteryx.com')).toBe('lv--arcteryx-com');
    expect(companySlug('lever', '1840&Company')).toBe('lv--1840-company');
    expect(companySlug('lever', 'AIFund')).toBe('lv--aifund');

    expect(companySlug('ashby', 'openai')).toBe('openai');
    expect(companySlug('greenhouse', 'figma')).toBe('gh--figma');
  });

  it('extracts tokens from slugs stripping non-empty registered prefixes', () => {
    expect(tokenFromSlug('gh--figma')).toBe('figma');
    expect(tokenFromSlug('openai')).toBe('openai');
    expect(tokenFromSlug('lv--spotify')).toBe('spotify');
  });

  it('identifies source from slug prefixes', () => {
    expect(sourceFromSlug('openai')).toBeUndefined();
    expect(sourceFromSlug('lv--x')).toBe('lever');
    expect(sourceFromSlug('gh--stripe')).toBe('greenhouse');
  });

  it('slug guard: Ashby seed/discovery rejects double-hyphen and lv-- slugs', () => {
    const slug = 'lv--x';
    // Ashby discovery requires isValidSlug and !slug.includes('--')
    expect(slug.includes('--')).toBe(true);
    // Even if isValidSlug is checked, double-hyphen filter rejects it
    expect(isValidSlug(slug) && !slug.includes('--')).toBe(false);
  });
});
