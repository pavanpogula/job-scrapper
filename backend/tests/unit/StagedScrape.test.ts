/**
 * @file Staged scrape (BF-025) Unit Tests
 * @summary Tests --staged stage order, failure isolation, single publish, Lever 1-worker stage with its own deadline/watchdog, per-source telemetry, flag parsing, signal listeners, and the unchanged interleaved payload
 * @tags Unit Test, Cluster, Staged, Lever, BF-025, BF-017, ADR-0022
 */

import { EventEmitter } from 'events';
import * as child_process from 'child_process';

const mockDisconnect = jest.fn().mockResolvedValue(undefined);
jest.mock('@prisma/client', () => {
    const actualMock = jest.requireActual('../../__mocks__/@prisma/client');
    return {
        ...actualMock,
        PrismaClient: jest.fn().mockImplementation(() => ({
            company: actualMock.mockCompany,
            job: actualMock.mockJob,
            department: actualMock.mockDepartment,
            location: actualMock.mockLocation,
            $transaction: jest.fn().mockResolvedValue([]),
            $disconnect: mockDisconnect,
            $queryRaw: jest.fn().mockResolvedValue([]),
            $queryRawUnsafe: jest.fn().mockResolvedValue([])
        }))
    };
});

import {
    orderStages,
    parseLeverStageMinutes,
    runClusterScrape
} from '../../src/core/ClusterScraper';
import { AshbyScraper, buildIpcScraperOptions, DEFAULT_LEVER_DEADLINE_MS } from '../../src/core/Scraper';
import { parseLeverMaxBoards, selectCompanies } from '../../src/core/selectCompanies';
import { ErrorReportDocument, ErrorTracker } from '../../src/lib/ErrorTracker';
import { classifyReport } from '../../src/lib/ReportClassifier';
import { publishCacheGeneration, recordScrapeFinished } from '../../src/cache/Publisher';
import { AtsSource, toDbAts } from '../../src/lib/ats/source';
import { createStatefulPrisma } from '../helpers/prismaFactory';
import { BoardRef } from '../../src/lib/ats/AtsClient';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

jest.mock('child_process', () => {
    const actual = jest.requireActual('child_process');
    return { ...actual, fork: jest.fn() };
});

class MockChild extends EventEmitter {
    public pid = 4242;
    public send = jest.fn();
    public kill = jest.fn();
}

/** Worker report fixtures are minimal on purpose; cast once through unknown instead of using any */
function asReport(report: unknown): ErrorReportDocument {
    return report as ErrorReportDocument;
}

type SentMessage = {
    workerId: number;
    workerCount?: number;
    slugs: string[];
    concurrency?: number;
    sources?: string[];
    leverDeadlineMs?: number;
};

function workerReport(source: string, companies: number) {
    return {
        schemaVersion: '2.0',
        run: { runId: `w-${source}`, mode: 'cluster' },
        summary: {
            runId: `w-${source}`,
            mode: 'db_scrape',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationSeconds: 1,
            companiesAttempted: companies,
            companiesWithJobs: companies,
            companiesNotFound: 0,
            companiesFailed: 0,
            graphqlFallbacksUsed: 0,
            rateLimitsEncountered: 0,
            jobsCollected: companies * 10,
            jobsSanitized: 0,
            jobsFilteredOut: 0,
            dbErrors: 0,
            bySource: {
                [source]: {
                    companiesAttempted: companies,
                    companiesWithJobs: companies,
                    jobsCollected: companies * 10,
                    notFound: 0,
                    apiErrors: 0
                }
            }
        },
        events: [],
        categories: {}
    };
}

/**
 * Installs a fork mock whose children answer each send() with worker_done (or worker_error for failing sources),
 * logging 'f' (fork) and 'e' (exit) so stage ordering can be asserted.
 */
