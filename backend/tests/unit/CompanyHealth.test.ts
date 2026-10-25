/**
 * @file Company Health Unit Tests
 * @summary Unit test suite for company health tracking, 3-strike quarantine, weekly NOT_FOUND rechecks, and failure isolation
 * @tags Unit Test, CompanyHealth, Quarantine, Scraper, Resilience
 */

import { createStatefulPrisma } from '../helpers/prismaFactory';
import { FakeRedis } from '../helpers/fakeRedis';

const statefulPrisma = createStatefulPrisma({
    companies: [
        {
            slug: 'dying-corp',
            status: 'ACTIVE',
            consecutiveNotFound: 0,
            consecutiveFailures: 0
        },
        {
            slug: 'recovering-corp',
            status: 'ACTIVE',
            consecutiveNotFound: 2,
            consecutiveFailures: 3
        },
        {
            slug: 'quarantined-corp',
            status: 'NOT_FOUND',
            consecutiveNotFound: 3,
            consecutiveFailures: 0
        },
        {
            slug: 'unstable-corp',
            status: 'ACTIVE',
            consecutiveNotFound: 0,
            consecutiveFailures: 6
        }
    ],
    jobs: [
        {
            ashbyId: 'dying-job-1',
            companySlug: 'dying-corp',
            title: 'Dying Engineer',
            active: true,
            isListed: true,
            contentHash: 'hash-dying-1'
        },
        {
            ashbyId: 'quarantined-job-1',
            companySlug: 'quarantined-corp',
            title: 'Quarantined Engineer',
            active: false,
            isListed: true,
            contentHash: 'hash-quarantined-1'
        },
        {
            ashbyId: 'unstable-job-1',
            companySlug: 'unstable-corp',
            title: 'Unstable Engineer',
            active: true,
            isListed: true,
            contentHash: 'hash-unstable-1'
        }
    ]
});

jest.mock('@prisma/client', () => {
    const actual = jest.requireActual('@prisma/client');
    return {
        ...actual,
        PrismaClient: jest.fn(() => statefulPrisma)
    };
});

jest.mock('../../src/lib/Redis', () => ({
    redis: new FakeRedis()
}));

jest.mock('../../src/lib/AshbyClient', () => ({
    fetchAshbyBoardWithFallback: jest.fn(),
    extractSalary: jest.fn(() => ({}))
}));

import { AshbyScraper } from '../../src/core/Scraper';
import { fetchAshbyBoardWithFallback } from '../../src/lib/AshbyClient';

