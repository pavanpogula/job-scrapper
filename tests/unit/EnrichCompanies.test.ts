/**
 * @file Unit tests for company enrichment and 429 rate limit backoff (P3-T03)
 * @summary Validates organization metadata extraction and adaptive backoff on 429
 * @tags Testing, Enrichment, Backoff, RateLimit, SCR-22
 */

import axios from 'axios';
import { fetchOrganizationMetadata } from '../../src/lib/AshbyClient';
import { enrichActiveCompanies } from '../../src/utils/EnrichCompanies';
import * as ConcurrencyModule from '../../src/lib/Concurrency';
import { mockCompany } from '../../__mocks__/@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Company Enrichment & 429 Backoff (P3-T03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchOrganizationMetadata', () => {
    it('returns status: ok with name and logoUrl when hosted board HTML contains window.__appData', async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              window.__appData = {"organization":{"name":"Acme Technologies","theme":{"logoWordmarkImageUrl":"https://cdn.ashbyhq.com/acme-logo.png"}}};
            </script>
          </head>
          <body></body>
        </html>
      `;
      mockedAxios.get.mockResolvedValueOnce({ data: html, status: 200 } as any);

      const result = await fetchOrganizationMetadata('acme');
      expect(result.status).toBe('ok');
      expect(result.name).toBe('Acme Technologies');
      expect(result.logoUrl).toBe('https://cdn.ashbyhq.com/acme-logo.png');
    });

    it('returns status: not_found when page returns 404 or missing appData', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 404 },
      });

      const result = await fetchOrganizationMetadata('nonexistent');
      expect(result.status).toBe('not_found');
      expect(result.name).toBeUndefined();
    });

    it('returns status: rate_limited with retryAfterSeconds on 429', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 429,
          headers: { 'retry-after': '3' },
        },
      });

      const result = await fetchOrganizationMetadata('throttled-co');
      expect(result.status).toBe('rate_limited');
      expect(result.retryAfterSeconds).toBe(3);
    });
  });

  describe('enrichActiveCompanies', () => {
    it('enrich backs off on 429', async () => {
      mockCompany.findMany.mockResolvedValueOnce([
        { id: '1', slug: 'throttled-co', name: 'Throttled Co', logoUrl: null },
      ]);

      mockedAxios.get.mockRejectedValueOnce({
        response: {
          status: 429,
          headers: { 'retry-after': '2' },
        },
      });

      const originalCreateLimiter = ConcurrencyModule.createLimiter;
      let rateLimitCalled = false;
      let capturedCooldownMs: number | undefined;

      const limiterSpy = jest.spyOn(ConcurrencyModule, 'createLimiter').mockImplementation((concurrency, options) => {
        const limiterInstance = originalCreateLimiter(concurrency, options);
        const originalOnRateLimit = limiterInstance.onRateLimit;
        limiterInstance.onRateLimit = (cooldownMs?: number) => {
          rateLimitCalled = true;
          capturedCooldownMs = cooldownMs;
        };
        return limiterInstance;
      });

      const res = await enrichActiveCompanies({ concurrency: 2, limit: 1 });

      expect(rateLimitCalled).toBe(true);
      expect(capturedCooldownMs).toBe(2000);
      expect(res.failedCount).toBe(1);
      expect(res.enrichedCount).toBe(0);

      limiterSpy.mockRestore();
    });
  });
});
