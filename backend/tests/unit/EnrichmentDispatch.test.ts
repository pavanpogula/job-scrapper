/**
 * @file EnrichmentDispatch Unit Tests
 * @summary Asserts that companies from unregistered sources are skipped and counted during enrichment
 * @tags Unit, Enrichment, Multi-Source, AtsClient, ADR-0021
 */

import { enrichActiveCompanies } from '../../src/utils/EnrichCompanies';
import { AtsClient, BoardRef, CanonicalUrls, CompanyMetadataResult } from '../../src/lib/ats/AtsClient';
import { AtsSource } from '../../src/lib/ats/source';
import { mockCompany } from '../../__mocks__/@prisma/client';

class SpyAshbyClient implements AtsClient {
  public readonly source = 'ashby' as const;
  public metadataCalls: string[] = [];

  public async fetchBoard(_ref: BoardRef) {
    return { slug: 'mock', source: 'ashby' as const, jobs: [], notFound: false, fetchMode: 'primary' as const };
  }

  public async fetchCompanyMetadata(ref: BoardRef): Promise<CompanyMetadataResult> {
    this.metadataCalls.push(ref.slug);
    return { status: 'ok', name: 'Ashby Corp', logoUrl: 'https://logo.com/ashby.png' };
  }

  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: `https://${ref.slug}/${externalId}`,
      applyUrl: `https://${ref.slug}/${externalId}/apply`,
      boardUrl: `https://${ref.slug}`,
    };
  }
}

describe('Enrichment Dispatch (ADR-0021)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips companies of unregistered source and counts them without querying Ashby', async () => {
    const ashbyClient = new SpyAshbyClient();
    const clients = new Map<AtsSource, AtsClient>([['ashby', ashbyClient]]);

    mockCompany.findMany.mockResolvedValueOnce([
      { slug: 'active-ashby', source: 'ASHBY', atsToken: null, name: null, logoUrl: null },
      { slug: 'active-greenhouse', source: 'GREENHOUSE', atsToken: null, name: null, logoUrl: null },
    ]);
    mockCompany.update.mockResolvedValue({});

    // Run enrichment with both sources enabled, but only ashby client registered
    const result = await enrichActiveCompanies({
      concurrency: 1,
      sources: ['ashby', 'greenhouse'],
      clients,
      forceAll: true,
    });

    // active-ashby was enriched
    expect(result.enrichedCount).toBe(1);
    expect(ashbyClient.metadataCalls).toContain('active-ashby');

    // active-greenhouse was skipped because no greenhouse client was registered
    expect(result.skippedCount).toBe(1);
    expect(ashbyClient.metadataCalls).not.toContain('active-greenhouse');
  });
});
