/**
 * @file formatJobFreshness.test.ts
 * @summary Unit test suite for formatJobFreshness helper
 * @tags frontend, freshness, formatting, tests, vitest
 */

import { describe, it, expect } from 'vitest';
import { formatJobFreshness, formatDetailFreshness } from '../lib/formatJobFreshness';

describe('formatJobFreshness', () => {
  // Fixed reference date: 2026-03-15T12:00:00.000Z
  const NOW = new Date('2026-03-15T12:00:00.000Z');

  it('returns null when job is null, undefined, or has no timestamp', () => {
    expect(formatJobFreshness(null, NOW)).toBeNull();
    expect(formatJobFreshness(undefined, NOW)).toBeNull();
    expect(formatJobFreshness({}, NOW)).toBeNull();
    expect(formatJobFreshness({ lastUpdatedAt: null, publishedAt: null }, NOW)).toBeNull();
    expect(formatJobFreshness({ lastUpdatedAt: 'invalid-date' }, NOW)).toBeNull();
  });

  describe('Relative time thresholds', () => {
    it('clamps clock skew into the future to "just now"', () => {
      const future = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: future, lastUpdatedSource: 'detected' }, NOW);
      expect(res).toEqual({
        label: 'Updated just now',
        dateTime: new Date(future).toISOString(),
      });
    });

    it('formats elapsed time < 1 min as "just now"', () => {
      const subMinute = new Date(NOW.getTime() - 45 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: subMinute, lastUpdatedSource: 'ashby' }, NOW);
      expect(res).toEqual({
        label: 'Updated just now',
        dateTime: new Date(subMinute).toISOString(),
      });
    });

    it('formats elapsed time < 60 min as "<m>m ago" (e.g. 5m ago)', () => {
      const fiveMinAgo = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: fiveMinAgo, lastUpdatedSource: 'detected' }, NOW);
      expect(res?.label).toBe('Updated 5m ago');
    });

    it('formats elapsed time < 24 hours as "<h>h ago" (e.g. 3h ago)', () => {
      const threeHoursAgo = new Date(NOW.getTime() - 3 * 3600 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: threeHoursAgo, lastUpdatedSource: 'detected' }, NOW);
      expect(res?.label).toBe('Updated 3h ago');
    });

    it('formats elapsed time < 30 days as "<d>d ago" (e.g. 4d ago)', () => {
      const fourDaysAgo = new Date(NOW.getTime() - 4 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: fourDaysAgo, lastUpdatedSource: 'detected' }, NOW);
      expect(res?.label).toBe('Updated 4d ago');
    });

    it('formats elapsed time >= 30 days as short absolute date (e.g. 45 days ago)', () => {
      // 45 days before 2026-03-15 is 2026-01-29
      const fortyFiveDaysAgo = new Date(NOW.getTime() - 45 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness({ lastUpdatedAt: fortyFiveDaysAgo, lastUpdatedSource: 'published' }, NOW);
      expect(res?.label).toBe('Posted Jan 29, 2026');
    });
  });

  describe('Source label variants and tooltip', () => {
    it('uses "Updated <relative>" for source "detected" and adds tooltip if publishedAt differs', () => {
      const updated = new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString(); // 2d ago
      const published = new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString(); // 10d ago
      const res = formatJobFreshness(
        {
          lastUpdatedAt: updated,
          lastUpdatedSource: 'detected',
          publishedAt: published,
        },
        NOW
      );

      expect(res?.label).toBe('Updated 2d ago');
      expect(res?.tooltip).toBe('Posted Mar 5, 2026');
      expect(res?.dateTime).toBe(new Date(updated).toISOString());
    });

    it('does not add tooltip if publishedAt matches lastUpdatedAt', () => {
      const timestamp = new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness(
        {
          lastUpdatedAt: timestamp,
          lastUpdatedSource: 'ashby',
          publishedAt: timestamp,
        },
        NOW
      );

      expect(res?.label).toBe('Updated 2d ago');
      expect(res?.tooltip).toBeUndefined();
    });

    it('uses "Posted <relative>" for source "published"', () => {
      const timestamp = new Date(NOW.getTime() - 5 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness(
        {
          lastUpdatedAt: timestamp,
          lastUpdatedSource: 'published',
          publishedAt: timestamp,
        },
        NOW
      );

      expect(res?.label).toBe('Posted 5d ago');
      expect(res?.tooltip).toBeUndefined();
    });

    it('uses "First seen <relative>" for source "firstSeen"', () => {
      const timestamp = new Date(NOW.getTime() - 1 * 3600 * 1000).toISOString();
      const res = formatJobFreshness(
        {
          lastUpdatedAt: timestamp,
          lastUpdatedSource: 'firstSeen',
        },
        NOW
      );

      expect(res?.label).toBe('First seen 1h ago');
    });

    it('falls back to "Posted <relative>" when source is missing but timestamp exists', () => {
      const timestamp = new Date(NOW.getTime() - 3 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness(
        {
          lastUpdatedAt: timestamp,
          lastUpdatedSource: null,
        },
        NOW
      );

      expect(res?.label).toBe('Posted 3d ago');
    });

    it('falls back to publishedAt when lastUpdatedAt is undefined', () => {
      const timestamp = new Date(NOW.getTime() - 3 * 24 * 3600 * 1000).toISOString();
      const res = formatJobFreshness(
        {
          publishedAt: timestamp,
        },
        NOW
      );

      expect(res?.label).toBe('Posted 3d ago');
      expect(res?.dateTime).toBe(new Date(timestamp).toISOString());
    });
  });

  describe('formatDetailFreshness', () => {
    it('returns null when job has no dates', () => {
      expect(formatDetailFreshness(null, NOW)).toBeNull();
      expect(formatDetailFreshness({}, NOW)).toBeNull();
    });

    it('returns "Posted <date> · Updated <date>" when both dates exist and differ', () => {
      const published = new Date(NOW.getTime() - 10 * 24 * 3600 * 1000).toISOString();
      const updated = new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const res = formatDetailFreshness(
        {
          publishedAt: published,
          lastUpdatedAt: updated,
          lastUpdatedSource: 'detected',
        },
        NOW
      );

      expect(res?.text).toBe('Posted Mar 5, 2026 · Updated Mar 13, 2026');
      expect(res?.dateTime).toBe(new Date(updated).toISOString());
    });

    it('returns freshness label when dates match or only one is present', () => {
      const timestamp = new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString();
      const res = formatDetailFreshness(
        {
          publishedAt: timestamp,
          lastUpdatedAt: timestamp,
          lastUpdatedSource: 'published',
        },
        NOW
      );

      expect(res?.text).toBe('Posted 2d ago');
    });
  });
});
