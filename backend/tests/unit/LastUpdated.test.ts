/**
 * @file LastUpdated Unit Test Suite
 * @summary Validates resolveLastUpdated rules: new jobs, hash changes, reactivation, raw touch, invalid dates, and monotonicity
 * @tags Unit Test, Freshness, LastUpdated, Scraper
 */

import {
  resolveLastUpdated,
  PrevJobState,
  NextJobInput,
} from '../../src/core/ResolveLastUpdated';

describe('resolveLastUpdated', () => {
  const baseNow = new Date('2026-10-26T12:00:00.000Z');

  describe('Rule 1: New Jobs (!prev)', () => {
    it('sets lastUpdatedAt to Ashby update time with source ashby when present and valid', () => {
      const ashbyDate = new Date('2026-10-25T10:00:00.000Z');
      const next: NextJobInput = {
        contentHash: 'hash-1',
        updatedAt: ashbyDate,
        publishedAt: new Date('2026-10-20T10:00:00.000Z'),
      };

      const result = resolveLastUpdated(null, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(ashbyDate);
      expect(result.lastUpdatedSource).toBe('ashby');
    });

    it('falls back to publishedAt with source published when updatedAt is absent or invalid', () => {
      const pubDate = new Date('2026-10-20T10:00:00.000Z');
      const nextWithInvalidAshby: NextJobInput = {
        contentHash: 'hash-1',
        updatedAt: 'not-a-valid-date',
        publishedAt: pubDate,
      };

      const result = resolveLastUpdated(null, nextWithInvalidAshby, baseNow);
      expect(result.lastUpdatedAt).toEqual(pubDate);
      expect(result.lastUpdatedSource).toBe('published');
    });

    it('falls back to now with source firstSeen when publishedAt is absent (e.g. GraphQL-only rows)', () => {
      const nextGraphQL: NextJobInput = {
        contentHash: 'hash-graphql',
        updatedAt: null,
        publishedAt: null,
      };

      const result = resolveLastUpdated(null, nextGraphQL, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('firstSeen');
    });
  });

  describe('Rule 2: Existing Jobs with Changed contentHash', () => {
    const prev: PrevJobState = {
      active: true,
      contentHash: 'old-hash',
      lastUpdatedAt: new Date('2026-10-20T00:00:00.000Z'),
      lastUpdatedSource: 'published',
    };

    it('uses Ashby update time with source ashby when present and valid', () => {
      const ashbyDate = new Date('2026-10-26T11:00:00.000Z');
      const next: NextJobInput = {
        contentHash: 'new-hash',
        updatedAt: ashbyDate,
        publishedAt: new Date('2026-10-20T00:00:00.000Z'),
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(ashbyDate);
      expect(result.lastUpdatedSource).toBe('ashby');
    });

    it('uses scrape time (now) with source detected when Ashby update time is missing', () => {
      const next: NextJobInput = {
        contentHash: 'new-hash',
        publishedAt: new Date('2026-10-20T00:00:00.000Z'),
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('detected');
    });
  });

  describe('Rule 3: Existing Jobs with Unchanged contentHash but Re-activated', () => {
    it('keeps stored value when stored lastUpdatedAt is present', () => {
      const storedDate = new Date('2026-10-21T08:00:00.000Z');
      const prev: PrevJobState = {
        active: false,
        contentHash: 'same-hash',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'published',
      };
      const next: NextJobInput = {
        active: true,
        contentHash: 'same-hash',
        publishedAt: new Date('2026-10-21T08:00:00.000Z'),
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(storedDate);
      expect(result.lastUpdatedSource).toBe('published');
    });

    it('initializes per Rule 1 when stored lastUpdatedAt is null', () => {
      const prev: PrevJobState = {
        active: false,
        contentHash: 'same-hash',
        lastUpdatedAt: null,
        lastUpdatedSource: null,
      };
      const pubDate = new Date('2026-10-21T08:00:00.000Z');
      const next: NextJobInput = {
        active: true,
        contentHash: 'same-hash',
        publishedAt: pubDate,
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(pubDate);
      expect(result.lastUpdatedSource).toBe('published');
    });
  });

  describe('Rule 4: Raw Touch & Unchanged Rows', () => {
    it('never changes lastUpdatedAt on isRawTouch', () => {
      const storedDate = new Date('2026-10-22T08:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'old-hash',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'detected',
      };
      const next: NextJobInput = {
        contentHash: 'different-hash',
        isRawTouch: true,
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(storedDate);
      expect(result.lastUpdatedSource).toBe('detected');
    });

    it('never changes lastUpdatedAt when hash is unchanged and already active', () => {
      const storedDate = new Date('2026-10-22T08:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'same-hash',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'detected',
      };
      const next: NextJobInput = {
        active: true,
        contentHash: 'same-hash',
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(storedDate);
      expect(result.lastUpdatedSource).toBe('detected');
    });
  });

  describe('Rule 5: Monotonicity (Never Move Backwards)', () => {
    it('keeps stored timestamp if computed candidate is earlier than stored', () => {
      const storedDate = new Date('2026-10-26T15:00:00.000Z'); // Later than baseNow
      const prev: PrevJobState = {
        active: true,
        contentHash: 'old-hash',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'detected',
      };
      const next: NextJobInput = {
        contentHash: 'new-hash',
        // Ashby gives an older date
        updatedAt: new Date('2026-10-25T10:00:00.000Z'),
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(storedDate);
      expect(result.lastUpdatedSource).toBe('detected');
    });

    it('advances timestamp if computed candidate is later than stored', () => {
      const storedDate = new Date('2026-10-20T10:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'old-hash',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'published',
      };
      const next: NextJobInput = {
        contentHash: 'new-hash',
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('detected');
    });
  });

  describe('Invalid Dates Handling', () => {
    it('handles invalid string dates in next gracefully', () => {
      const next: NextJobInput = {
        contentHash: 'hash-1',
        updatedAt: 'invalid-date',
        publishedAt: 'another-invalid-date',
      };

      const result = resolveLastUpdated(null, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('firstSeen');
    });

    it('handles invalid Date objects with NaN timestamp gracefully', () => {
      const invalidDate = new Date('invalid');
      const next: NextJobInput = {
        contentHash: 'hash-1',
        updatedAt: invalidDate,
        publishedAt: invalidDate,
      };

      const result = resolveLastUpdated(null, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('firstSeen');
    });
  });

  describe('Rule 6: _normVersion Normalizer Drift Guard (G3 / ADR-0021)', () => {
    it('preserves stored lastUpdatedAt and lastUpdatedSource when contentHash changes alongside _normVersion bump', () => {
      const storedDate = new Date('2026-10-18T08:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'hash-v1',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'published',
        metadata: { _ats: 'greenhouse', _normVersion: 1 },
      };
      const next: NextJobInput = {
        contentHash: 'hash-v2',
        publishedAt: storedDate,
        updatedAt: null,
        metadata: { _ats: 'greenhouse', _normVersion: 2 },
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(storedDate);
      expect(result.lastUpdatedSource).toBe('published');
    });

    it('advances lastUpdatedAt to now (detected) when contentHash changes and _normVersion is unchanged', () => {
      const storedDate = new Date('2026-10-18T08:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'hash-old',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'published',
        metadata: { _ats: 'greenhouse', _normVersion: 1 },
      };
      const next: NextJobInput = {
        contentHash: 'hash-edited',
        publishedAt: storedDate,
        updatedAt: null,
        metadata: { _ats: 'greenhouse', _normVersion: 1 },
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('detected');
    });

    it('keeps Ashby rows without _normVersion unaffected on contentHash change', () => {
      const storedDate = new Date('2026-10-18T08:00:00.000Z');
      const prev: PrevJobState = {
        active: true,
        contentHash: 'ashby-old',
        lastUpdatedAt: storedDate,
        lastUpdatedSource: 'published',
        metadata: { _source: 'rest' },
      };
      const next: NextJobInput = {
        contentHash: 'ashby-new',
        publishedAt: storedDate,
        metadata: { _source: 'rest' },
      };

      const result = resolveLastUpdated(prev, next, baseNow);
      expect(result.lastUpdatedAt).toEqual(baseNow);
      expect(result.lastUpdatedSource).toBe('detected');
    });

    it('never produces lastUpdatedSource = ashby for Greenhouse jobs (sourceUpdatedAt is null)', () => {
      const pubDate = new Date('2026-10-15T12:00:00.000Z');
      const created = resolveLastUpdated(
        null,
        {
          contentHash: 'gh-hash-1',
          publishedAt: pubDate,
          updatedAt: null,
          metadata: { _ats: 'greenhouse', _normVersion: 1 },
        },
        baseNow
      );
      expect(created.lastUpdatedSource).toBe('published');
      expect(created.lastUpdatedSource).not.toBe('ashby');

      const updated = resolveLastUpdated(
        {
          active: true,
          contentHash: 'gh-hash-1',
          lastUpdatedAt: pubDate,
          lastUpdatedSource: 'published',
          metadata: { _ats: 'greenhouse', _normVersion: 1 },
        },
        {
          contentHash: 'gh-hash-2',
          publishedAt: pubDate,
          updatedAt: null,
          metadata: { _ats: 'greenhouse', _normVersion: 1 },
        },
        baseNow
      );
      expect(updated.lastUpdatedSource).toBe('detected');
      expect(updated.lastUpdatedSource).not.toBe('ashby');
    });
  });
});
