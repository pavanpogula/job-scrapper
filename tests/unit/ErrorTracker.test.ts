/**
 * @file ErrorTracker Unit Tests
 * @summary Unit test suite for run telemetry collection, validation issue recording, and JSON report writing
 * @tags Unit Test, Telemetry, ErrorTracker, Bug Fix Agent
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ErrorTracker } from '../../src/lib/ErrorTracker';

describe('ErrorTracker Unit Tests', () => {
    it('should record validation issues, fallback events, and counters into a structured report', () => {
        const tracker = new ErrorTracker('db_scrape');
        tracker.companiesAttempted = 5;
        tracker.companiesWithJobs = 3;
        tracker.graphqlFallbacksUsed = 1;
        tracker.jobsCollected = 42;

        tracker.recordValidationIssues([
            {
                companySlug: '1password',
                jobId: 'bad-1',
                field: 'id',
                reason: 'Invalid ID',
                action: 'filtered'
            },
            {
                companySlug: '1password',
                jobId: 'good-2',
                field: 'applyUrl',
                reason: 'Missing URL; replaced with canonical Ashby URL',
                action: 'sanitized'
            }
        ]);

        tracker.recordEvent({
            category: 'graphql_fallback',
            companySlug: 'go-augment',
            message: 'Recovered board via GraphQL',
            actionTaken: 'recovered_6_jobs'
        });

        const report = tracker.buildReport();

        expect(report.schemaVersion).toBe('2.0');
        expect(report.summary.mode).toBe('db_scrape');
        expect(report.summary.companiesAttempted).toBe(5);
        expect(report.summary.jobsCollected).toBe(42);
        expect(report.summary.jobsFilteredOut).toBe(1);
        expect(report.summary.jobsSanitized).toBe(1);
        expect(report.events).toHaveLength(3);
    });

    it('should write latest-error-report.json and dated report to disk', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-telemetry-'));
        try {
            const tracker = new ErrorTracker('db_scrape');
            tracker.companiesAttempted = 2;
            tracker.jobsCollected = 10;

            const savedPath = tracker.saveReport(tmpDir);
            expect(fs.existsSync(savedPath!)).toBe(true);

            const compatPath = path.join(tmpDir, 'latest-error-report.json');
            expect(fs.existsSync(compatPath)).toBe(true);

            const parsed = JSON.parse(fs.readFileSync(compatPath, 'utf-8'));
            expect(parsed.summary.mode).toBe('db_scrape');
            expect(parsed.summary.jobsCollected).toBe(10);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