function installForkMock(opts: { failSources?: string[]; onSend?: (msg: SentMessage) => void } = {}) {
    const log: string[] = [];
    const sent: SentMessage[] = [];
    (child_process.fork as jest.Mock).mockImplementation(() => {
        log.push('f');
        const child = new MockChild();
        child.send.mockImplementation((msg: SentMessage) => {
            sent.push(msg);
            opts.onSend?.(msg);
            const source = msg.sources?.[0] ?? 'unknown';
            setImmediate(() => {
                if (opts.failSources?.includes(source)) {
                    child.emit('message', { type: 'worker_error', error: `${source} exploded` });
                    log.push('e');
                    child.emit('exit', 1, null);
                } else {
                    child.emit('message', {
                        type: 'worker_done',
                        report: workerReport(source, msg.slugs.length)
                    });
                    log.push('e');
                    child.emit('exit', 0, null);
                }
            });
            return true;
        });
        return child;
    });
    return { log, sent };
}

type StageMockSpec = string[] | { slugs: string[]; available?: number };

function sourceFromWhere(where: { source?: string | { in?: string[] } } | undefined): AtsSource | null {
    const srcField = where?.source;
    const raw = typeof srcField === 'string' ? srcField : srcField?.in?.[0];
    if (raw === 'ASHBY') return 'ashby';
    if (raw === 'GREENHOUSE') return 'greenhouse';
    if (raw === 'LEVER') return 'lever';
    return null;
}

function mockCompanies(stages: Partial<Record<AtsSource, StageMockSpec>>) {
    const { PrismaClient: MockPrisma } = require('@prisma/client');
    const prisma = new MockPrisma();
    prisma.company.findMany.mockReset();
    prisma.company.count.mockReset();

    prisma.company.findMany.mockImplementation(
        async (args?: { where?: { source?: string | { in?: string[] }; slug?: { in?: string[] } } }) => {
            const src = sourceFromWhere(args?.where);
            if (!src || !stages[src]) return [];
            const spec = stages[src]!;
            const slugs = Array.isArray(spec) ? spec : spec.slugs;
            const slugFilter = args?.where?.slug?.in;
            const filtered = slugFilter ? slugs.filter(s => slugFilter.includes(s)) : slugs;
            const dbSource = toDbAts(src);
            return filtered.map(slug => ({ slug, source: dbSource }));
        }
    );

    prisma.company.count.mockImplementation(
        async (args?: { where?: { source?: string | { in?: string[] } } }) => {
            const src = sourceFromWhere(args?.where);
            if (!src || !stages[src]) return 0;
            const spec = stages[src]!;
            if (!Array.isArray(spec) && spec.available !== undefined) {
                return spec.available;
            }
            return Array.isArray(spec) ? spec.length : spec.slugs.length;
        }
    );

    return prisma;
}

const STAGED = ['node', 'ClusterScraper.ts', '--staged'];

