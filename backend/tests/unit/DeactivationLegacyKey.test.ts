/**
 * @file DeactivationLegacyKey Unit Tests
 * @summary Asserts that deactivateStaleJobs receives legacyKey and preserves active jobs present on board
 * @tags Unit, Deactivation, LegacyKey, Scraper, ADR-0021
 */

import { AshbyScraper } from '../../src/core/Scraper';
import { mockJob } from '../../__mocks__/@prisma/client';

describe('Deactivation with LegacyKey (ADR-0021)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deactivates stale jobs by legacyKey passing active legacy keys to notIn filter', async () => {
    const scraper = new AshbyScraper();

    mockJob.updateMany.mockResolvedValueOnce({ count: 1 });

    // Board returns live-job-1 and live-job-2 (as legacyKey values)
    const activeLegacyKeys = ['live-job-1', 'live-job-2'];

    const deactivatedCount = await scraper.deactivateStaleJobs('acme-corp', activeLegacyKeys);

    expect(deactivatedCount).toBe(1);
    expect(mockJob.updateMany).toHaveBeenCalledWith({
      where: {
        companySlug: 'acme-corp',
        active: true,
        ashbyId: { notIn: ['live-job-1', 'live-job-2'] },
      },
      data: { active: false },
    });
  });
});
