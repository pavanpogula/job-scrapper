/**
 * @file ReportClassifier Unit Tests (P1-T10 / LOOP-05 / TEST-07)
 * @summary Tests all classification rules R-*, deterministic fingerprint normalization, regression detection, and issue capping
 * @tags Unit Test, Classifier, Report, Rules, Fingerprint
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    classifyReport,
    computeIssueFingerprint,
    normalizeMessage
} from '../../src/lib/ReportClassifier';
import { ErrorReportDocument } from '../../src/lib/ErrorTracker';

describe('ReportClassifier Unit Tests (P1-T10 / LOOP-05)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classifier-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function createBaseReport(): ErrorReportDocument {
        return {
            schemaVersion: '2.0',
            run: {
                runId: '20261024T060000Z-cluster-abc1234',
                mode: 'cluster',
                trigger: 'schedule',
                gitSha: 'abc1234',
                gitBranch: 'main',
                nodeVersion: 'v24.21.0',
                startedAt: '2026-10-24T06:00:00.000Z',
                completedAt: '2026-10-24T06:01:00.000Z',
                durationSeconds: 60,
                outcome: 'success',
                exitCode: 0
            },
            summary: {
                runId: '20261024T060000Z-cluster-abc1234',
                mode: 'cluster',
                startedAt: '2026-10-24T06:00:00.000Z',
                completedAt: '2026-10-24T06:01:00.000Z',
                durationSeconds: 60,
                companiesAttempted: 100,
                companiesWithJobs: 95,
                companiesNotFound: 5,
                companiesFailed: 0,
                graphqlFallbacksUsed: 2,
                rateLimitsEncountered: 0,
                jobsCollected: 2000,
                jobsSanitized: 0,
                jobsFilteredOut: 0,
                dbErrors: 0
            },
            categories: {},
            events: []
        };
    }

    test('fingerprint normalisation is stable across UUIDs, numbers, URLs, and hex hashes', () => {
        const msg1 = 'Failed to fetch job 12345678-1234-1234-1234-123456789abc from https://jobs.ashbyhq.com/acme/123 after 3 attempts with hash deadbeefcafe1234';
        const msg2 = 'Failed to fetch job 98765432-4321-4321-4321-abcdef123456 from https://jobs.ashbyhq.com/foo/456 after 7 attempts with hash abcdef1234567890';

        const norm1 = normalizeMessage(msg1);
        const norm2 = normalizeMessage(msg2);

        expect(norm1).toBe(norm2);
        expect(computeIssueFingerprint('api_error', 'fetch', 'id', msg1)).toBe(
            computeIssueFingerprint('api_error', 'fetch', 'id', msg2)
        );
    });

    test('R-INFRA-1: Prisma connection errors trigger infra_alert and suppress fixer', () => {
        const report = createBaseReport();
        report.events.push({
            id: 'ev-1',
            timestamp: new Date().toISOString(),
            category: 'db_error',
            companySlug: 'system',
            message: 'PrismaClientInitializationError: P1001: Can\'t reach database server',
            actionTaken: 'batch_flush_failed'
        });

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.infraAlert).toBe(true);
        expect(res.actionable).toBe(false);
    });

    test('R-RUN-1: non-success outcome triggers actionable S1', () => {
        const report = createBaseReport();
        report.run.outcome = 'failed';
        report.run.exitCode = 1;

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].rule).toBe('R-RUN-1');
        expect(res.issues[0].severity).toBe('S1');
    });

    test('R-DB-1: db_error triggers actionable S1', () => {
        const report = createBaseReport();
        report.events.push({
            id: 'ev-db',
            timestamp: new Date().toISOString(),
            category: 'db_error',
            companySlug: 'acme',
            message: 'Unique constraint failed on the fields: (`ashbyId`)',
            actionTaken: 'batch_flush_failed'
        });

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].rule).toBe('R-DB-1');
        expect(res.issues[0].severity).toBe('S1');
    });

    test('R-VAL-1: new validation_filtered issue triggers actionable S2', () => {
        const report = createBaseReport();
        report.events.push({
            id: 'ev-val',
            timestamp: new Date().toISOString(),
            category: 'validation_filtered',
            subkind: 'id',
            companySlug: 'acme',
            field: 'id',
            message: 'Invalid ID: placeholder found',
            actionTaken: 'filtered'
        });

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].rule).toBe('R-VAL-1');
        expect(res.issues[0].severity).toBe('S2');
    });

    test('R-VAL-2: new validation_sanitized with count >= 50 triggers actionable S3', () => {
        const report = createBaseReport();
        for (let i = 0; i < 55; i++) {
            report.events.push({
                id: `ev-san-${i}`,
                timestamp: new Date().toISOString(),
                category: 'validation_sanitized',
                subkind: 'applyUrl',
                companySlug: `company-${i}`,
                field: 'applyUrl',
                message: 'Invalid URL scheme replaced with canonical Ashby URL',
                actionTaken: 'sanitized'
            });
        }

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].rule).toBe('R-VAL-2');
        expect(res.issues[0].severity).toBe('S3');
    });

    test('R-API-1 vs R-API-2: transient api_error on 1 company is noise, > 5% is actionable S2', () => {
        // Transient 1 company: noise
        const reportNoise = createBaseReport();
        reportNoise.events.push({
            id: 'ev-api-noise',
            timestamp: new Date().toISOString(),
            category: 'api_error',
            companySlug: 'acme',
            message: '504 Gateway Timeout',
            actionTaken: 'retry'
        });
        const resNoise = classifyReport(reportNoise, { outputDir: tmpDir });
        expect(resNoise.actionable).toBe(false);

        // > 5% companies: actionable
        const reportActionable = createBaseReport();
        for (let i = 1; i <= 6; i++) {
            reportActionable.events.push({
                id: `ev-api-${i}`,
                timestamp: new Date().toISOString(),
                category: 'api_error',
                companySlug: `company-${i}`,
                message: '500 Internal Server Error',
                actionTaken: 'retry'
            });
        }
        const resActionable = classifyReport(reportActionable, { outputDir: tmpDir });
        expect(resActionable.actionable).toBe(true);
        expect(resActionable.issues[0].rule).toBe('R-API-1');
    });

    test('R-CO-1: company_error triggers actionable S2', () => {
        const report = createBaseReport();
        report.events.push({
            id: 'ev-co',
            timestamp: new Date().toISOString(),
            category: 'company_error',
            companySlug: 'failing-corp',
            message: 'Syntax error in GraphQL query response',
            actionTaken: 'skipped'
        });

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].rule).toBe('R-CO-1');
        expect(res.issues[0].severity).toBe('S2');
    });

    test('R-REGRESS-1: previously resolved fingerprint triggers regressed S1 priority', () => {
        const historyPath = path.join(tmpDir, 'run-history.json');
        const regressedMsg = 'Recurring corrupt data payload in company';
        const fp = computeIssueFingerprint('validation_filtered', 'id', 'id', regressedMsg);

        // Seed history where fp was resolved
        fs.writeFileSync(
            historyPath,
            JSON.stringify([
                {
                    runId: 'old-run-1',
                    startedAt: '2026-10-23T00:00:00.000Z',
                    durationSeconds: 60,
                    outcome: 'success',
                    companiesWithJobs: 10,
                    jobsCollected: 100,
                    fingerprints: [],
                    resolvedFingerprints: [fp]
                }
            ]),
            'utf8'
        );

        const report = createBaseReport();
        report.events.push({
            id: 'ev-regress',
            timestamp: new Date().toISOString(),
            category: 'validation_filtered',
            subkind: 'id',
            field: 'id',
            companySlug: 'acme',
            message: regressedMsg,
            actionTaken: 'filtered'
        });

        const res = classifyReport(report, { outputDir: tmpDir, runHistoryPath: historyPath });
        expect(res.actionable).toBe(true);
        expect(res.issues[0].status).toBe('regressed');
        expect(res.issues[0].severity).toBe('S1');
        expect(res.issues[0].rule).toBe('R-REGRESS-1');
    });

    test('R-RECUR-1: open PR matching fingerprint suppresses fixer trigger', () => {
        const msg = 'Some duplicate job id error';
        const fp = computeIssueFingerprint('validation_filtered', 'id', 'id', msg);

        const report = createBaseReport();
        report.events.push({
            id: 'ev-open',
            timestamp: new Date().toISOString(),
            category: 'validation_filtered',
            subkind: 'id',
            field: 'id',
            companySlug: 'acme',
            message: msg,
            actionTaken: 'filtered'
        });

        const res = classifyReport(report, {
            outputDir: tmpDir,
            openPrs: [
                {
                    headRefName: 'auto-fix/20261023T000000Z',
                    body: `Auto-fix PR\n<!-- fp:${fp} -->`
                }
            ]
        });

        expect(res.actionable).toBe(false);
        expect(res.issues).toHaveLength(0);
    });

    test('issues list is capped at 3 actionable items', () => {
        const report = createBaseReport();
        // Add 5 distinct categories of errors
        report.events.push(
            { id: '1', timestamp: new Date().toISOString(), category: 'company_error', companySlug: 'c1', message: 'Err 1', actionTaken: 'skipped' },
            { id: '2', timestamp: new Date().toISOString(), category: 'company_error', companySlug: 'c2', message: 'Err 2', actionTaken: 'skipped' },
            { id: '3', timestamp: new Date().toISOString(), category: 'company_error', companySlug: 'c3', message: 'Err 3', actionTaken: 'skipped' },
            { id: '4', timestamp: new Date().toISOString(), category: 'company_error', companySlug: 'c4', message: 'Err 4', actionTaken: 'skipped' },
            { id: '5', timestamp: new Date().toISOString(), category: 'company_error', companySlug: 'c5', message: 'Err 5', actionTaken: 'skipped' }
        );

        const res = classifyReport(report, { outputDir: tmpDir });
        expect(res.issues.length).toBeLessThanOrEqual(3);
    });
});