describe('Staged scrape (BF-025)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (child_process.fork as jest.Mock).mockReset();
    });

    describe('helpers', () => {
        it('orderStages follows registry order whatever the caller typed', () => {
            expect(orderStages(['lever', 'ashby', 'greenhouse'])).toEqual(['ashby', 'greenhouse', 'lever']);
            expect(orderStages(['lever', 'ashby'])).toEqual(['ashby', 'lever']);
        });

        it('parseLeverStageMinutes defaults to 70 and rejects 0, 121 and non-numbers', () => {
            expect(parseLeverStageMinutes(['--staged'])).toBe(70);
            expect(parseLeverStageMinutes(['--lever-stage-min=45'])).toBe(45);
            expect(parseLeverStageMinutes(['--lever-stage-min=120'])).toBe(120);
            for (const bad of ['0', '121', 'abc', '-5', '1.5', '']) {
                expect(parseLeverStageMinutes([`--lever-stage-min=${bad}`])).toBeNull();
            }
        });

        it('parseLeverMaxBoards accepts all (no cap), rejects trailing junk, and falls back to caller default', () => {
            expect(parseLeverMaxBoards([])).toBe(600);
            expect(parseLeverMaxBoards([], 3000)).toBe(3000);
            expect(parseLeverMaxBoards(['--lever-max-boards=all'], 3000)).toBe(Number.POSITIVE_INFINITY);
            expect(parseLeverMaxBoards(['--lever-max-boards=250'], 3000)).toBe(250);
            for (const bad of ['nope', '10abc', '1.5', '0', '-1', '']) {
                expect(parseLeverMaxBoards([`--lever-max-boards=${bad}`], 3000)).toBe(3000);
            }
        });

        it('selectCompanies guards against NaN leverMaxBoards instead of dropping take', async () => {
            const prisma = mockCompanies({ lever: ['l1'] });
            await selectCompanies(prisma, {
                sources: ['lever'],
                statusFilter: 'ACTIVE',
                leverMaxBoards: Number.NaN,
                select: { slug: true, source: true }
            });
            expect(prisma.company.findMany.mock.calls[0][0].take).toBe(600);
        });
    });

    it('runs ashby -> greenhouse -> lever in registry order, one stage fully before the next, Lever with 1 worker and its own deadline', async () => {
        const timeoutSpy = jest.spyOn(global, 'setTimeout');
        const prisma = mockCompanies({
            ashby: ['a1', 'a2'],
            greenhouse: ['g1'],
            lever: { slugs: ['l1', 'l2', 'l3'], available: 1800 }
        });
        const { log, sent } = installForkMock();

        const report = await runClusterScrape(
            [...STAGED, '--sources=lever,ashby,greenhouse', '--workers=2', '--lever-stage-min=70']
        );

        expect(report?.run.exitCode).toBe(0);
        expect(report?.run.workers).toBe(4);
        // Verified source queries happened in registry order (ashby -> greenhouse -> lever)
        const queriedSources = prisma.company.findMany.mock.calls.map(
            (call: Array<{ where?: { source?: string | { in?: string[] } } }>) => sourceFromWhere(call[0]?.where)
        );
        expect(queriedSources).toEqual(['ashby', 'greenhouse', 'lever']);
        // 2 ashby workers, 1 greenhouse, 1 lever; each stage's workers exit before the next stage forks
        expect(log).toEqual(['f', 'f', 'e', 'e', 'f', 'e', 'f', 'e']);
        expect(sent.map(m => m.sources)).toEqual([['ashby'], ['ashby'], ['greenhouse'], ['lever']]);
        expect(prisma.$disconnect).toHaveBeenCalledTimes(1);

        const lever = sent[3];
        expect(lever.workerCount).toBe(1);
        expect(lever.leverDeadlineMs).toBe(65 * 60_000);
        for (const m of sent.slice(0, 3)) {
            expect('leverDeadlineMs' in m).toBe(false);
        }

        // Lever watchdog = stage + 5 min; Ashby/Greenhouse keep the 15-minute default
        const delays = timeoutSpy.mock.calls.map(c => c[1]);
        expect(delays).toContain(75 * 60_000);
        expect(delays).toContain(900_000);
        timeoutSpy.mockRestore();
    });

    it('a failed stage never stops the later stages, skips the publish and exits 1 with a stage-tagged event', async () => {
        mockCompanies({ ashby: ['a1'], greenhouse: ['g1'], lever: ['l1'] });
        const { sent } = installForkMock({ failSources: ['ashby'] });

        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse,lever']);

        expect(sent.map(m => m.sources?.[0])).toEqual(['ashby', 'greenhouse', 'lever']);
        expect(report?.run.outcome).toBe('failed');
        expect(report?.run.exitCode).toBe(1);
        expect(publishCacheGeneration).not.toHaveBeenCalled();
        expect(report?.cache?.status).toBe('skipped_incomplete_run');
        expect(report?.categories['worker_failed']?.count).toBe(1);
        expect(report?.events.find(e => e.category === 'worker_failed')?.message).toMatch(/^Stage ashby: Worker #1/);
        expect(report?.workers?.map(w => [w.stage, w.status])).toEqual([
            ['ashby', 'failed'],
            ['greenhouse', 'ok'],
            ['lever', 'ok']
        ]);
    });

    it('publishes exactly once after the last stage and records per-source wall time and Lever boards', async () => {
        mockCompanies({ ashby: ['a1'], greenhouse: ['g1'], lever: { slugs: ['l1', 'l2'], available: 1800 } });
        const { sent } = installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse,lever']);

        expect(sent).toHaveLength(3);
        expect(publishCacheGeneration).toHaveBeenCalledTimes(1);
        expect(report?.run.exitCode).toBe(0);
        expect(report?.run.workers).toBe(3);
        const by = report!.summary.bySource!;
        for (const src of ['ashby', 'greenhouse', 'lever'] as const) {
            expect(typeof by[src]?.durationMs).toBe('number');
        }
        expect(by.lever?.boardsAvailable).toBe(1800);
        expect(by.lever?.boardsCap).toBe(3000);
        expect(by.ashby?.boardsAvailable).toBeUndefined();
        expect(report?.workers?.every(w => w.stage !== undefined)).toBe(true);
    });

    it('--skip-publish records the scrape finish without publishing', async () => {
        mockCompanies({ ashby: ['a1'], greenhouse: ['g1'] });
        installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse', '--skip-publish']);

        expect(publishCacheGeneration).not.toHaveBeenCalled();
        expect(recordScrapeFinished).toHaveBeenCalledTimes(1);
        expect(report?.cache?.status).toBe('skipped_flag');
    });

    it('--lever-max-boards=all selects Lever without a take limit and omits boardsCap', async () => {
        const prisma = mockCompanies({ lever: { slugs: ['l1'], available: 5 } });
        installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=lever', '--lever-max-boards=all']);

        const leverCall = prisma.company.findMany.mock.calls[0][0];
        expect('take' in leverCall).toBe(false);
        expect(report?.summary.bySource?.lever?.boardsCap).toBeUndefined();
        expect(report?.summary.bySource?.lever?.boardsAvailable).toBe(5);
    });

    it('filters --slugs per stage in --staged mode and skips stages with no matching slugs', async () => {
        mockCompanies({ ashby: ['a1', 'a2'], greenhouse: ['g1'], lever: ['l1', 'l2'] });
        const { sent } = installForkMock();

        const report = await runClusterScrape([
            ...STAGED,
            '--sources=lever,ashby,greenhouse',
            '--slugs=l1,a1'
        ]);

        expect(report?.run.exitCode).toBe(0);
        expect(sent.map(m => ({ sources: m.sources, slugs: m.slugs }))).toEqual([
            { sources: ['ashby'], slugs: ['a1'] },
            { sources: ['lever'], slugs: ['l1'] }
        ]);
    });

    it('skips an empty stage without spawning and still runs the others; all empty returns null', async () => {
        mockCompanies({ ashby: [], greenhouse: ['g1'] });
        const first = installForkMock();
        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse']);
        expect(first.sent.map(m => m.sources?.[0])).toEqual(['greenhouse']);
        expect(report?.run.exitCode).toBe(0);

        jest.clearAllMocks();
        (child_process.fork as jest.Mock).mockReset();
        mockCompanies({ ashby: [], greenhouse: [] });
        const second = installForkMock();
        const none = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse']);
        expect(none).toBeNull();
        expect(second.sent).toHaveLength(0);
    });

    it.each(['0', '121', 'abc'])('rejects --lever-stage-min=%s with exit 1', async bad => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit:${code}`);
        }) as never);
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        mockCompanies({ ashby: ['a1'] });
        installForkMock();

        await expect(
            runClusterScrape([...STAGED, '--sources=ashby,lever', `--lever-stage-min=${bad}`])
        ).rejects.toThrow('exit:1');
        expect(child_process.fork).not.toHaveBeenCalled();
        exitSpy.mockRestore();
        errSpy.mockRestore();
    });

    it.each([0, -5, 121, 1.5, Number.NaN])(
        'rejects invalid ClusterScrapeOptions.leverStageMin=%s with exit 1',
        async bad => {
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
                throw new Error(`exit:${code}`);
            }) as never);
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            mockCompanies({ ashby: ['a1'] });
            installForkMock();

            await expect(
                runClusterScrape(['node', 'ClusterScraper.ts'], {
                    staged: true,
                    sources: ['ashby', 'lever'],
                    leverStageMin: bad
                })
            ).rejects.toThrow('exit:1');
            expect(child_process.fork).not.toHaveBeenCalled();
            exitSpy.mockRestore();
            errSpy.mockRestore();
        }
    );

    it('registers one SIGINT/SIGTERM listener for the whole run and removes it afterwards', async () => {
        const before = { int: process.listenerCount('SIGINT'), term: process.listenerCount('SIGTERM') };
        const seen: Array<{ int: number; term: number }> = [];
        mockCompanies({ ashby: ['a1'], greenhouse: ['g1'], lever: ['l1'] });
        installForkMock({
            onSend: () => seen.push({ int: process.listenerCount('SIGINT'), term: process.listenerCount('SIGTERM') })
        });

        await runClusterScrape([...STAGED, '--sources=ashby,greenhouse,lever']);

        expect(seen).toHaveLength(3);
        for (const s of seen) {
            expect(s).toEqual({ int: before.int + 1, term: before.term + 1 });
        }
        expect(process.listenerCount('SIGINT')).toBe(before.int);
        expect(process.listenerCount('SIGTERM')).toBe(before.term);
    });

    it('without --staged the interleaved run keeps the same IPC payload keys and disconnects prisma only after publish', async () => {
        const prisma = mockCompanies({
            ashby: ['a1'],
            greenhouse: ['g1'],
            lever: ['l1']
        });
        const callOrder: string[] = [];
        (publishCacheGeneration as jest.Mock).mockImplementationOnce(async () => {
            callOrder.push('publish');
            return { attempted: true, status: 'published', gen: 'mock-gen', fields: 10, bytes: 1000, durationMs: 50 };
        });
        prisma.$disconnect.mockImplementationOnce(async () => {
            callOrder.push('disconnect');
        });
        // Non-staged queries non-lever sources in one call then lever in the next
        prisma.company.findMany
            .mockReset()
            .mockResolvedValueOnce([
                { slug: 'a1', source: 'ASHBY' },
                { slug: 'g1', source: 'GREENHOUSE' }
            ])
            .mockResolvedValueOnce([{ slug: 'l1', source: 'LEVER' }]);
        const { sent } = installForkMock();

        await runClusterScrape(['node', 'ClusterScraper.ts', '--sources=ashby,greenhouse,lever', '--workers=1']);

        expect(sent).toHaveLength(1);
        expect(Object.keys(sent[0]).sort()).toEqual(['concurrency', 'slugs', 'sources', 'workerCount', 'workerId']);
        expect(sent[0].sources).toEqual(['ashby', 'greenhouse', 'lever']);
        expect(sent[0].slugs).toHaveLength(3);
        expect(callOrder).toEqual(['publish', 'disconnect']);
    });

    it('--lever-stage-min without --staged is ignored with a warning', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockCompanies({ ashby: ['a1'] });
        installForkMock();
        await runClusterScrape(['node', 'ClusterScraper.ts', '--sources=ashby', '--lever-stage-min=30']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('--lever-stage-min only applies with --staged'));
        warn.mockRestore();
    });

    it('worker IPC option helper honours leverDeadlineMs and defaults to 11 min when omitted', async () => {
        expect(buildIpcScraperOptions({ workerId: 1, workerCount: 1, leverDeadlineMs: 65 * 60_000 })).toEqual({
            leverMinIntervalMs: 1000,
            leverInitialDelayMs: 0,
            leverDeadlineMs: 65 * 60_000
        });
        expect(buildIpcScraperOptions({ workerId: 2, workerCount: 2 })).toEqual({
            leverMinIntervalMs: 2000,
            leverInitialDelayMs: 1000
        });
        expect(DEFAULT_LEVER_DEADLINE_MS).toBe(11 * 60_000);

        jest.useFakeTimers();
        jest.setSystemTime(0);
        try {
            const mkFactory = () =>
                createStatefulPrisma({
                    companies: [
                        { slug: 'lv--one', source: 'LEVER', atsToken: 'one', status: 'ACTIVE' },
                        { slug: 'lv--two', source: 'LEVER', atsToken: 'two', status: 'ACTIVE' }
                    ]
                });
            const mkClient = (delayMs: number) => ({
                source: 'lever' as const,
                fetchBoard: jest.fn(async (ref: BoardRef) => {
                    await new Promise(r => setTimeout(r, delayMs));
                    return { slug: ref.slug, source: 'lever' as const, jobs: [], notFound: false, fetchMode: 'primary' as const };
                }),
                fetchCompanyMetadata: jest.fn(),
                canonicalUrls: jest.fn()
            });

            // 1. Custom leverDeadlineMs (1500 ms) stops board #2
            const customClient = mkClient(2000);
            const customScraper = new AshbyScraper({
                ...buildIpcScraperOptions({ workerId: 1, workerCount: 1, leverDeadlineMs: 1500 }),
                prisma: mkFactory() as unknown as PrismaClient,
                clients: new Map([['lever', customClient]])
            });
            const customPromise = customScraper.runAll({ sources: ['lever'], publish: false, saveTelemetry: false });
            await jest.advanceTimersByTimeAsync(2500);
            const customReport = await customPromise;
            expect(customClient.fetchBoard).toHaveBeenCalledTimes(1);
            expect(customReport.summary.bySource?.lever?.skippedByDeadline).toBe(1);

            // 2. Omitted leverDeadlineMs defaults to 11 min so a 2000ms first board does NOT skip board #2
            const defaultClient = mkClient(2000);
            const defaultScraper = new AshbyScraper({
                ...buildIpcScraperOptions({ workerId: 1, workerCount: 1 }),
                prisma: mkFactory() as unknown as PrismaClient,
                clients: new Map([['lever', defaultClient]])
            });
            const defaultPromise = defaultScraper.runAll({ sources: ['lever'], publish: false, saveTelemetry: false });
            await jest.advanceTimersByTimeAsync(5000);
            const defaultReport = await defaultPromise;
            expect(defaultClient.fetchBoard).toHaveBeenCalledTimes(2);
            expect(defaultReport.summary.bySource?.lever?.skippedByDeadline).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('Staged telemetry merge and report table', () => {
    it('ErrorTracker.mergeReports takes the max of durationMs, boardsAvailable and boardsCap', () => {
        const base = (dur: number, avail: number, cap: number) => {
            const r = asReport(workerReport('lever', 1));
            const lever = r.summary.bySource!.lever!;
            lever.durationMs = dur;
            lever.boardsAvailable = avail;
            lever.boardsCap = cap;
            return r;
        };
        const merged = ErrorTracker.mergeReports([base(1000, 10, 600), base(4000, 25, 600)], Date.now() - 1000, 'cluster');
        expect(merged.summary.bySource?.lever).toMatchObject({ durationMs: 4000, boardsAvailable: 25, boardsCap: 600 });
    });

    it('By Source table shows wall time, Lever boards and skipped-by-deadline and Workers renders stage prefix', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-table-'));
        try {
            const report = ErrorTracker.mergeReports(
                [asReport(workerReport('ashby', 2)), asReport(workerReport('lever', 3))],
                Date.now() - 1000,
                'cluster'
            );
            report.run.workers = 2;
            report.workers = [
                { workerId: 1, companies: 2, status: 'ok', durationSeconds: 2.1, stage: 'ashby' },
                { workerId: 1, companies: 3, status: 'ok', durationSeconds: 5.4, stage: 'lever' }
            ];
            const by = report.summary.bySource!;
            by.ashby!.durationMs = 312_000;
            by.lever!.durationMs = 3_000_000;
            by.lever!.boardsAvailable = 1800;
            by.lever!.boardsCap = 3000;
            by.lever!.skippedByDeadline = 4;

            const result = classifyReport(report, { outputDir: tmp, runHistoryPath: path.join(tmp, 'run-history.json') });
            const md = result.markdownSummary;
            expect(md).toContain('· 2 workers ·');
            expect(md).toContain('| Wall time | Boards (scraped/available/cap) | Skipped by deadline |');
            expect(md).toMatch(/\| ashby \|.*\| 312s \| — \| 0 \|/);
            expect(md).toMatch(/\| lever \|.*\| 3000s \| 3\/1800\/3000 \| 4 \|/);
            expect(md).toContain('ashby:w1 ok 2.1 s · lever:w1 ok 5.4 s');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('classifies staged worker_failed as S1 R-RUN-1 even when a surviving stage emits an S2 validation issue', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-worker-fail-'));
        try {
            const report = asReport(workerReport('lever', 3));
            report.run.outcome = 'failed';
            report.run.exitCode = 1;
            report.events.push(
                {
                    id: 'ev-val',
                    timestamp: new Date().toISOString(),
                    category: 'validation_filtered',
                    source: 'lever',
                    subkind: 'title',
                    field: 'title',
                    companySlug: 'lv--spotify',
                    message: 'Job title is empty',
                    actionTaken: 'filtered'
                },
                {
                    id: 'ev-wf',
                    timestamp: new Date().toISOString(),
                    category: 'worker_failed',
                    companySlug: 'worker-1',
                    message: 'Stage ashby: Worker #1 failed: Process crashed',
                    actionTaken: 'failed'
                }
            );

            const res = classifyReport(report, { outputDir: tmp, runHistoryPath: path.join(tmp, 'run-history.json') });
            expect(res.actionable).toBe(true);
            const wf = res.issues.find(i => i.category === 'worker_failed');
            expect(wf).toMatchObject({
                severity: 'S1',
                rule: 'R-RUN-1',
                relatedBF: ['BF-008', 'BF-025']
            });
            expect(res.issues.some(i => i.category === 'validation_filtered')).toBe(true);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('treats Lever skippedByDeadline as noise once, actionable S2 (R-TIME-1) on 2 consecutive runs, and resets after 0 skips', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-skip-s2-'));
        const historyPath = path.join(tmp, 'run-history.json');
        const makeRun = (runId: string, skipped: number) => {
            const r = asReport(workerReport('lever', 3));
            r.run.runId = runId;
            r.run.outcome = 'success';
            r.run.exitCode = 0;
            if (skipped > 0) {
                r.summary.bySource!.lever!.skippedByDeadline = skipped;
            }
            return classifyReport(r, { outputDir: tmp, runHistoryPath: historyPath });
        };

        try {
            const r1 = makeRun('run-1', 4);
            expect(r1.actionable).toBe(false);
            expect(r1.issues).toHaveLength(0);

            const r2 = makeRun('run-2', 3);
            expect(r2.actionable).toBe(true);
            expect(r2.issues[0]).toMatchObject({
                category: 'early_warning',
                subkind: 'lever_deadline_skipped',
                severity: 'S2',
                rule: 'R-TIME-1',
                consecutiveRuns: 2,
                relatedBF: ['BF-024', 'BF-025']
            });

            const r3 = makeRun('run-3', 0);
            expect(r3.actionable).toBe(false);

            // Next single skip after recovery must be noise again, not R-REGRESS-1 S1
            const r4 = makeRun('run-4', 2);
            expect(r4.actionable).toBe(false);
            expect(r4.issues).toHaveLength(0);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
