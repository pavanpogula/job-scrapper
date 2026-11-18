/**
 * @file Staged scrape (BF-025) Unit Tests
 * @summary Tests --staged stage order, failure isolation, single publish, Lever 1-worker stage with its own deadline/watchdog, per-source telemetry, flag parsing, signal listeners, and the unchanged interleaved payload
 * @tags Unit Test, Cluster, Staged, Lever, BF-025, BF-017, ADR-0022
 */

import { EventEmitter } from 'events';
import * as child_process from 'child_process';
import {
    orderStages,
    parseLeverStageMinutes,
    runClusterScrape
} from '../../src/core/ClusterScraper';
import { parseLeverMaxBoards } from '../../src/core/selectCompanies';
import { ErrorReportDocument, ErrorTracker } from '../../src/lib/ErrorTracker';
import { classifyReport } from '../../src/lib/ReportClassifier';
import { publishCacheGeneration, recordScrapeFinished } from '../../src/cache/Publisher';
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

function mockCompanies(...stages: Array<string[] | { slugs: string[]; available?: number }>) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.company.findMany.mockReset();
    prisma.company.count.mockReset();
    for (const stage of stages) {
        const slugs = Array.isArray(stage) ? stage : stage.slugs;
        prisma.company.findMany.mockResolvedValueOnce(slugs.map(slug => ({ slug, source: 'ASHBY' })));
        if (!Array.isArray(stage) && stage.available !== undefined) {
            prisma.company.count.mockResolvedValueOnce(stage.available);
        }
    }
    prisma.company.findMany.mockResolvedValue([]);
    prisma.company.count.mockResolvedValue(0);
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

        it('parseLeverMaxBoards accepts all (no cap) and a caller-supplied default', () => {
            expect(parseLeverMaxBoards([])).toBe(600);
            expect(parseLeverMaxBoards([], 3000)).toBe(3000);
            expect(parseLeverMaxBoards(['--lever-max-boards=all'], 3000)).toBe(Number.POSITIVE_INFINITY);
            expect(parseLeverMaxBoards(['--lever-max-boards=250'], 3000)).toBe(250);
            expect(parseLeverMaxBoards(['--lever-max-boards=nope'], 3000)).toBe(3000);
        });
    });

    it('runs ashby -> greenhouse -> lever in registry order, one stage fully before the next, Lever with 1 worker and its own deadline', async () => {
        const timeoutSpy = jest.spyOn(global, 'setTimeout');
        mockCompanies(['a1', 'a2'], ['g1'], { slugs: ['l1', 'l2', 'l3'], available: 1800 });
        const { log, sent } = installForkMock();

        const report = await runClusterScrape(
            [...STAGED, '--sources=lever,ashby,greenhouse', '--workers=2', '--lever-stage-min=70']
        );

        expect(report?.run.exitCode).toBe(0);
        // 2 ashby workers, 1 greenhouse, 1 lever; each stage's workers exit before the next stage forks
        expect(log).toEqual(['f', 'f', 'e', 'e', 'f', 'e', 'f', 'e']);
        expect(sent.map(m => m.sources)).toEqual([['ashby'], ['ashby'], ['greenhouse'], ['lever']]);

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
        mockCompanies(['a1'], ['g1'], ['l1']);
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
        mockCompanies(['a1'], ['g1'], { slugs: ['l1', 'l2'], available: 1800 });
        const { sent } = installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse,lever']);

        expect(sent).toHaveLength(3);
        expect(publishCacheGeneration).toHaveBeenCalledTimes(1);
        expect(report?.run.exitCode).toBe(0);
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
        mockCompanies(['a1'], ['g1']);
        installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse', '--skip-publish']);

        expect(publishCacheGeneration).not.toHaveBeenCalled();
        expect(recordScrapeFinished).toHaveBeenCalledTimes(1);
        expect(report?.cache?.status).toBe('skipped_flag');
    });

    it('--lever-max-boards=all selects Lever without a take limit and omits boardsCap', async () => {
        const prisma = mockCompanies({ slugs: ['l1'], available: 5 });
        installForkMock();

        const report = await runClusterScrape([...STAGED, '--sources=lever', '--lever-max-boards=all']);

        const leverCall = prisma.company.findMany.mock.calls[0][0];
        expect('take' in leverCall).toBe(false);
        expect(report?.summary.bySource?.lever?.boardsCap).toBeUndefined();
        expect(report?.summary.bySource?.lever?.boardsAvailable).toBe(5);
    });

    it('skips an empty stage without spawning and still runs the others; all empty returns null', async () => {
        mockCompanies([], ['g1']);
        const first = installForkMock();
        const report = await runClusterScrape([...STAGED, '--sources=ashby,greenhouse']);
        expect(first.sent.map(m => m.sources?.[0])).toEqual(['greenhouse']);
        expect(report?.run.exitCode).toBe(0);

        jest.clearAllMocks();
        (child_process.fork as jest.Mock).mockReset();
        mockCompanies([], []);
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
        mockCompanies(['a1']);
        installForkMock();

        await expect(
            runClusterScrape([...STAGED, '--sources=ashby,lever', `--lever-stage-min=${bad}`])
        ).rejects.toThrow('exit:1');
        expect(child_process.fork).not.toHaveBeenCalled();
        exitSpy.mockRestore();
        errSpy.mockRestore();
    });

    it('registers one SIGINT/SIGTERM listener for the whole run and removes it afterwards', async () => {
        const before = { int: process.listenerCount('SIGINT'), term: process.listenerCount('SIGTERM') };
        const seen: Array<{ int: number; term: number }> = [];
        mockCompanies(['a1'], ['g1'], ['l1']);
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

    it('without --staged the interleaved run is unchanged: one shared set of workers and the old IPC payload keys', async () => {
        const prisma = mockCompanies(['a1', 'g1', 'l1']);
        prisma.company.findMany.mockReset();
        prisma.company.findMany.mockResolvedValueOnce([
            { slug: 'a1', source: 'ASHBY' },
            { slug: 'g1', source: 'GREENHOUSE' }
        ]);
        prisma.company.findMany.mockResolvedValueOnce([{ slug: 'l1', source: 'LEVER' }]);
        prisma.company.count.mockResolvedValue(1);
        const { sent } = installForkMock();

        await runClusterScrape(['node', 'ClusterScraper.ts', '--sources=ashby,greenhouse,lever', '--workers=1']);

        expect(sent).toHaveLength(1);
        expect(Object.keys(sent[0]).sort()).toEqual(['concurrency', 'slugs', 'sources', 'workerCount', 'workerId']);
        expect(sent[0].sources).toEqual(['ashby', 'greenhouse', 'lever']);
        expect(sent[0].slugs).toHaveLength(3);
    });

    it('--lever-stage-min without --staged is ignored with a warning', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockCompanies(['a1']);
        installForkMock();
        await runClusterScrape(['node', 'ClusterScraper.ts', '--sources=ashby', '--lever-stage-min=30']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('--lever-stage-min only applies with --staged'));
        warn.mockRestore();
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

    it('By Source table shows wall time, Lever boards and skipped-by-deadline; unset values render as dashes/zero', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-table-'));
        try {
            const report = ErrorTracker.mergeReports(
                [asReport(workerReport('ashby', 2)), asReport(workerReport('lever', 3))],
                Date.now() - 1000,
                'cluster'
            );
            const by = report.summary.bySource!;
            by.ashby!.durationMs = 312_000;
            by.lever!.durationMs = 3_000_000;
            by.lever!.boardsAvailable = 1800;
            by.lever!.boardsCap = 3000;
            by.lever!.skippedByDeadline = 4;

            const result = classifyReport(report, { outputDir: tmp, runHistoryPath: path.join(tmp, 'run-history.json') });
            const md = result.markdownSummary;
            expect(md).toContain('| Wall time | Boards (scraped/available/cap) | Skipped by deadline |');
            expect(md).toMatch(/\| ashby \|.*\| 312s \| — \| 0 \|/);
            expect(md).toMatch(/\| lever \|.*\| 3000s \| 3\/1800\/3000 \| 4 \|/);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
