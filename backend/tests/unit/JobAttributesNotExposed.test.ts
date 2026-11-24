/**
 * @file JobAttributesNotExposed.test.ts
 * @summary Guards that no job attribute column reaches the API before E4 (E4 inverts this: after E4 only experienceMinYears and clearanceRequired may be exposed)
 * @tags unit, api, contract, job-attributes, BF-026
 */

import fs from 'fs';
import path from 'path';
import {
  LIST_SELECT,
  DETAIL_SELECT,
  toJobListItem,
  toJobDetail,
  JobWithListRelations,
  JobWithDetailRelations,
} from '../../src/api/contract';

const ATTR_KEYS = [
  'experienceMinYears',
  'clearanceRequired',
  'attrsVersion',
  'attrsModelVersion',
  'attrsDescHash',
  'attrsSource',
  'attrsConfidence',
  'attrsEvidence',
] as const;

const ATTR_PAYLOAD = {
  experienceMinYears: 5,
  clearanceRequired: true,
  attrsVersion: 1,
  attrsModelVersion: 1,
  attrsDescHash: 'abc123',
  attrsSource: 'rules',
  attrsConfidence: 'high',
  attrsEvidence: { years: '5+ years', clearance: 'Secret clearance' },
};

describe('Job attributes API non-exposure guard (pre-E4)', () => {
  it('LIST_SELECT and DETAIL_SELECT select no attribute column', () => {
    const listKeys = Object.keys(LIST_SELECT);
    const detailKeys = Object.keys(DETAIL_SELECT);

    for (const attrKey of ATTR_KEYS) {
      expect(listKeys).not.toContain(attrKey);
      expect(detailKeys).not.toContain(attrKey);
    }
  });

  it('toJobListItem and toJobDetail drop attribute fields present on the row', () => {
    const now = new Date('2026-03-01T12:00:00.000Z');

    const listRow = {
      id: '00000000-0000-4000-8000-000000000001',
      ashbyId: 'ashby-1',
      source: 'ASHBY',
      externalId: 'ashby-1',
      title: 'Software Engineer',
      companySlug: 'acme-corp',
      departmentId: 'dept-1',
      locationId: 'loc-1',
      salaryMin: 120000,
      salaryMax: 160000,
      salaryCurrency: 'USD',
      salaryInterval: '1 YEAR',
      isRemote: true,
      workplaceType: 'Remote',
      employmentType: 'FullTime',
      publishedAt: now,
      lastUpdatedAt: now,
      lastUpdatedSource: 'published',
      applyUrl: 'https://jobs.ashbyhq.com/acme-corp/ashby-1/application',
      country: 'US',
      region: 'CA',
      city: 'San Francisco',
      isListed: true,
      createdAt: now,
      updatedAt: now,
      company: { name: 'Acme Corp', logoUrl: null },
      department: { name: 'Engineering' },
      location: { name: 'Remote' },
      ...ATTR_PAYLOAD,
    } as unknown as JobWithListRelations;

    const detailRow = {
      ...listRow,
      active: true,
      metadata: {
        descriptionHtml: '<p>5+ years of experience</p>',
        descriptionPlain: '5+ years of experience',
        team: 'Core',
        secondaryLocations: [],
      },
      company: {
        name: 'Acme Corp',
        slug: 'acme-corp',
        logoUrl: null,
        source: 'ASHBY',
        atsToken: 'acme-corp',
        _count: { jobs: 1 },
      },
      ...ATTR_PAYLOAD,
    } as unknown as JobWithDetailRelations;

    const listDto = toJobListItem(listRow) as unknown as Record<string, unknown>;
    const detailDto = toJobDetail(detailRow) as unknown as Record<string, unknown>;

    for (const attrKey of ATTR_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(listDto, attrKey)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(detailDto, attrKey)).toBe(false);
    }
  });

  it('contract fixtures contain no attribute key', () => {
    const fixturesDir = path.resolve(__dirname, '../fixtures/contract');
    const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(path.join(fixturesDir, file), 'utf-8');
      expect(content).not.toMatch(/experienceMinYears|clearanceRequired|attrs[A-Z]/);
    }
  });
});
