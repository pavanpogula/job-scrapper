/**
 * @file Multi-Process Cluster Job Scraper Coordinator
 * @summary Partitions active companies across multiple OS child processes (fork) with watchdog timeouts, signal forwarding, and telemetry aggregation
 * @tags Core, Multi-Process, Cluster, Child Process, Parallel, High-Performance, Watchdog
 */

import { fork, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { ErrorReportDocument, ErrorTracker } from '../lib/ErrorTracker';
import { publishCacheGeneration, recordScrapeFinished } from '../cache/Publisher';

const prisma = new PrismaClient();

export interface WorkerResult {
    workerId: number;
    pid?: number;
    companies: number;
    status: 'ok' | 'failed' | 'timeout';
    durationSeconds: number;
    error?: string;
    report?: ErrorReportDocument;
}

export interface ClusterScrapeOptions {
    workerTimeoutMs?: number;
    killGracePeriodMs?: number;
    saveTelemetry?: boolean;
    skipPublish?: boolean;
    force?: boolean;
    dryRun?: boolean;
    redis?: any;
}

/**
 * @summary Parses --workers=N from CLI arguments, defaulting to min(4, max(2, CPU cores))
 * @param argv Command line arguments
 * @param totalItems Total number of companies to scrape
 * @param cpuCount Number of available CPU cores
 * @returns Resolved worker count
 */
export function resolveWorkerCount(argv: string[], totalItems: number, cpuCount: number = os.cpus().length): number {
    const flag = argv.find(arg => arg.startsWith('--workers='));
    let requested = Math.min(4, Math.max(2, cpuCount));

    if (flag) {
        const parsed = parseInt(flag.split('=')[1], 10);
        if (!Number.isNaN(parsed) && parsed >= 1) {
            requested = parsed;
        }
    }

    return Math.max(1, Math.min(requested, Math.max(1, totalItems)));
}

/**
 * @summary Distributes company slugs evenly across N worker shards using round-robin partitioning
 * @param slugs Array of company slugs
 * @param workerCount Number of worker shards
 * @returns 2D array of company slugs partitioned by shard
 */
export function partitionSlugs(slugs: string[], workerCount: number): string[][] {
    const count = Math.max(1, Math.min(workerCount, Math.max(1, slugs.length)));
    const shards: string[][] = Array.from({ length: count }, () => []);

    slugs.forEach((slug, idx) => {
        shards[idx % count].push(slug);
    });

    return shards.filter(s => s.length > 0);
}

/**
 * @summary Spawns a single OS worker process with watchdog timeout and resolves with WorkerResult
 * @param workerId Numeric ID of worker
 * @param slugs Company slugs assigned to worker
 * @param perWorkerConcurrency HTTP concurrency within worker
 * @param options Timeout and lifecycle callbacks
 * @returns Promise resolving to WorkerResult
 */
export function runWorkerShard(
    workerId: number,
    slugs: string[],
    perWorkerConcurrency: number,
    options: {
        workerTimeoutMs?: number;
        killGracePeriodMs?: number;
        onSpawn?: (child: ChildProcess) => void;
    } = {}
): Promise<WorkerResult> {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const scraperPath = path.join(__dirname, 'Scraper.ts');
        const hasTsNode = process.execArgv.some(arg => arg.includes('ts-node'));
        const execArgv = hasTsNode ? process.execArgv : [...process.execArgv, '-r', 'ts-node/register'];

        const child = fork(scraperPath, ['--ipc-worker'], {
            execArgv,
            stdio: ['inherit', 'inherit', 'inherit', 'ipc']
        });

        if (options.onSpawn) {
            options.onSpawn(child);
        }

        let settled = false;
        let isTimeout = false;

        const timeoutMs = options.workerTimeoutMs ??
            (process.env.SCRAPE_WORKER_TIMEOUT_MS ? parseInt(process.env.SCRAPE_WORKER_TIMEOUT_MS, 10) : 900000);
        const graceMs = options.killGracePeriodMs ?? 10000;

        // Watchdog: SIGTERM on timeout, then SIGKILL after grace period
        const watchdogTimer = setTimeout(() => {
            if (!settled) {
                isTimeout = true;
                console.warn(`  ⚠️ [Watchdog] Worker #${workerId} exceeded timeout (${timeoutMs}ms). Sending SIGTERM...`);
                try {
                    child.kill('SIGTERM');
                } catch {
                    // child might have already exited
                }

                const killTimer = setTimeout(() => {
                    if (!settled) {
                        console.error(`  ❌ [Watchdog] Worker #${workerId} did not exit after SIGTERM grace period. Sending SIGKILL...`);
                        try {
                            child.kill('SIGKILL');
                        } catch {
                            // ignore kill error
                        }
                    }
                }, graceMs);

                if (typeof killTimer.unref === 'function') {
                    killTimer.unref();
                }
            }
        }, timeoutMs);

        const cleanupAndResolve = (result: WorkerResult) => {
            if (!settled) {
                settled = true;
                clearTimeout(watchdogTimer);
                resolve(result);
            }
        };

        child.on('message', (msg: any) => {
            const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
            if (msg?.type === 'worker_done') {
                cleanupAndResolve({
                    workerId,
                    pid: child.pid,
                    companies: slugs.length,
                    status: 'ok',
                    durationSeconds: duration,
                    report: msg.report as ErrorReportDocument
                });
            } else if (msg?.type === 'worker_error') {
                cleanupAndResolve({
                    workerId,
                    pid: child.pid,
                    companies: slugs.length,
                    status: 'failed',
                    durationSeconds: duration,
                    error: msg.error || 'Worker execution error'
                });
            }
        });

        child.on('error', err => {
            const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
            cleanupAndResolve({
                workerId,
                pid: child.pid,
                companies: slugs.length,
                status: isTimeout ? 'timeout' : 'failed',
                durationSeconds: duration,
                error: err.message || String(err)
            });
        });

        child.on('exit', (code, signal) => {
            const duration = Number(((Date.now() - startTime) / 1000).toFixed(1));
            if (code === 0 && !isTimeout) {
                // If message hasn't delivered worker_done, still resolve cleanly
                cleanupAndResolve({
                    workerId,
                    pid: child.pid,
                    companies: slugs.length,
                    status: 'ok',
                    durationSeconds: duration
                });
            } else {
                cleanupAndResolve({
                    workerId,
                    pid: child.pid,
                    companies: slugs.length,
                    status: isTimeout ? 'timeout' : 'failed',
                    durationSeconds: duration,
                    error: isTimeout
                        ? `Worker timed out after ${timeoutMs}ms (signal=${signal})`
                        : `Worker #${workerId} exited with code ${code} (signal=${signal})`
                });
            }
        });

        try {
            child.send({
                workerId,
                slugs,
                concurrency: perWorkerConcurrency
            });
        } catch (err: any) {
            cleanupAndResolve({
                workerId,
                pid: child.pid,
                companies: slugs.length,
                status: 'failed',
                durationSeconds: 0,
                error: `Failed sending work to child: ${err.message || String(err)}`
            });
        }
    });
}

