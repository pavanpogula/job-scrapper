/**
 * @file CompanySelectionFilter Unit Tests
 * @summary Asserts that GREENHOUSE companies are never selected or fetched when sources = ['ashby']
 * @tags Unit, Filter, Multi-Source, AtsClient, Quarantine Prevention, ADR-0021
 */

import { AshbyScraper } from '../../src/core/Scraper';
import { AtsClient, BoardFetchResult, BoardRef, CanonicalUrls, CompanyMetadataResult } from '../../src/lib/ats/AtsClient';
import { AtsSource } from '../../src/lib/ats/source';
import { mockCompany } from '../../__mocks__/@prisma/client';

class MockAtsClient implements AtsClient {
  public fetchBoardCalls: BoardRef[] = [];

  public constructor(public readonly source: AtsSource) {}

  public async fetchBoard(ref: BoardRef): Promise<BoardFetchResult> {
    this.fetchBoardCalls.push(ref);
    return {
      slug: ref.slug,
      source: this.source,
      jobs: [],
      notFound: false,
      fetchMode: 'primary',
    };
  }

  public async fetchCompanyMetadata(_ref: BoardRef): Promise<CompanyMetadataResult> {
    return { status: 'ok', name: 'Mock' };
  }

  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: `https://${ref.slug}/${externalId}`,
      applyUrl: `https://${ref.slug}/${externalId}/apply`,
      boardUrl: `https://${ref.slug}`,
    };
  }
}

describe('Company Selection Filter (ADR-0021)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never fetches a GREENHOUSE company when enabled sources are ashby in explicit slugs mode', async () => {
    const ashbyClient = new MockAtsClient('ashby');
    const scraper = new AshbyScraper({
      clients: new Map<AtsSource, AtsClient>([['ashby', ashbyClient]]),
    });

    mockCompany.findMany.mockResolvedValueOnce([
      { slug: 'ashby-company', source: 'ASHBY', atsToken: null },
      { slug: 'greenhouse-company', source: 'GREENHOUSE', atsToken: null },
    ]);

    // Run scraper with both slugs, but default enabled sources (ashby only)
    const report = await scraper.runAll({
      slugs: ['ashby-company', 'greenhouse-company', 'nonexistent-company'],
      sources: ['ashby'],
      saveTelemetry: false,
      publish: false,
    });

    // 1. ashby-company was fetched
    expect(ashbyClient.fetchBoardCalls.some((c) => c.slug === 'ashby-company')).toBe(true);

    // 2. greenhouse-company was NEVER fetched from Ashby
    expect(ashbyClient.fetchBoardCalls.some((c) => c.slug === 'greenhouse-company')).toBe(false);

    // 3. greenhouse-company emitted skipped_disabled_source error event
    const ghEvent = report.events.find(
      (e) => e.companySlug === 'greenhouse-company' && e.actionTaken === 'skipped_disabled_source'
    );
    expect(ghEvent).toBeDefined();

    // 4. nonexistent-company was skipped with skipped_unknown_slug, never defaulted to Ashby
    const unknownEvent = report.events.find(
      (e) => e.companySlug === 'nonexistent-company' && e.actionTaken === 'skipped_unknown_slug'
    );
    expect(unknownEvent).toBeDefined();
    expect(ashbyClient.fetchBoardCalls.some((c) => c.slug === 'nonexistent-company')).toBe(false);
  });
});
