/**
 * @file Cluster Partition and CLI Flags Tests
 * @summary Tests source parsing, partitionSlugs with source interleaving, and backward compatibility
 * @tags Unit, Cluster, Partition, Interleaving, CLI, ADR-0021
 */

import { partitionSlugs, resolveWorkerCount } from '../../src/core/ClusterScraper';
import { parseAtsSources } from '../../src/lib/ats/source';

describe('Cluster Partition & Source Flags (ADR-0021)', () => {
  describe('parseAtsSources', () => {
    it('parses single and multiple valid sources case-insensitively with whitespace trimming', () => {
      expect(parseAtsSources('ashby')).toEqual(['ashby']);
      expect(parseAtsSources('ASHBY, greenhouse ')).toEqual(['ashby', 'greenhouse']);
      expect(parseAtsSources('greenhouse,ashby')).toEqual(['greenhouse', 'ashby']);
      expect(parseAtsSources('')).toEqual(['ashby']);
    });

    it('throws with clear error message when unknown source is passed', () => {
      expect(() => parseAtsSources('ashby,lever')).toThrow(/Unknown ATS source "lever"/);
    });
  });

  describe('partitionSlugs with Source Interleaving', () => {
    it('interleaves sources across worker shards so each shard receives balanced sources', () => {
      const items = [
        { slug: 'a1', source: 'ashby' },
        { slug: 'a2', source: 'ashby' },
        { slug: 'a3', source: 'ashby' },
        { slug: 'a4', source: 'ashby' },
        { slug: 'g1', source: 'greenhouse' },
        { slug: 'g2', source: 'greenhouse' },
        { slug: 'g3', source: 'greenhouse' },
        { slug: 'g4', source: 'greenhouse' },
      ];

      const shards = partitionSlugs(items, 2);

      expect(shards).toHaveLength(2);
      // Both shards receive 2 Ashby and 2 Greenhouse companies
      expect(shards[0]).toEqual(['a1', 'a3', 'g1', 'g3']);
      expect(shards[1]).toEqual(['a2', 'a4', 'g2', 'g4']);
    });

    it('maintains backwards compatibility when string slugs are provided without source', () => {
      const slugs = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
      const shards = partitionSlugs(slugs, 3);

      expect(shards).toHaveLength(3);
      expect(shards[0]).toEqual(['c1', 'c4', 'c7']);
      expect(shards[1]).toEqual(['c2', 'c5']);
      expect(shards[2]).toEqual(['c3', 'c6']);
    });
  });

  describe('resolveWorkerCount', () => {
    it('respects --workers=N CLI argument', () => {
      expect(resolveWorkerCount(['--workers=4'], 100, 8)).toBe(4);
      expect(resolveWorkerCount(['--workers=1'], 100, 8)).toBe(1);
    });
  });
});
