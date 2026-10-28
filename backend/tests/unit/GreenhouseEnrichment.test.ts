/**
 * @file Greenhouse Company Enrichment Unit Tests
 * @summary Unit tests for Greenhouse logo extraction, company metadata enrichment, 7-day retry rule, and 200/run cap
 * @tags Unit Test, Enrichment, Greenhouse, Logo, Metadata, 7-day-retry
 */

import axios from 'axios';
import { extractGreenhouseLogo, GreenhouseClient } from '../../src/lib/ats/GreenhouseClient';
import { enrichActiveCompanies } from '../../src/utils/EnrichCompanies';
import { mockCompany } from '../../__mocks__/@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Greenhouse Company Enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractGreenhouseLogo', () => {
    it('extracts logo from og:image meta tag with standard attribute order', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/og-logo.png" />
          </head>
          <body></body>
        </html>
      `;
      expect(extractGreenhouseLogo(html)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/og-logo.png');
    });

    it('extracts logo from og:image meta tag with flipped attribute order and name attribute', () => {
      const html1 = '<meta content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/flipped-og.png" property="og:image">';
      expect(extractGreenhouseLogo(html1)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/flipped-og.png');

      const html2 = '<meta name="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/name-og.png">';
      expect(extractGreenhouseLogo(html2)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/name-og.png');
    });

    it('falls back to header logo <img> tag when og:image is absent', () => {
      const htmlId = '<div id="header"><img id="logo" src="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/header-logo.png"></div>';
      expect(extractGreenhouseLogo(htmlId)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/header-logo.png');

      const htmlClass = '<header><img class="company-logo" src="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/class-logo.png"></header>';
      expect(extractGreenhouseLogo(htmlClass)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/class-logo.png');
    });

    it('rejects marketing banners on other CDNs (Figma, Robinhood) so the UI shows initials', () => {
      const figma =
        '<meta property="og:image" content="https://cdn.sanity.io/images/599r6htc/regionalized/335e70a0-2400x1260.png?w=1200&amp;q=70&amp;fit=max&amp;auto=format"/>';
      expect(extractGreenhouseLogo(figma)).toBeUndefined();

      const robinhood = '<meta property="og:image" content="https://v.fastcdn.co/u/62ba1c13/65631119-0-Meta-Thumbnail-Icon.jpg">';
      expect(extractGreenhouseLogo(robinhood)).toBeUndefined();
    });

    it('rejects a Greenhouse-hosted image that is not under the logo path, and look-alike hosts', () => {
      expect(extractGreenhouseLogo('<meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/other/banner.png">')).toBeUndefined();
      expect(extractGreenhouseLogo('<meta property="og:image" content="https://evilgreenhouse.io/external_greenhouse_job_boards/logos/1/x.png">')).toBeUndefined();
    });

    it('decodes HTML entities in the logo URL (&amp; becomes &)', () => {
      const html = '<meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/1/original/x.png?1&amp;v=2">';
      expect(extractGreenhouseLogo(html)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/1/original/x.png?1&v=2');
    });

    it('prefers a valid header logo when og:image is a banner', () => {
      const html =
        '<meta property="og:image" content="https://v.fastcdn.co/banner.jpg"><header><img src="' + 'https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/real.png' + '"></header>';
      expect(extractGreenhouseLogo(html)).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/real.png');
    });

    it('rejects non-HTTPS and relative logo URLs, returning undefined', () => {
      const httpHtml = '<meta property="og:image" content="http://insecure.com/logo.png">';
      expect(extractGreenhouseLogo(httpHtml)).toBeUndefined();

      const relativeHtml = '<meta property="og:image" content="/images/logo.png">';
      expect(extractGreenhouseLogo(relativeHtml)).toBeUndefined();

      const invalidHtml = '<meta property="og:image" content="not-a-url">';
      expect(extractGreenhouseLogo(invalidHtml)).toBeUndefined();

      expect(extractGreenhouseLogo('')).toBeUndefined();
    });
  });

  describe('GreenhouseClient.fetchCompanyMetadata', () => {
    it('returns name and best-effort logoUrl when both endpoints succeed', async () => {
      const client = new GreenhouseClient();
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { name: 'Acme Corp' } } as never)
        .mockResolvedValueOnce({
          status: 200,
          data: '<meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/logo.png">',
        } as never);

      const res = await client.fetchCompanyMetadata({
        slug: 'gh--acme',
        source: 'greenhouse',
        atsToken: 'acme',
      });

      expect(res.status).toBe('ok');
      expect(res.name).toBe('Acme Corp');
      expect(res.logoUrl).toBe('https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/logo.png');
    });

    it('returns name with logoUrl undefined when hosted board page has no logo or fails', async () => {
      const client = new GreenhouseClient();
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { name: 'Beta Inc' } } as never)
        .mockRejectedValueOnce({ response: { status: 404 } });

      const res = await client.fetchCompanyMetadata({
        slug: 'gh--beta',
        source: 'greenhouse',
        atsToken: 'beta',
      });

      expect(res.status).toBe('ok');
      expect(res.name).toBe('Beta Inc');
      expect(res.logoUrl).toBeUndefined();
    });
  });

  describe('EnrichCompanies 7-day retry rule and cap', () => {
    it('targets Greenhouse companies needing logo and caps candidate fetch at 200', async () => {
      mockCompany.findMany.mockResolvedValueOnce([
        { slug: 'gh--stripe', source: 'GREENHOUSE', atsToken: 'stripe', name: 'Stripe', logoUrl: null },
      ]);
      mockCompany.update.mockResolvedValue({});

      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { name: 'Stripe' } } as never)
        .mockResolvedValueOnce({
          status: 200,
          data: '<meta property="og:image" content="https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/stripe.png">',
        } as never);

      const res = await enrichActiveCompanies({
        sources: ['greenhouse'],
        limit: 300,
      });

      expect(res.totalTargeted).toBe(1);
      expect(res.enrichedCount).toBe(1);

      // Verify Prisma findMany was called with 7-day filter and take capped at 200
      expect(mockCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'GREENHOUSE',
            status: 'ACTIVE',
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { lastCheckedAt: null },
                  expect.objectContaining({ lastCheckedAt: expect.any(Object) }),
                ]),
              }),
            ]),
          }),
          take: 200,
        })
      );

      // Verify update set lastCheckedAt
      expect(mockCompany.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'gh--stripe' },
          data: expect.objectContaining({
            lastCheckedAt: expect.any(Date),
            logoUrl: 'https://s2-recruiting.cdn.greenhouse.io/external_greenhouse_job_boards/logos/400/025/200/original/stripe.png',
          }),
        })
      );
    });
  });
});
