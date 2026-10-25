/**
 * @file ErrorTracker v2 Unit Tests (P1-T10 / TEST-07)
 * @summary Tests runId naming, distinct files per mode, category event caps with exact counts, and numeric report merging
 * @tags Unit Test, ErrorTracker, SchemaV2, Telemetry
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorTracker, generateRunId } from '../../src/lib/ErrorTracker';

describe('ErrorTracker v2 Suite (P1-T10 / TEST-07)', () => {
    test('run-id naming matches standard pattern', () => {
        const idSingle = generateRunId('single', Date.now());
        expect(idSingle).toMatch(/^\d{8}T\d{6}Z-single-[0-9a-zA-Z_-]+$/);

        const idCluster = generateRunId('cluster', Date.now());
        expect(idCluster).toMatch(/^\d{8}T\d{6}Z-cluster-[0-9a-zA-Z_-]+$/);

        const idCsv = generateRunId('csv', Date.now());
        expect(idCsv).toMatch(/^\d{8}T\d{6}Z-csv-[0-9a-zA-Z_-]+$/);
    });

    test('two saves in the same second in different modes give two distinct files without collision', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-tracker-v2-'));
        try {
            const trackerDb = new ErrorTracker('db_scrape');
            const trackerCsv = new ErrorTracker('csv_scrape');

            const pathDb = trackerDb.saveReport(tmpDir);
            const pathCsv = trackerCsv.saveReport(tmpDir);

            expect(pathDb).not.toBe(pathCsv);
            expect(fs.existsSync(pathDb)).toBe(true);
            expect(fs.existsSync(pathCsv)).toBe(true);

            // Check latest files
            const latestSingle = path.join(tmpDir, 'latest-single.json');
            const latestCsv = path.join(tmpDir, 'latest-csv.json');
            const latestCompat = path.join(tmpDir, 'latest-error-report.json');

            expect(fs.existsSync(latestSingle)).toBe(true);
            expect(fs.existsSync(latestCsv)).toBe(true);
            expect(fs.existsSync(latestCompat)).toBe(true);

            // CSV mode does not overwrite latest-error-report.json (09 #36)
            const compatContent = JSON.parse(fs.readFileSync(latestCompat, 'utf8'));
            expect(compatContent.run.mode).toBe('single');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('per-category caps with exact counts (100 events max stored, counts exact)', () => {
        const tracker = new ErrorTracker('db_scrape');

        // Record 150 validation_filtered events
        for (let i = 1; i <= 150; i++) {
            tracker.recordEvent({
                category: 'validation_filtered',
                companySlug: `company-${i % 5}`,
                jobId: `job-${i}`,
                field: 'title',
                message: 'Empty job title',
                actionTaken: 'filtered'
            });
        }

        const report = tracker.buildReport();
        expect(report.categories.validation_filtered.count).toBe(150);
        expect(report.categories.validation_filtered.distinctCompanies).toBe(5);

        const filteredEvents = report.events.filter(e => e.category === 'validation_filtered');
        expect(filteredEvents).toHaveLength(100);
    });

    test('numeric merge sums every field across worker reports', () => {
        const t1 = new ErrorTracker('db_scrape');
        t1.companiesAttempted = 10;
        t1.companiesWithJobs = 8;
        t1.companiesNotFound = 2;
        t1.companiesFailed = 1;
        t1.jobsCollected = 100;
        t1.jobsCreated = 20;
        t1.jobsUpdated = 30;
        t1.jobsSanitized = 5;
        t1.jobsFilteredOut = 2;
        t1.dbErrors = 1;
        t1.graphqlFallbacksUsed = 3;
        t1.rateLimitsEncountered = 2;
        t1.recordEvent({
            category: 'api_error',
            companySlug: 'c1',
            message: '500 error',
            actionTaken: 'retry'
        });

        const t2 = new ErrorTracker('db_scrape');
        t2.companiesAttempted = 15;
        t2.companiesWithJobs = 12;
        t2.companiesNotFound = 3;
        t2.companiesFailed = 0;
        t2.jobsCollected = 150;
        t2.jobsCreated = 40;
        t2.jobsUpdated = 50;
        t2.jobsSanitized = 8;
        t2.jobsFilteredOut = 4;
        t2.dbErrors = 2;
        t2.graphqlFallbacksUsed = 4;
        t2.rateLimitsEncountered = 1;
        t2.recordEvent({
            category: 'api_error',
            companySlug: 'c2',
            message: '502 bad gateway',
            actionTaken: 'retry'
        });

        const r1 = t1.buildReport();
        const r2 = t2.buildReport();

        const merged = ErrorTracker.mergeReports([r1, r2], Date.now() - 5000, 'cluster');

        expect(merged.summary.companiesAttempted).toBe(25);
        expect(merged.summary.companiesWithJobs).toBe(20);
        expect(merged.summary.companiesNotFound).toBe(5);
        expect(merged.summary.companiesFailed).toBe(1);
        expect(merged.summary.jobsCollected).toBe(250);
        expect(merged.summary.jobsCreated).toBe(60);
        expect(merged.summary.jobsUpdated).toBe(80);
        expect(merged.summary.jobsSanitized).toBe(13);
        expect(merged.summary.jobsFilteredOut).toBe(6);
        expect(merged.summary.dbErrors).toBe(3);
        expect(merged.summary.graphqlFallbacksUsed).toBe(7);
        expect(merged.summary.rateLimitsEncountered).toBe(3);

        expect(merged.categories.api_error.count).toBe(2);
        expect(merged.events).toHaveLength(2);
    });
});
