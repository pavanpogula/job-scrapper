/**
 * @file Unit tests for AshbyScraper.runAll()
 * @summary Tests 100-job streaming flushes, stale job deactivation, and createMany fast-path
 * @tags Testing, Scraper, Batch, Deactivation, createMany
 */

import { createStatefulPrisma } from '../helpers/prismaFactory';
import { FakeRedis } from '../helpers/fakeRedis';

const statefulPrisma = createStatefulPrisma({
    companies: [{ slug: 'acme-corp', status: 'ACTIVE' }],
    jobs: [
        {
            ashbyId: 'old-stale-job',
            title: 'Stale Engineer',
            companySlug: 'acme-corp',
            active: true,
            isListed: true,
            contentHash: 'stale-hash'
        }
    ]
});

const fakeRedis = new FakeRedis();

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => statefulPrisma)
}));

jest.mock('../../src/lib/Redis', () => ({
    redis: fakeRedis
}));

jest.mock('../../src/lib/AshbyClient', () => ({
    fetchAshbyBoardWithFallback: jest.fn(),
    extractSalary: jest.fn(() => ({
        salaryMin: 120000,
        salaryMax: 160000,
        salaryCurrency: 'USD',
        salaryInterval: '1 YEAR'
    }))
}));

import { AshbyScraper } from '../../src/core/Scraper';
import { fetchAshbyBoardWithFallback } from '../../src/lib/AshbyClient';

describe('AshbyScraper runAll() Harness (P1-T03)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fakeRedis.status = 'ready';
    });

    test('250 jobs flush in 3 chunks (100, 100, 50) and populate via createMany fast path', async () => {
        // Generate 250 jobs
        const jobs250 = Array.from({ length: 250 }, (_, i) => ({
            id: `job-${i + 1}`,
            title: `Software Engineer ${i + 1}`,
            department: 'Engineering',
            location: 'Remote',
            jobUrl: `https://jobs.ashbyhq.com/acme-corp/job-${i + 1}`,
            applyUrl: `https://jobs.ashbyhq.com/acme-corp/job-${i + 1}/application`,
            isListed: true,
            publishedAt: '2026-10-23T00:00:00.000Z'
        }));

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: jobs250,
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        const scraper = new AshbyScraper();
        const report = await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 5,
            saveTelemetry: false
        });

        expect(report.summary.jobsCollected).toBe(250);

        // Verification 1: createMany called to insert new jobs
        expect(statefulPrisma.job.createMany).toHaveBeenCalled();
        const createManyCalls = statefulPrisma._calls.job.createMany;
        
        // Sum of all jobs passed to createMany
        const totalCreated = createManyCalls.reduce((sum: number, call: any) => sum + call.data.length, 0);
        expect(totalCreated).toBe(250);

        // Verification 2: 250 jobs flushed in 3 chunks: [100, 100, 50]
        expect(createManyCalls.length).toBe(3);
        expect(createManyCalls[0].data.length).toBe(100);
        expect(createManyCalls[1].data.length).toBe(100);
        expect(createManyCalls[2].data.length).toBe(50);
    });

    test('deactivates stale jobs by calling updateMany with ashbyId notIn live IDs', async () => {
        const liveJobs = [
            {
                id: 'live-job-1',
                title: 'Staff Engineer',
                department: 'Engineering',
                location: 'Remote',
                jobUrl: 'https://jobs.ashbyhq.com/acme-corp/live-job-1',
                applyUrl: 'https://jobs.ashbyhq.com/acme-corp/live-job-1/application',
                isListed: true
            }
        ];

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: liveJobs,
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        const scraper = new AshbyScraper();
        await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 1,
            saveTelemetry: false
        });

        // Verification: updateMany called for stale job deactivation
        expect(statefulPrisma.job.updateMany).toHaveBeenCalledWith({
            where: {
                companySlug: 'acme-corp',
                active: true,
                ashbyId: { notIn: ['live-job-1'] }
            },
            data: {
                active: false
            }
        });

        // The stale job was deactivated
        const stale = statefulPrisma._data.jobs.get('old-stale-job');
        expect(stale.active).toBe(false);
    });

    test('reactivates inactive job with same hash', async () => {
        const scraper = new AshbyScraper();
        const returningJobPayload = {
            id: 'returning-job',
            title: 'Reactivated Engineer',
            department: 'Engineering',
            location: 'Remote',
            jobUrl: 'https://jobs.ashbyhq.com/acme-corp/returning-job',
            applyUrl: 'https://jobs.ashbyhq.com/acme-corp/returning-job/application',
            isListed: true
        };
        const returningHash = (scraper as any).generateHash(returningJobPayload);

        // Seed statefulPrisma with an inactive job with the exact same contentHash
        statefulPrisma._data.jobs.set('returning-job', {
            ashbyId: 'returning-job',
            title: 'Reactivated Engineer',
            companySlug: 'acme-corp',
            active: false,
            isListed: true,
            contentHash: returningHash
        });

        // Seed fakeRedis with the cached hash (simulating the bug where Redis previously blocked reactivation)
        await fakeRedis.set('job:returning-job:hash', returningHash);

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [returningJobPayload],
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 1,
            saveTelemetry: false
        });

        const stored = statefulPrisma._data.jobs.get('returning-job');
        expect(stored.active).toBe(true);
    });
});
