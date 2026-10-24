/**
 * @file ClusterScraper Unit Tests
 * @summary Unit test suite for multi-process worker count resolution, round-robin slug sharding, and multi-worker telemetry aggregation
 * @tags Unit Test, Cluster, Multi-Process, Sharding, Telemetry
 */

import { EventEmitter } from 'events';
import * as child_process from 'child_process';
import { partitionSlugs, resolveWorkerCount, runClusterScrape, runWorkerShard } from '../../src/core/ClusterScraper';
import { ErrorReportDocument, ErrorTracker } from '../../src/lib/ErrorTracker';
import { publishCacheGeneration, recordScrapeFinished } from '../../src/cache/Publisher';

jest.mock('../../src/cache/Publisher', () => ({
    publishCacheGeneration: jest.fn().mockResolvedValue({
        attempted: true,
        status: 'published',
        gen: 'mock-gen',
        fields: 10,
        bytes: 1000,
        durationMs: 50
    }),
    recordScrapeFinished: jest.fn().mockResolvedValue(undefined)
}));

class MockChildProcess extends EventEmitter {
    public pid = 1234;
    public send = jest.fn();
    public kill = jest.fn();
}

jest.mock('child_process', () => {
    const actual = jest.requireActual('child_process');
    return {
        ...actual,
        fork: jest.fn()
    };
});

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

    describe('P1-T11 Fault Tolerance and Watchdog Tests', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('1 of 2 fails → report saved, exit 1', async () => {
            const child1 = new MockChildProcess();
            const child2 = new MockChildProcess();

            (child1.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child1.emit('message', {
                        type: 'worker_done',
                        report: {
                            schemaVersion: '2.0',
                            run: { runId: 'w1-report', mode: 'cluster' },
                            summary: {
                                runId: 'w1-report',
                                mode: 'db_scrape',
                                startedAt: new Date().toISOString(),
                                completedAt: new Date().toISOString(),
                                durationSeconds: 2,
                                companiesAttempted: 1,
                                companiesWithJobs: 1,
                                companiesNotFound: 0,
                                companiesFailed: 0,
                                graphqlFallbacksUsed: 0,
                                rateLimitsEncountered: 0,
                                jobsCollected: 25,
                                jobsSanitized: 0,
                                jobsFilteredOut: 0,
                                dbErrors: 0
                            },
                            events: []
                        }
                    });
                    child1.emit('exit', 0, null);
                });
            });

            (child2.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child2.emit('message', {
                        type: 'worker_error',
                        error: 'Prisma cluster connection lost'
                    });
                    child2.emit('exit', 1, null);
                });
            });

            (child_process.fork as jest.Mock)
                .mockReturnValueOnce(child1)
                .mockReturnValueOnce(child2);

            const { PrismaClient } = require('@prisma/client');
            const mockPrisma = new PrismaClient();
            mockPrisma.company.findMany.mockResolvedValueOnce([
                { slug: 'company-1' },
                { slug: 'company-2' }
            ]);

            const report = await runClusterScrape(['node', 'ClusterScraper.ts', '--workers=2']);

            expect(report).not.toBeNull();
            expect(report?.run.outcome).toBe('failed');
            expect(report?.run.exitCode).toBe(1);
            expect(report?.workers).toHaveLength(2);
            expect(report?.workers?.[0].status).toBe('ok');
            expect(report?.workers?.[1].status).toBe('failed');
            expect(report?.categories['worker_failed']?.count).toBe(1);
        });

        test('timeout → SIGTERM then SIGKILL', async () => {
            const child = new MockChildProcess();
            (child_process.fork as jest.Mock).mockReturnValueOnce(child);

            // Do not emit message or exit immediately, trigger timeout
            const shardPromise = runWorkerShard(1, ['timeout-corp'], 5, {
                workerTimeoutMs: 30,
                killGracePeriodMs: 30
            });

            // Wait 40ms to trigger SIGTERM
            await new Promise(r => setTimeout(r, 40));
            expect(child.kill).toHaveBeenCalledWith('SIGTERM');

            // Wait another 40ms to trigger SIGKILL
            await new Promise(r => setTimeout(r, 40));
            expect(child.kill).toHaveBeenCalledWith('SIGKILL');

            // Child terminates under SIGKILL
            child.emit('exit', null, 'SIGKILL');

            const result = await shardPromise;
            expect(result.status).toBe('timeout');
            expect(result.error).toContain('Worker timed out');
        });

        test('2 workers ok -> publishCacheGeneration called once, exit 0', async () => {
            const child1 = new MockChildProcess();
            const child2 = new MockChildProcess();

            const createReport = (id: string) => ({
                schemaVersion: '2.0',
                run: { runId: id, mode: 'cluster' },
                summary: {
                    runId: id,
                    mode: 'db_scrape',
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                    durationSeconds: 2,
                    companiesAttempted: 1,
                    companiesWithJobs: 1,
                    companiesNotFound: 0,
                    companiesFailed: 0,
                    graphqlFallbacksUsed: 0,
                    rateLimitsEncountered: 0,
                    jobsCollected: 10,
                    jobsSanitized: 0,
                    jobsFilteredOut: 0,
                    dbErrors: 0
                },
                events: []
            });

            (child1.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child1.emit('message', { type: 'worker_done', report: createReport('r1') });
                    child1.emit('exit', 0, null);
                });
            });

            (child2.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child2.emit('message', { type: 'worker_done', report: createReport('r2') });
                    child2.emit('exit', 0, null);
                });
            });

            (child_process.fork as jest.Mock)
                .mockReturnValueOnce(child1)
                .mockReturnValueOnce(child2);

            const { PrismaClient } = require('@prisma/client');
            const mockPrisma = new PrismaClient();
            mockPrisma.company.findMany.mockResolvedValueOnce([
                { slug: 'company-1' },
                { slug: 'company-2' }
            ]);

            const report = await runClusterScrape(['node', 'ClusterScraper.ts', '--workers=2']);
            expect(report?.run.outcome).toBe('success');
            expect(report?.run.exitCode).toBe(0);
            expect(publishCacheGeneration).toHaveBeenCalledTimes(1);
        });

        test('1 worker fails -> publishCacheGeneration not called, exit 1', async () => {
            (publishCacheGeneration as jest.Mock).mockClear();
            const child1 = new MockChildProcess();
            const child2 = new MockChildProcess();

            (child1.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child1.emit('message', {
                        type: 'worker_done',
                        report: {
                            schemaVersion: '2.0',
                            run: { runId: 'w1', mode: 'cluster' },
                            summary: { durationSeconds: 1, companiesAttempted: 1, companiesWithJobs: 0, companiesNotFound: 0, companiesFailed: 0, graphqlFallbacksUsed: 0, rateLimitsEncountered: 0, jobsCollected: 0, jobsSanitized: 0, jobsFilteredOut: 0, dbErrors: 0 },
                            events: []
                        }
                    });
                    child1.emit('exit', 0, null);
                });
            });

            (child2.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child2.emit('message', { type: 'worker_error', error: 'boom' });
                    child2.emit('exit', 1, null);
                });
            });

            (child_process.fork as jest.Mock)
                .mockReturnValueOnce(child1)
                .mockReturnValueOnce(child2);

            const { PrismaClient } = require('@prisma/client');
            const mockPrisma = new PrismaClient();
            mockPrisma.company.findMany.mockResolvedValueOnce([
                { slug: 'c1' },
                { slug: 'c2' }
            ]);

            const report = await runClusterScrape(['node', 'ClusterScraper.ts', '--workers=2']);
            expect(report?.run.outcome).toBe('failed');
            expect(report?.run.exitCode).toBe(1);
            expect(publishCacheGeneration).not.toHaveBeenCalled();
            expect(report?.cache?.status).toBe('skipped_incomplete_run');
        });

        test('publish fails -> exit 2', async () => {
            (publishCacheGeneration as jest.Mock).mockResolvedValueOnce({
                attempted: true,
                status: 'failed',
                durationMs: 10,
                error: 'Redis connection dropped'
            });

            const child1 = new MockChildProcess();
            (child1.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child1.emit('message', {
                        type: 'worker_done',
                        report: {
                            schemaVersion: '2.0',
                            run: { runId: 'w1', mode: 'cluster' },
                            summary: { durationSeconds: 1, companiesAttempted: 1, companiesWithJobs: 0, companiesNotFound: 0, companiesFailed: 0, graphqlFallbacksUsed: 0, rateLimitsEncountered: 0, jobsCollected: 0, jobsSanitized: 0, jobsFilteredOut: 0, dbErrors: 0 },
                            events: []
                        }
                    });
                    child1.emit('exit', 0, null);
                });
            });

            (child_process.fork as jest.Mock).mockReturnValueOnce(child1);

            const { PrismaClient } = require('@prisma/client');
            const mockPrisma = new PrismaClient();
            mockPrisma.company.findMany.mockResolvedValueOnce([{ slug: 'c1' }]);

            const report = await runClusterScrape(['node', 'ClusterScraper.ts', '--workers=1']);
            expect(report?.run.outcome).toBe('failed');
            expect(report?.run.exitCode).toBe(2);
            expect(report?.cache?.status).toBe('failed');
        });

        test('skip-publish -> recordScrapeFinished called, publisher not called, exit 0', async () => {
            (publishCacheGeneration as jest.Mock).mockClear();
            (recordScrapeFinished as jest.Mock).mockClear();

            const child1 = new MockChildProcess();
            (child1.send as jest.Mock).mockImplementation(() => {
                setImmediate(() => {
                    child1.emit('message', {
                        type: 'worker_done',
                        report: {
                            schemaVersion: '2.0',
                            run: { runId: 'w1', mode: 'cluster' },
                            summary: { durationSeconds: 1, companiesAttempted: 1, companiesWithJobs: 0, companiesNotFound: 0, companiesFailed: 0, graphqlFallbacksUsed: 0, rateLimitsEncountered: 0, jobsCollected: 0, jobsSanitized: 0, jobsFilteredOut: 0, dbErrors: 0 },
                            events: []
                        }
                    });
                    child1.emit('exit', 0, null);
                });
            });

            (child_process.fork as jest.Mock).mockReturnValueOnce(child1);

            const { PrismaClient } = require('@prisma/client');
            const mockPrisma = new PrismaClient();
            mockPrisma.company.findMany.mockResolvedValueOnce([{ slug: 'c1' }]);

            const report = await runClusterScrape(['node', 'ClusterScraper.ts', '--workers=1', '--skip-publish']);
            expect(report?.run.outcome).toBe('success');
            expect(report?.run.exitCode).toBe(0);
            expect(publishCacheGeneration).not.toHaveBeenCalled();
            expect(recordScrapeFinished).toHaveBeenCalledTimes(1);
            expect(report?.cache?.status).toBe('skipped_flag');
        });
    });
});