describe('Company Health Unit Tests (P1-T07 / SCR-05, SCR-06, SCR-21; D-10)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('quarantine after 3 consecutive runs with 404', async () => {
        const scraper = new AshbyScraper();

        // Run 1: 404 -> consecutiveNotFound = 1, status = ACTIVE
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'dying-corp',
            jobs: [],
            source: 'none',
            rateLimited: false,
            notFound: true,
            validationIssues: []
        });

        await scraper.runAll({ slugs: ['dying-corp'], saveTelemetry: false });
        let company = statefulPrisma._data.companies.get('dying-corp');
        expect(company.consecutiveNotFound).toBe(1);
        expect(company.status).toBe('ACTIVE');
        expect(statefulPrisma._data.jobs.get('dying-job-1').active).toBe(true);

        // Run 2: 404 -> consecutiveNotFound = 2, status = ACTIVE
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'dying-corp',
            jobs: [],
            source: 'none',
            rateLimited: false,
            notFound: true,
            validationIssues: []
        });

        await scraper.runAll({ slugs: ['dying-corp'], saveTelemetry: false });
        company = statefulPrisma._data.companies.get('dying-corp');
        expect(company.consecutiveNotFound).toBe(2);
        expect(company.status).toBe('ACTIVE');
        expect(statefulPrisma._data.jobs.get('dying-job-1').active).toBe(true);

        // Run 3: 404 -> consecutiveNotFound = 3, status = NOT_FOUND, active jobs deactivated
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'dying-corp',
            jobs: [],
            source: 'none',
            rateLimited: false,
            notFound: true,
            validationIssues: []
        });

        const report = await scraper.runAll({ slugs: ['dying-corp'], saveTelemetry: false });
        company = statefulPrisma._data.companies.get('dying-corp');
        expect(company.consecutiveNotFound).toBe(3);
        expect(company.status).toBe('NOT_FOUND');
        expect(statefulPrisma._data.jobs.get('dying-job-1').active).toBe(false);

        // Emits company_quarantined event
        const quarantinedEvent = report.events.find(
            e => e.category === 'company_quarantined' && e.companySlug === 'dying-corp'
        );
        expect(quarantinedEvent).toBeDefined();
        expect(quarantinedEvent?.actionTaken).toBe('status_not_found');
    });

    test('success resets counters and sets status ACTIVE', async () => {
        const scraper = new AshbyScraper();

        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'recovering-corp',
            jobs: [
                {
                    id: 'new-live-job',
                    title: 'Senior Engineer',
                    applyUrl: 'https://jobs.ashbyhq.com/recovering-corp/new-live-job/application',
                    isListed: true
                }
            ],
            source: 'rest',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        await scraper.runAll({ slugs: ['recovering-corp'], saveTelemetry: false });
        const company = statefulPrisma._data.companies.get('recovering-corp');
        expect(company.consecutiveNotFound).toBe(0);
        expect(company.consecutiveFailures).toBe(0);
        expect(company.status).toBe('ACTIVE');
        expect(company.lastSuccessAt).toBeInstanceOf(Date);
        expect(company.lastCheckedAt).toBeInstanceOf(Date);
        expect(statefulPrisma.$executeRaw).toHaveBeenCalled();
    });

    test('sunday recheck includes NOT_FOUND', async () => {
        const scraper = new AshbyScraper();

        (fetchAshbyBoardWithFallback as jest.Mock).mockImplementation((slug: string) => {
            if (slug === 'quarantined-corp') {
                return Promise.resolve({
                    slug: 'quarantined-corp',
                    jobs: [
                        {
                            id: 'recovered-job-1',
                            title: 'Back From The Dead',
                            applyUrl: 'https://jobs.ashbyhq.com/quarantined-corp/recovered-job-1/application',
                            isListed: true
                        }
                    ],
                    source: 'rest',
                    rateLimited: false,
                    notFound: false,
                    validationIssues: []
                });
            }
            return Promise.resolve({
                slug,
                jobs: [],
                source: 'rest',
                rateLimited: false,
                notFound: false,
                validationIssues: []
            });
        });

        // Recheck triggered with recheckNotFound: true
        await scraper.runAll({ recheckNotFound: true, saveTelemetry: false });

        // quarantined-corp was included in the run, and recovered to ACTIVE
        const company = statefulPrisma._data.companies.get('quarantined-corp');
        expect(company.status).toBe('ACTIVE');
        expect(company.consecutiveNotFound).toBe(0);
    });

    test('reaching 7 failures emits company_unreachable without deactivating', async () => {
        const scraper = new AshbyScraper();

        statefulPrisma._data.companies.set('unstable-corp', {
            slug: 'unstable-corp',
            status: 'ACTIVE',
            consecutiveNotFound: 0,
            consecutiveFailures: 6
        });
        statefulPrisma._data.jobs.set('unstable-job-1', {
            ashbyId: 'unstable-job-1',
            companySlug: 'unstable-corp',
            title: 'Unstable Engineer',
            active: true,
            isListed: true,
            contentHash: 'hash-unstable-1'
        });

        // 7th consecutive transient failure (5xx/timeout/network, source: 'none', notFound: false)
        (fetchAshbyBoardWithFallback as jest.Mock).mockResolvedValueOnce({
            slug: 'unstable-corp',
            jobs: [],
            source: 'none',
            rateLimited: false,
            notFound: false,
            validationIssues: []
        });

        const report = await scraper.runAll({ slugs: ['unstable-corp'], saveTelemetry: false });
        const company = statefulPrisma._data.companies.get('unstable-corp');
        expect(company.consecutiveFailures).toBe(7);
        expect(company.status).toBe('ACTIVE'); // Never auto-quarantined on network failures (D-10)
        expect(statefulPrisma._data.jobs.get('unstable-job-1').active).toBe(true); // Jobs preserved

        const unreachableEvent = report.events.find(
            e => e.category === 'company_unreachable' && e.companySlug === 'unstable-corp'
        );
        expect(unreachableEvent).toBeDefined();
        expect(unreachableEvent?.actionTaken).toBe('alert_unreachable');
    });
});
