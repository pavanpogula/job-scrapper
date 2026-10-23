/**
 * @file Verify Utility Unit Tests
 * @summary Unit test suite for verifyDatabase() table counts, salary audit, and sanitization integrity checks
 * @tags Unit Test, Verify, Database, Integrity, Audit
 */

import { verifyDatabase } from '../../src/utils/Verify';

const mockCompanyCount = jest.fn();
const mockCompanyFindMany = jest.fn();
const mockJobCount = jest.fn();
const mockJobFindMany = jest.fn();
const mockDeptCount = jest.fn();
const mockLocCount = jest.fn();

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => ({
        company: {
            count: (...args: any[]) => mockCompanyCount(...args),
            findMany: (...args: any[]) => mockCompanyFindMany(...args)
        },
        job: {
            count: (...args: any[]) => mockJobCount(...args),
            findMany: (...args: any[]) => mockJobFindMany(...args)
        },
        department: {
            count: (...args: any[]) => mockDeptCount(...args)
        },
        location: {
            count: (...args: any[]) => mockLocCount(...args)
        },
        $disconnect: jest.fn().mockResolvedValue(undefined)
    }))
}));

describe('Verify Database Auditor Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return accurate table counts and 0 integrity issues for clean jobs', async () => {
        mockCompanyCount
            .mockResolvedValueOnce(7)
            .mockResolvedValueOnce(6)
            .mockResolvedValueOnce(1);
        mockJobCount
            .mockResolvedValueOnce(160)
            .mockResolvedValueOnce(160)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(39);
        mockDeptCount.mockResolvedValueOnce(21);
        mockLocCount.mockResolvedValueOnce(20);
        mockCompanyFindMany.mockResolvedValueOnce([
            { slug: '1password', status: 'ACTIVE', _count: { jobs: 86 } }
        ]);
        mockJobFindMany
            .mockResolvedValueOnce([
                {
                    ashbyId: 'j1',
                    title: 'Senior Engineer',
                    applyUrl: 'https://jobs.ashbyhq.com/1password/j1/application',
                    metadata: { clean: true }
                }
            ])
            .mockResolvedValueOnce([
                {
                    companySlug: 'abridge',
                    title: 'Staff Engineer',
                    salaryMin: 205000,
                    salaryMax: 300000,
                    salaryCurrency: 'USD',
                    location: { name: 'SF Office' }
                }
            ]);

        const report = await verifyDatabase();
        expect(report.companiesTotal).toBe(7);
        expect(report.companiesActive).toBe(6);
        expect(report.jobsTotal).toBe(160);
        expect(report.jobsWithSalary).toBe(39);
        expect(report.departmentsTotal).toBe(21);
        expect(report.locationsTotal).toBe(20);
        expect(report.emptyTitles).toBe(0);
        expect(report.invalidApplyUrls).toBe(0);
        expect(report.nullByteMetadataIssues).toBe(0);
    });
});
