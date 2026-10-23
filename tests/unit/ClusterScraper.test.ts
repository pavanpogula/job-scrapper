/**
 * @file ClusterScraper Unit Tests
 * @summary Unit test suite for multi-process worker count resolution, round-robin slug sharding, and multi-worker telemetry aggregation
 * @tags Unit Test, Cluster, Multi-Process, Sharding, Telemetry
 */

import { partitionSlugs, resolveWorkerCount } from '../../src/core/ClusterScraper';
import { ErrorReportDocument, ErrorTracker } from '../../src/lib/ErrorTracker';

describe('ClusterScraper Unit Tests', () => {
    describe('resolveWorkerCount', () => {
        it('should parse --workers=N flag and cap at total company count', () => {
            expect(resolveWorkerCount(['node', 'ClusterScraper.ts', '--workers=6'], 100, 8)).toBe(6);
            expect(resolveWorkerCount(['node', 'ClusterScraper.ts', '--workers=8'], 3, 8)).toBe(3);
        });

        it('should default to min(4, cpuCount) when no --workers flag is passed', () => {
            expect(resolveWorkerCount(['node', 'ClusterScraper.ts'], 50, 8)).toBe(4);
            expect(resolveWorkerCount(['node', 'ClusterScraper.ts'], 50, 2)).toBe(2);
        });
    });

    describe('partitionSlugs', () => {
        it('should distribute slugs evenly across shards using round-robin partitioning', () => {
            const slugs = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
            const shards = partitionSlugs(slugs, 3);

            expect(shards).toHaveLength(3);
            expect(shards[0]).toEqual(['c1', 'c4', 'c7']);
            expect(shards[1]).toEqual(['c2', 'c5']);
            expect(shards[2]).toEqual(['c3', 'c6']);
        });
    });

    describe('ErrorTracker.mergeReports', () => {
        it('should aggregate metrics and events across multiple OS worker reports', () => {
            const report1: ErrorReportDocument = {
                schemaVersion: '1.0',
                summary: {
                    runId: 'r1',
                    mode: 'db_scrape',
                    startedAt: '2026-10-22T00:00:00.000Z',
                    completedAt: '2026-10-22T00:00:10.000Z',
                    durationSeconds: 10,
                    companiesAttempted: 3,
                    companiesWithJobs: 2,
                    companiesNotFound: 0,
                    graphqlFallbacksUsed: 1,
                    rateLimitsEncountered: 0,
                    jobsCollected: 45,
                    jobsSanitized: 2,
                    jobsFilteredOut: 1,
                    dbErrors: 0
                },
                events: [
                    {
                        timestamp: '2026-10-22T00:00:05.000Z',
                        category: 'graphql_fallback',
                        companySlug: 'go-augment',
                        message: 'Fallback',
                        actionTaken: 'recovered_6_jobs'
                    }
                ]
            };

            const report2: ErrorReportDocument = {
                schemaVersion: '1.0',
                summary: {
                    runId: 'r2',
                    mode: 'db_scrape',
                    startedAt: '2026-10-22T00:00:00.000Z',
                    completedAt: '2026-10-22T00:00:12.000Z',
                    durationSeconds: 12,
                    companiesAttempted: 3,
                    companiesWithJobs: 2,
                    companiesNotFound: 0,
                    graphqlFallbacksUsed: 0,
                    rateLimitsEncountered: 1,
                    jobsCollected: 115,
                    jobsSanitized: 0,
                    jobsFilteredOut: 0,
                    dbErrors: 0
                },
                events: []
            };

            const merged = ErrorTracker.mergeReports([report1, report2], Date.now() - 5000);
            expect(merged.summary.companiesAttempted).toBe(6);
            expect(merged.summary.companiesWithJobs).toBe(4);
            expect(merged.summary.graphqlFallbacksUsed).toBe(1);
            expect(merged.summary.rateLimitsEncountered).toBe(1);
            expect(merged.summary.jobsCollected).toBe(160);
            expect(merged.summary.jobsSanitized).toBe(2);
            expect(merged.summary.jobsFilteredOut).toBe(1);
            expect(merged.events).toHaveLength(1);
        });
    });
});
