/**
 * @file Golden Equivalence Test
 * @summary Asserts that normalizeAshbyJob matches golden fixture field-for-field including contentHash and legacyKey
 * @tags Unit, Golden, Normalizer, AtsClient, Invariant, ADR-0021
 */

import * as fs from 'fs';
import * as path from 'path';
import { AshbyJob } from '../../src/lib/AshbyClient';
import { normalizeAshbyJob } from '../../src/lib/ats/AshbyAtsClient';
import { computeJobContentHash } from '../../src/core/Scraper';

describe('Golden Equivalence (Ashby ATS Normalizer)', () => {
  it('normalizes ashby-sample.json matching golden fixture field-for-field with exact content hashes', () => {
    const rawFixturePath = path.join(__dirname, '../fixtures/ashby-sample.json');
    const goldenFixturePath = path.join(__dirname, '../fixtures/ashby-sample-normalized.json');

    const rawData = JSON.parse(fs.readFileSync(rawFixturePath, 'utf8')) as { jobs: AshbyJob[] };
    const expected = JSON.parse(fs.readFileSync(goldenFixturePath, 'utf8')) as Array<Record<string, unknown>>;

    const actual = rawData.jobs.map((job) => {
      const norm = normalizeAshbyJob(job, '1password', 'rest');
      expect(norm).not.toBeNull();
      if (!norm) throw new Error('Unreachable');

      const hash = computeJobContentHash({
        title: norm.title,
        location: norm.location || null,
        department: norm.department || null,
        salary: norm.salary,
        isRemote: norm.isRemote,
        workplaceType: norm.workplaceType || null,
        employmentType: norm.employmentType || null,
        publishedAt: norm.publishedAt ? norm.publishedAt.toISOString() : null,
        applyUrl: norm.applyUrl,
        isListed: norm.isListed,
        country: norm.country || null,
        region: norm.region || null,
        city: norm.city || null,
        descriptionHtml: norm.descriptionHtml || '',
        descriptionPlain: norm.descriptionPlain || '',
        team: norm.team || null,
        secondaryLocations: norm.secondaryLocations || [],
      });

      return {
        ...norm,
        publishedAt: norm.publishedAt ? norm.publishedAt.toISOString() : null,
        sourceUpdatedAt: norm.sourceUpdatedAt ? norm.sourceUpdatedAt.toISOString() : null,
        contentHash: hash,
      };
    });

    expect(actual).toHaveLength(expected.length);
    expect(actual).toEqual(expected);
  });
});
