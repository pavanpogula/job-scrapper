/**
 * @file Unit tests for AshbyScraper.runAll()
 * @summary Tests 100-job streaming flushes, stale job deactivation, and createMany fast-path
 * @tags Testing, Scraper, Batch, Deactivation, createMany
 */

import { createStatefulPrisma } from '../helpers/prismaFactory';
import { FakeRedis } from '../helpers/fakeRedis';
import { Prisma } from '@prisma/client';

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

jest.mock('@prisma/client', () => {
    const actual = jest.requireActual('@prisma/client');
    return {
        ...actual,
        PrismaClient: jest.fn(() => statefulPrisma)
    };
});

jest.mock('../../src/lib/Redis', () => ({
    redis: fakeRedis
}));

jest.mock('../../src/lib/AshbyClient', () => ({
    fetchAshbyBoardWithFallback: jest.fn(),
    extractSalary: jest.fn((job: any) => {
        if (job.compensation) {
            return {
                min: 120000,
                max: 160000,
                currency: 'USD',
                interval: '1 YEAR'
            };
        }
        return {};
    })
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

    test('clears removed salary and sets postalAddress to Prisma.DbNull', async () => {
        // existing job has salary and address
        statefulPrisma._data.jobs.set('job-dropped-salary', {
            ashbyId: 'job-dropped-salary',
            title: 'Engineer',
            companySlug: 'acme-corp',
            active: true,
            isListed: true,
            salaryMin: 150000,
            salaryMax: 180000,
            salaryCurrency: 'USD',
            salaryInterval: '1 YEAR',
            workplaceType: 'Hybrid',
            postalAddress: { addressCountry: 'US' },
            contentHash: 'hash-with-salary'
        });

        // live job has no compensation, no address, no workplaceType
        const liveJobPayload = {
            id: 'job-dropped-salary',
            title: 'Engineer',
            department: 'Engineering',
            location: 'Remote',
            jobUrl: 'https://jobs.ashbyhq.com/acme-corp/job-dropped-salary',
            applyUrl: 'https://jobs.ashbyhq.com/acme-corp/job-dropped-salary/application',
            isListed: true
        };

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [liveJobPayload],
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

        const upsertCalls = statefulPrisma._calls.job.upsert;
        const lastCall = upsertCalls.find((c: any) => c.where.ashbyId === 'job-dropped-salary');
        expect(lastCall).toBeDefined();
        expect(lastCall.update.salaryMin).toBeNull();
        expect(lastCall.update.salaryMax).toBeNull();
        expect(lastCall.update.salaryCurrency).toBeNull();
        expect(lastCall.update.salaryInterval).toBeNull();
        expect(lastCall.update.workplaceType).toBeNull();
        expect(lastCall.update.postalAddress).toBe(Prisma.DbNull);
    });

    test('isolates a failing company (P1-T08 / SCR-07)', async () => {
        (fetchAshbyBoardWithFallback as jest.Mock).mockImplementation(async (slug: string) => {
            if (slug === 'failing-corp') {
                throw new Error('Catastrophic company failure');
            }
            return {
                slug: 'healthy-corp',
                jobs: [
                    {
                        id: 'healthy-job-1',
                        title: 'Healthy Engineer',
                        department: 'Engineering',
                        location: 'Remote',
                        jobUrl: 'https://jobs.ashbyhq.com/healthy-corp/healthy-job-1',
                        applyUrl: 'https://jobs.ashbyhq.com/healthy-corp/healthy-job-1/application',
                        isListed: true
                    }
                ],
                source: 'rest',
                rateLimited: false,
                notFound: false,
                validationIssues: []
            };
        });

        const scraper = new AshbyScraper();
        const report = await scraper.runAll({
            slugs: ['failing-corp', 'healthy-corp'],
            concurrency: 2,
            saveTelemetry: false
        });

        expect(report.summary.companiesAttempted).toBe(2);
        expect(report.summary.companiesFailed).toBe(1);
        expect(report.summary.jobsCollected).toBe(1);

        const companyErrorEvent = report.events.find(
            e => e.category === 'company_error' && e.companySlug === 'failing-corp'
        );
        expect(companyErrorEvent).toBeDefined();
        expect(companyErrorEvent?.actionTaken).toBe('skipped');
    });

    test('flush failure does not drop later batches (P1-T08 / SCR-08)', async () => {
        // Generate 150 jobs so that it splits into two chunks: 100 jobs and 50 jobs
        const jobs150 = Array.from({ length: 150 }, (_, i) => ({
            id: `split-job-${i + 1}`,
            title: `Split Engineer ${i + 1}`,
            department: 'Engineering',
            location: 'Remote',
            jobUrl: `https://jobs.ashbyhq.com/acme-corp/split-job-${i + 1}`,
            applyUrl: `https://jobs.ashbyhq.com/acme-corp/split-job-${i + 1}/application`,
            isListed: true
        }));

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: jobs150,
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        const scraper = new AshbyScraper();
        let batchUpsertCalls = 0;
        const origBatchUpsert = (scraper as any).batchUpsertJobs.bind(scraper);

        jest.spyOn(scraper as any, 'batchUpsertJobs').mockImplementation(async (chunk: any, tracker: any) => {
            batchUpsertCalls++;
            if (batchUpsertCalls === 1) {
                throw new Error('Simulated transient DB connection drop on chunk 1');
            }
            return origBatchUpsert(chunk, tracker);
        });

        const report = await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 1,
            saveTelemetry: false
        });

        // Both batches were attempted to be flushed
        expect(batchUpsertCalls).toBe(2);
        expect(report.summary.dbErrors).toBe(1);

        const dbErrorEvent = report.events.find(
            e => e.category === 'db_error' && e.actionTaken === 'batch_flush_failed'
        );
        expect(dbErrorEvent).toBeDefined();
        expect(dbErrorEvent?.message).toContain('Simulated transient DB connection drop on chunk 1');
    });

    test('records api_error event when posting API request fails', async () => {
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [],
            source: 'none',
            rateLimited: false,
            notFound: false,
            failure: {
                kind: 'http',
                status: 503,
                code: 'http/503/3',
                attempts: 3
            }
        });

        const scraper = new AshbyScraper();
        const report = await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 1,
            saveTelemetry: false
        });

        const apiError = report.events.find(e => e.category === 'api_error');
        expect(apiError).toBeDefined();
        expect(apiError?.subkind).toBe('http_503');
        expect(apiError?.companySlug).toBe('acme-corp');
        expect(apiError?.httpStatus).toBe(503);
        expect(apiError?.attempts).toBe(3);
    });

    test('graphql does not overwrite rest content', async () => {
        const oldDate = new Date('2026-01-01T00:00:00.000Z');
        statefulPrisma._data.jobs.set('job-rich', {
            ashbyId: 'job-rich',
            companySlug: 'acme-corp',
            title: 'Senior REST Engineer',
            active: false,
            metadata: { _source: 'rest', descriptionHtml: '<p>Detailed REST description</p>' },
            contentHash: 'hash-rest',
            updatedAt: oldDate
        });

        // Board returns from GraphQL fallback with shorter/different content
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [
                {
                    id: 'job-rich',
                    title: 'GraphQL Engineer',
                    department: 'Engineering',
                    location: 'Remote',
                    jobUrl: 'https://jobs.ashbyhq.com/acme-corp/job-rich',
                    applyUrl: 'https://jobs.ashbyhq.com/acme-corp/job-rich/application',
                    isListed: true
                }
            ],
            source: 'graphql',
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

        const stored = statefulPrisma._data.jobs.get('job-rich');
        expect(stored).toBeDefined();
        // Title and description must remain from REST, NOT overwritten by GraphQL
        expect(stored.title).toBe('Senior REST Engineer');
        expect(stored.metadata?.descriptionHtml).toBe('<p>Detailed REST description</p>');
        expect(stored.metadata?._source).toBe('rest');
        expect(stored.updatedAt).toEqual(oldDate);
        // Active status was restored via raw SQL
        expect(stored.active).toBe(true);
    });

    test('empty board deferred one run', async () => {
        // Company has 5 active jobs
        statefulPrisma._data.companies.set('acme-corp', {
            id: 'c1',
            slug: 'acme-corp',
            status: 'ACTIVE',
            pendingEmptySince: null
        });

        for (let i = 1; i <= 5; i++) {
            statefulPrisma._data.jobs.set(`job-${i}`, {
                ashbyId: `job-${i}`,
                companySlug: 'acme-corp',
                title: `Job ${i}`,
                active: true,
                contentHash: `hash-${i}`
            });
        }

        // Run 1: empty board returned (200 OK, jobs: [])
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [],
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        const scraper = new AshbyScraper();
        const report1 = await scraper.runAll({
            slugs: ['acme-corp'],
            concurrency: 1,
            saveTelemetry: false
        });

        // Run 1 should DEFER deactivation
        expect(report1.events.some(e => e.category === 'suspicious_empty_board')).toBe(true);
        for (let i = 1; i <= 5; i++) {
            expect(statefulPrisma._data.jobs.get(`job-${i}`).active).toBe(true);
        }
        const companyAfterRun1 = statefulPrisma._data.companies.get('acme-corp');
        expect(companyAfterRun1.pendingEmptySince).toBeInstanceOf(Date);

        // Run 2: empty board returned again
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'acme-corp',
            jobs: [],
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

        // Run 2 should now deactivate stale jobs
        for (let i = 1; i <= 5; i++) {
            expect(statefulPrisma._data.jobs.get(`job-${i}`).active).toBe(false);
        }
        const companyAfterRun2 = statefulPrisma._data.companies.get('acme-corp');
        expect(companyAfterRun2.pendingEmptySince).toBeNull();
    });
});
