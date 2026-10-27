/**
 * @file PerSourceLimiter Unit Tests
 * @summary Asserts that 429 on one ATS source does not affect another source's concurrency limiter
 * @tags Unit, Concurrency, Limiter, Multi-Source, AtsClient, ADR-0021
 */

import { AshbyScraper } from '../../src/core/Scraper';
import { AtsClient, BoardFetchResult, BoardRef, CanonicalUrls, CompanyMetadataResult } from '../../src/lib/ats/AtsClient';
import { AtsSource } from '../../src/lib/ats/source';

class FakeAtsClient implements AtsClient {
  public constructor(public readonly source: AtsSource) {}

  public async fetchBoard(ref: BoardRef): Promise<BoardFetchResult> {
    return {
      slug: ref.slug,
      source: this.source,
      jobs: [],
      notFound: false,
      fetchMode: 'primary',
    };
  }

  public async fetchCompanyMetadata(_ref: BoardRef): Promise<CompanyMetadataResult> {
    return { status: 'ok', name: 'Fake Company' };
  }

  public canonicalUrls(ref: BoardRef, externalId: string): CanonicalUrls {
    return {
      jobUrl: `https://fake.ats/${ref.slug}/${externalId}`,
      applyUrl: `https://fake.ats/${ref.slug}/${externalId}/apply`,
      boardUrl: `https://fake.ats/${ref.slug}`,
    };
  }
}

describe('Per-Source Adaptive Limiter (ADR-0021)', () => {
  it('creates isolated limiters per source so 429 on one source does not throttle another', () => {
    const clients = new Map<AtsSource, AtsClient>([
      ['ashby', new FakeAtsClient('ashby')],
      ['greenhouse', new FakeAtsClient('greenhouse')],
    ]);

    const scraper = new AshbyScraper({ clients });

    const ashbyLimiter = scraper.getLimiter('ashby', 15);
    const greenhouseLimiter = scraper.getLimiter('greenhouse', 15);

    expect(ashbyLimiter.getConcurrency()).toBe(15);
    expect(greenhouseLimiter.getConcurrency()).toBe(15);

    // Ashby encounters 429 rate limit
    ashbyLimiter.onRateLimit();

    // Ashby throttles down
    expect(ashbyLimiter.getConcurrency()).toBeLessThan(15);

    // Greenhouse limiter remains untouched at full concurrency
    expect(greenhouseLimiter.getConcurrency()).toBe(15);
  });
});
