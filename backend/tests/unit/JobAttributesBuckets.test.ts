/**
 * @file JobAttributesBuckets.test.ts
 * @summary Unit tests for experience buckets, URL safety, ranges, validation, and ATTRS_VERSION constant
 * @tags unit, enrichment, buckets, job-attributes, BF-026
 */

import {
  EXPERIENCE_BUCKETS,
  ExperienceBucket,
  bucketRange,
  bucketOf,
} from '../../src/enrichment/buckets';
import { ATTRS_VERSION } from '../../src/enrichment/version';

describe('experience buckets and enrichment version', () => {
  it('lists the five buckets in order', () => {
    expect(EXPERIENCE_BUCKETS).toEqual(['0-2', '3-5', '6-9', '10plus', 'unspecified']);
  });

  it('bucket values are URL-safe', () => {
    for (const bucket of EXPERIENCE_BUCKETS) {
      expect(encodeURIComponent(bucket)).toBe(bucket);
    }
  });

  it('bucketRange maps each bucket', () => {
    expect(bucketRange('0-2')).toEqual({ min: 0, max: 2 });
    expect(bucketRange('3-5')).toEqual({ min: 3, max: 5 });
    expect(bucketRange('6-9')).toEqual({ min: 6, max: 9 });
    expect(bucketRange('10plus')).toEqual({ min: 10, max: null });
  });

  it.each<[number | null, ExperienceBucket]>([
    [null, 'unspecified'],
    [0, '0-2'],
    [2, '0-2'],
    [3, '3-5'],
    [5, '3-5'],
    [6, '6-9'],
    [9, '6-9'],
    [10, '10plus'],
    [30, '10plus'],
  ])('bucketOf(%p) is %p', (years, expected) => {
    expect(bucketOf(years)).toBe(expected);
  });

  it('bucketOf rejects negative or non-integer years', () => {
    expect(() => bucketOf(-1)).toThrow(RangeError);
    expect(() => bucketOf(2.5)).toThrow(RangeError);
    expect(() => bucketOf(Number.NaN)).toThrow(RangeError);
  });

  it('buckets cover 0..30 with no gap or overlap', () => {
    const rangedBuckets = EXPERIENCE_BUCKETS.filter(
      (b): b is Exclude<ExperienceBucket, 'unspecified'> => b !== 'unspecified'
    );

    for (let y = 0; y <= 30; y++) {
      const matches = rangedBuckets.filter((b) => {
        const { min, max } = bucketRange(b);
        return y >= min && (max === null || y <= max);
      });
      expect(matches).toHaveLength(1);
      expect(matches[0]).toBe(bucketOf(y));
    }
  });

  it('ATTRS_VERSION is a positive integer', () => {
    expect(Number.isInteger(ATTRS_VERSION)).toBe(true);
    expect(ATTRS_VERSION).toBeGreaterThan(0);
  });

  it('ATTRS_VERSION is 2', () => {
    expect(ATTRS_VERSION).toBe(2);
  });
});
