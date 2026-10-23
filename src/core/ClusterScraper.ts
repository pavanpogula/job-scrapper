/**
 * @file Multi-Process Cluster Job Scraper Coordinator
 * @summary Partitions active companies across multiple OS child processes (fork) for true multi-core parallel scraping and aggregates telemetry
 * @tags Core, Multi-Process, Cluster, Child Process, Parallel, High-Performance
 */

import { fork } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { ErrorReportDocument, ErrorTracker } from '../lib/ErrorTracker';

const prisma = new PrismaClient();

/**
 * @summary Parses --workers=N from CLI arguments, defaulting to min(4, CPU cores)
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
 * @summary Spawns a single OS worker process for a company shard and resolves with its telemetry report
 */
function runWorkerShard(
    workerId: number,
    slugs: string[],
    perWorkerConcurrency: number
): Promise<ErrorReportDocument> {
    return new Promise((resolve, reject) => {
        const scraperPath = path.join(__dirname, 'Scraper.ts');
        const hasTsNode = process.execArgv.some(arg => arg.includes('ts-node'));
        const execArgv = hasTsNode ? process.execArgv : [...process.execArgv, '-r', 'ts-node/register'];

        const child = fork(scraperPath, ['--ipc-worker'], {
            execArgv,
            stdio: ['inherit', 'inherit', 'inherit', 'ipc']
        });

        let settled = false;

        child.on('message', (msg: any) => {
            if (msg?.type === 'worker_done' && !settled) {
                settled = true;
                resolve(msg.report as ErrorReportDocument);
            } else if (msg?.type === 'worker_error' && !settled) {
                settled = true;
                reject(new Error(`Worker #${workerId} failed: ${msg.error}`));
            }
        });

        child.on('error', err => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        });

        child.on('exit', code => {
            if (!settled) {
                settled = true;
                reject(new Error(`Worker #${workerId} exited unexpectedly with code ${code}`));
            }
        });

        child.send({
            workerId,
            slugs,
            concurrency: perWorkerConcurrency
        });
    });
}

/**
 * @summary Entry point for multi-process scraping across OS worker processes
 */
export async function runClusterScrape(argv: string[] = process.argv): Promise<ErrorReportDocument | null> {
    const startedAtMs = Date.now();

    const companies = await prisma.company.findMany({
        where: { status: 'ACTIVE' },
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
    // Divide total target HTTP concurrency (~20) across OS processes (min 5 per worker)
    const perWorkerConcurrency = Math.max(5, Math.ceil(20 / shards.length));

    console.log(`⚡ MULTI-PROCESS CLUSTER SCRAPER`);
    console.log(`   Active Companies : ${slugs.length}`);
    console.log(`   OS Worker Procs  : ${shards.length} (CPU cores available: ${os.cpus().length})`);
    console.log(`   Per-Worker HTTP  : ${perWorkerConcurrency} concurrent requests\n`);

    const workerPromises = shards.map((shardSlugs, idx) =>
        runWorkerShard(idx + 1, shardSlugs, perWorkerConcurrency)
    );

    const reports = await Promise.all(workerPromises);
    const mergedReport = ErrorTracker.mergeReports(reports, startedAtMs, 'db_scrape');
    const savedPath = ErrorTracker.saveMergedReport(mergedReport);

    console.log(`\n🏁 MULTI-PROCESS SCRAPE COMPLETE in ${mergedReport.summary.durationSeconds}s`);
    console.log(`   Workers Spawned        : ${shards.length}`);
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
        .catch(err => {
            console.error('❌ Cluster scrape failed:', err);
            process.exit(1);
        });
}
