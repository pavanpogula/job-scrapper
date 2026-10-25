/**
 * @file Content Hash Unit Tests
 * @summary Unit test suite verifying deterministic content hashing over explicit field list after sanitization
 * @tags Unit Test, ContentHash, Scraper, Hashing, Invariants
 */

import { computeJobContentHash, stableStringify, ContentHashFields } from '../../src/core/Scraper';

describe('Content Hash Unit Tests (P1-T06 / BF-011)', () => {
    const baseJob: ContentHashFields = {
        title: 'Senior Software Engineer',
        location: 'San Francisco, CA',
        department: 'Engineering',
        salary: {
            min: 150000,
            max: 200000,
            currency: 'USD',
            interval: '1 YEAR'
        },
        isRemote: false,
        workplaceType: 'Hybrid',
        employmentType: 'FullTime',
        publishedAt: '2026-03-15T00:00:00.000Z',
        applyUrl: 'https://jobs.ashbyhq.com/acme/123/application',
        isListed: true,
        country: 'United States',
        region: 'CA',
        city: 'San Francisco',
        descriptionHtml: '<p>Great role</p>',
        descriptionPlain: 'Great role',
        team: 'Platform',
        secondaryLocations: [{ location: 'New York, NY' }, { location: 'Austin, TX' }]
    };

    test('case 01: produces consistent 32-character MD5 hex hash for identical inputs', () => {
        const hash1 = computeJobContentHash(baseJob);
        const hash2 = computeJobContentHash({ ...baseJob });

        expect(hash1).toHaveLength(32);
        expect(hash1).toBe(hash2);
        expect(/^[a-f0-9]{32}$/.test(hash1)).toBe(true);
    });

    test('case 02: is invariant to key order in input objects (stable serialization)', () => {
        const reorderedJob: ContentHashFields = {
            city: 'San Francisco',
            team: 'Platform',
            title: 'Senior Software Engineer',
            salary: {
                interval: '1 YEAR',
                currency: 'USD',
                max: 200000,
                min: 150000
            },
            isListed: true,
            secondaryLocations: [{ location: 'Austin, TX' }, { location: 'New York, NY' }], // sorted in computeJobContentHash
            applyUrl: 'https://jobs.ashbyhq.com/acme/123/application',
            publishedAt: '2026-03-15T00:00:00.000Z',
            descriptionPlain: 'Great role',
            isRemote: false,
            descriptionHtml: '<p>Great role</p>',
            employmentType: 'FullTime',
            department: 'Engineering',
            workplaceType: 'Hybrid',
            country: 'United States',
            region: 'CA',
            location: 'San Francisco, CA'
        };

        const baseHash = computeJobContentHash(baseJob);
        const reorderedHash = computeJobContentHash(reorderedJob);

        expect(reorderedHash).toBe(baseHash);
    });

    test('case 03: alters hash when title changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, title: 'Lead Software Engineer' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 04: alters hash when location changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, location: 'Remote, US' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 05: alters hash when department changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, department: 'Product Infrastructure' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 06: alters hash when salary min changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({
            ...baseJob,
            salary: { ...baseJob.salary!, min: 160000 }
        });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 07: alters hash when salary max changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({
            ...baseJob,
            salary: { ...baseJob.salary!, max: 220000 }
        });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 08: alters hash when salary currency changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({
            ...baseJob,
            salary: { ...baseJob.salary!, currency: 'EUR' }
        });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 09: alters hash when salary interval changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({
            ...baseJob,
            salary: { ...baseJob.salary!, interval: '1 MONTH' }
        });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 10: alters hash when isRemote changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, isRemote: true });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 11: alters hash when workplaceType changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, workplaceType: 'Remote' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 12: alters hash when employmentType changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, employmentType: 'Contract' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 13: alters hash when publishedAt changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, publishedAt: '2026-03-20T00:00:00.000Z' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 14: alters hash when applyUrl changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, applyUrl: 'https://jobs.ashbyhq.com/acme/999/application' });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 15: alters hash when isListed changes', () => {
        const baseHash = computeJobContentHash(baseJob);
        const modifiedHash = computeJobContentHash({ ...baseJob, isListed: false });
        expect(modifiedHash).not.toBe(baseHash);
    });

    test('case 16: alters hash when address fields (country, region, city) change', () => {
        const baseHash = computeJobContentHash(baseJob);
        const hashChangedCountry = computeJobContentHash({ ...baseJob, country: 'Canada' });
        const hashChangedRegion = computeJobContentHash({ ...baseJob, region: 'NY' });
        const hashChangedCity = computeJobContentHash({ ...baseJob, city: 'Oakland' });

        expect(hashChangedCountry).not.toBe(baseHash);
        expect(hashChangedRegion).not.toBe(baseHash);
        expect(hashChangedCity).not.toBe(baseHash);
    });

    test('case 17: alters hash when description, team, or secondaryLocations change, but ignores volatile _source', () => {
        const baseHash = computeJobContentHash(baseJob);

        // Changes to description, team, or secondaryLocations alter hash
        const hashHtml = computeJobContentHash({ ...baseJob, descriptionHtml: '<p>Updated description</p>' });
        const hashPlain = computeJobContentHash({ ...baseJob, descriptionPlain: 'Updated description' });
        const hashTeam = computeJobContentHash({ ...baseJob, team: 'Infrastructure Core' });
        const hashSecLoc = computeJobContentHash({
            ...baseJob,
            secondaryLocations: [{ location: 'Seattle, WA' }]
        });

        expect(hashHtml).not.toBe(baseHash);
        expect(hashPlain).not.toBe(baseHash);
        expect(hashTeam).not.toBe(baseHash);
        expect(hashSecLoc).not.toBe(baseHash);

        // Volatile keys like _source or extra metadata DO NOT alter the content hash
        const jobWithSourceRest = { ...baseJob, _source: 'rest', extraField: 123 } as any;
        const jobWithSourceGraphql = { ...baseJob, _source: 'graphql', extraField: 456 } as any;

        expect(computeJobContentHash(jobWithSourceRest)).toBe(baseHash);
        expect(computeJobContentHash(jobWithSourceGraphql)).toBe(baseHash);
    });
});