/**
 * @summary Entry point for multi-process scraping across OS worker processes with signal forwarding and fault tolerance
 * @param argv Command line arguments
 * @param options Cluster scraping options
 * @returns Aggregated ErrorReportDocument or null if no companies found
 */
export async function runClusterScrape(
    argv: string[] = process.argv,
    options: ClusterScrapeOptions = {}
): Promise<ErrorReportDocument | null> {
    const startedAtMs = Date.now();

    const isSundayUtc = new Date().getUTCDay() === 0;
    const recheckNotFound = argv.includes('--recheck-not-found') || isSundayUtc;
    const statusFilter = recheckNotFound ? { in: ['ACTIVE', 'NOT_FOUND'] as any } : 'ACTIVE';

    const companies = await prisma.company.findMany({
        where: { status: statusFilter },
        select: { slug: true }
    });
    await prisma.$disconnect();

    if (companies.length === 0) {
        console.log('⚠️  No active companies found in database. Run: npm run seed');
        return null;
    }

    const slugs = companies.map(c => c.slug);
    const workerCount = resolveWorkerCount(argv, slugs.length);
    const shards = partitionSlugs(slugs, workerCount);
    const perWorkerConcurrency = slugs.length > 100 ? 12 : Math.max(5, Math.ceil(20 / shards.length));

    console.log(`⚡ MULTI-PROCESS CLUSTER SCRAPER`);
    console.log(`   Active Companies : ${slugs.length}`);
    console.log(`   OS Worker Procs  : ${shards.length} (CPU cores available: ${os.cpus().length})`);
    console.log(`   Per-Worker HTTP  : ${perWorkerConcurrency} concurrent requests\n`);

    const activeChildren = new Set<ChildProcess>();

    // Signal forwarding for SIGINT and SIGTERM
    const forwardSignal = (signal: 'SIGINT' | 'SIGTERM') => {
        console.warn(`\n⚠️  Coordinator received ${signal}. Forwarding to ${activeChildren.size} active worker processes...`);
        for (const child of activeChildren) {
            try {
                child.kill(signal);
            } catch {
                // child may have already exited
            }
        }
    };

    const sigintListener = () => forwardSignal('SIGINT');
    const sigtermListener = () => forwardSignal('SIGTERM');

    process.once('SIGINT', sigintListener);
    process.once('SIGTERM', sigtermListener);

    const workerPromises = shards.map((shardSlugs, idx) =>
        runWorkerShard(idx + 1, shardSlugs, perWorkerConcurrency, {
            workerTimeoutMs: options.workerTimeoutMs,
            killGracePeriodMs: options.killGracePeriodMs,
            onSpawn: child => activeChildren.add(child)
        })
    );

    let settledResults: PromiseSettledResult<WorkerResult>[];
    try {
        settledResults = await Promise.allSettled(workerPromises);
    } finally {
        process.removeListener('SIGINT', sigintListener);
        process.removeListener('SIGTERM', sigtermListener);
    }

    const results: WorkerResult[] = settledResults.map((s, idx) => {
        if (s.status === 'fulfilled') {
            return s.value;
        }
        return {
            workerId: idx + 1,
            companies: shards[idx].length,
            status: 'failed',
            durationSeconds: 0,
            error: s.reason?.message || String(s.reason)
        };
    });

    const successfulReports = results
        .filter(w => w.status === 'ok' && w.report)
        .map(w => w.report!);

    const hasFailures = results.some(w => w.status !== 'ok');

    const mergedReport = ErrorTracker.mergeReports(successfulReports, startedAtMs, 'cluster');
    mergedReport.workers = results.map(r => ({
        workerId: r.workerId,
        pid: r.pid,
        companies: r.companies,
        status: r.status,
        durationSeconds: r.durationSeconds,
        error: r.error
    }));

    if (hasFailures) {
        mergedReport.run.outcome = 'failed';
        mergedReport.run.exitCode = 1;
        mergedReport.cache = {
            attempted: false,
            status: 'skipped_incomplete_run',
            durationMs: 0
        };

        for (const failedWorker of results.filter(w => w.status !== 'ok')) {
            if (!mergedReport.categories['worker_failed']) {
                mergedReport.categories['worker_failed'] = { count: 0 };
            }
            mergedReport.categories['worker_failed'].count++;
            mergedReport.events.push({
                timestamp: new Date().toISOString(),
                category: 'worker_failed',
                companySlug: `worker-${failedWorker.workerId}`,
                message: `Worker #${failedWorker.workerId} ${failedWorker.status}: ${failedWorker.error || 'failure during scrape'}`,
                actionTaken: failedWorker.status
            });
        }
    } else {
        const isSkipPublish = argv.includes('--skip-publish') || options.skipPublish;
        if (isSkipPublish) {
            await recordScrapeFinished({
                scrapeFinishedAt: new Date().toISOString(),
                redis: options.redis
            });
            mergedReport.cache = {
                attempted: false,
                status: 'skipped_flag',
                durationMs: 0
            };
            mergedReport.run.outcome = 'success';
            mergedReport.run.exitCode = 0;
        } else {
            try {
                const publishResult = await publishCacheGeneration({
                    runId: mergedReport.run.runId,
                    scrapeFinishedAt: new Date().toISOString(),
                    prisma,
                    redis: options.redis,
                    dryRun: argv.includes('--dry-run') || options.dryRun,
                    force: argv.includes('--force') || options.force
                });
                mergedReport.cache = publishResult;
                if (publishResult.status === 'published' || publishResult.status.startsWith('skipped')) {
                    mergedReport.run.outcome = 'success';
                    mergedReport.run.exitCode = 0;
                } else {
                    mergedReport.run.outcome = 'failed';
                    mergedReport.run.exitCode = 2;
                }
            } catch (err: any) {
                mergedReport.cache = {
                    attempted: true,
                    status: 'failed',
                    durationMs: 0,
                    error: err.message || String(err)
                };
                mergedReport.run.outcome = 'failed';
                mergedReport.run.exitCode = 2;
            }
        }
    }

    const savedPath = ErrorTracker.saveMergedReport(mergedReport);

    console.log(`\n🏁 MULTI-PROCESS SCRAPE COMPLETE in ${mergedReport.summary.durationSeconds}s`);
    console.log(`   Workers Spawned        : ${shards.length} (Success: ${results.filter(r => r.status === 'ok').length}, Failed: ${results.filter(r => r.status !== 'ok').length})`);
    console.log(`   Companies Attempted    : ${mergedReport.summary.companiesAttempted}`);
    console.log(`   Companies With Jobs    : ${mergedReport.summary.companiesWithJobs}`);
    console.log(`   GraphQL Fallbacks Used : ${mergedReport.summary.graphqlFallbacksUsed}`);
    console.log(`   Total Jobs Collected   : ${mergedReport.summary.jobsCollected}`);
    console.log(`   Jobs Sanitized/Filtered: ${mergedReport.summary.jobsSanitized} / ${mergedReport.summary.jobsFilteredOut}`);
    if (savedPath) {
        console.log(`   📋 Aggregated Telemetry: ${savedPath}`);
    }

    return mergedReport;
}

if (require.main === module) {
    runClusterScrape()
        .then(report => {
            const exitCode = report?.run.exitCode ?? 0;
            process.exit(exitCode);
        })
        .catch(err => {
            console.error('❌ Cluster scrape fatal error:', err);
            process.exit(1);
        });
}
