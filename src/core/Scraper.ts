/**
 * @file Core Ashby job scraper (High-Performance)
 * @summary Fetches jobs from Ashby API using adaptive concurrency, streaming batch DB writes, stale job deactivation, and Redis caching
 * @tags Core, Ashby API, Redis, Batch, Concurrent, High-Performance
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { createLimiter } from '../lib/Concurrency';
import { redis } from '../lib/Redis';
import {
    AshbyJob,
    extractSalary,
    fetchAshbyBoardWithFallback
} from '../lib/AshbyClient';
import {
    sanitizeJobUrl,
    sanitizeJsonMetadata,
    sanitizeText
} from '../lib/Sanitizer';
import { ErrorTracker, ErrorReportDocument } from '../lib/ErrorTracker';

const prisma = new PrismaClient();

// Configuration
const CONCURRENCY_LIMIT = 15;  // Parallel API requests
const BATCH_SIZE = 100;        // Jobs per DB transaction

interface ProcessedJob {
    ashbyId: string;
    title: string;
    companySlug: string;
    departmentId: string | null;
    locationId: string | null;
    applyUrl: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    salaryInterval?: string;
    isRemote: boolean;
    workplaceType?: string;
    employmentType?: string;
    publishedAt?: Date | null;
    isListed: boolean;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    postalAddress?: any;
    metadata: any;
    contentHash: string;
}

/**
 * @summary High-performance scraper class with adaptive concurrency, 3-strike quarantine, stale job deactivation, and streaming batch DB writes
 */
export class AshbyScraper {
    private departmentCache = new Map<string, string>();
    private departmentInFlight = new Map<string, Promise<string>>();
    private locationCache = new Map<string, string>();
    private locationInFlight = new Map<string, Promise<string>>();
    private notFoundStrikes = new Map<string, number>();
    private companiesWithExistingJobs = new Set<string>();
    private hasLoadedExistingJobSlugs = false;
    private isRedisConnected = false;

    /**
     * @summary Initializes Redis connection
     */
    private async initRedis() {
        if (redis.status === 'wait') {
            try {
                await redis.connect();
                this.isRedisConnected = true;
            } catch {
                this.isRedisConnected = false;
            }
        } else {
            this.isRedisConnected = redis.status === 'ready';
        }
    }

    /**
     * @summary Tracks consecutive 404 strikes for a company and marks status NOT_FOUND once threshold is reached
     */
    public async recordNotFoundStrike(
        companySlug: string,
        maxStrikes = 3
    ): Promise<boolean> {
        const current = (this.notFoundStrikes.get(companySlug) ?? 0) + 1;
        this.notFoundStrikes.set(companySlug, current);

        if (current >= maxStrikes) {
            await prisma.company.update({
                where: { slug: companySlug },
                data: { status: 'NOT_FOUND' }
            }).catch(() => { }); // Ignore if company doesn't exist
            return true;
        }
        return false;
    }

    /**
     * @summary Deactivates jobs in the database that are no longer listed on the company's live Ashby board
     */
    public async deactivateStaleJobs(
        companySlug: string,
        activeAshbyIds: string[]
    ): Promise<number> {
        const updateManyFn = (prisma.job as any)?.updateMany;
        if (typeof updateManyFn !== 'function') return 0;

        try {
            const res = await updateManyFn({
                where: {
                    companySlug,
                    active: true,
                    ashbyId: { notIn: activeAshbyIds }
                },
                data: { active: false }
            });
            return res?.count ?? 0;
        } catch {
            return 0;
        }
    }

    /**
     * @summary Calls Ashby API (with browser headers, retry, and GraphQL fallback) to fetch all jobs for a company
     */
    private async fetchJobs(
        companySlug: string,
        maxNotFoundStrikes = 1
    ): Promise<{
        slug: string;
        jobs: AshbyJob[];
        source?: 'rest' | 'graphql' | 'none';
        rateLimited?: boolean;
    }> {
        const result = await fetchAshbyBoardWithFallback(companySlug, {
            includeCompensation: true
        });

        if (result.notFound) {
            await this.recordNotFoundStrike(companySlug, maxNotFoundStrikes);
        } else if (result.source === 'rest' || result.source === 'graphql') {
            this.notFoundStrikes.delete(companySlug);
        }

        return {
            slug: companySlug,
            jobs: result.jobs
        };
    }

    /**
     * @summary Creates MD5 hash of job content for change detection (including salary interval, currency, workplaceType, and address)
     */
    private generateHash(job: AshbyJob): string {
        const salary = extractSalary(job);
        const postal = job.address?.postalAddress;
        const country = postal?.addressCountry || '';
        const region = postal?.addressRegion || '';
        const city = postal?.addressLocality || '';
        const content = `${job.title}|${job.location}|${job.department}|${salary.min}|${salary.max}|${salary.currency}|${salary.interval}|${job.isRemote}|${job.workplaceType}|${job.employmentType}|${job.publishedAt}|${job.applyUrl}|${job.isListed}|${country}|${region}|${city}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * @summary Gets or creates department with in-memory caching and concurrent in-flight deduplication
     */
    private async getOrCreateDepartment(name: string): Promise<string | null> {
        if (!name) return null;

        // Check resolved cache first
        if (this.departmentCache.has(name)) {
            return this.departmentCache.get(name)!;
        }

        // Check in-flight promise to avoid concurrent P2002 upsert race
        if (this.departmentInFlight.has(name)) {
            return await this.departmentInFlight.get(name)!;
        }

        const promise = (async () => {
            try {
                const dept = await prisma.department.upsert({
                    where: { name },
                    update: {},
                    create: { name }
                });
                this.departmentCache.set(name, dept.id);
                return dept.id;
            } catch (err) {
                const findUniqueFn = (prisma.department as any)?.findUnique;
                if (typeof findUniqueFn === 'function') {
                    const existing = await findUniqueFn({ where: { name } });
                    if (existing?.id) {
                        this.departmentCache.set(name, existing.id);
                        return existing.id;
                    }
                }
                throw err;
            } finally {
                this.departmentInFlight.delete(name);
            }
        })();

        this.departmentInFlight.set(name, promise);
        return await promise;
    }

    /**
     * @summary Gets or creates location with in-memory caching, concurrent in-flight deduplication, and cross-process P2002 race recovery
     */
    private async getOrCreateLocation(name: string): Promise<string | null> {
        if (!name) return null;

        // Check resolved cache first
        if (this.locationCache.has(name)) {
            return this.locationCache.get(name)!;
        }

        // Check in-flight promise to avoid concurrent P2002 upsert race
        if (this.locationInFlight.has(name)) {
            return await this.locationInFlight.get(name)!;
        }

        const promise = (async () => {
            try {
                const loc = await prisma.location.upsert({
                    where: { name },
                    update: {},
                    create: { name }
                });
                this.locationCache.set(name, loc.id);
                return loc.id;
            } catch (err) {
                const findUniqueFn = (prisma.location as any)?.findUnique;
                if (typeof findUniqueFn === 'function') {
                    const existing = await findUniqueFn({ where: { name } });
                    if (existing?.id) {
                        this.locationCache.set(name, existing.id);
                        return existing.id;
                    }
                }
                throw err;
            } finally {
                this.locationInFlight.delete(name);
            }
        })();

        this.locationInFlight.set(name, promise);
        return await promise;
    }

    /**
     * @summary Checks Redis cache for job changes, returns jobs that need processing
     */
    private async filterChangedJobs(jobs: AshbyJob[]): Promise<{ job: AshbyJob; hash: string }[]> {
        const changedJobs: { job: AshbyJob; hash: string }[] = [];

        for (const job of jobs) {
            const contentHash = this.generateHash(job);

            if (this.isRedisConnected) {
                const redisKey = `job:${job.id}:hash`;
                const cachedHash = await redis.get(redisKey);
                if (cachedHash === contentHash) continue;
            }

            changedJobs.push({ job, hash: contentHash });
        }

        return changedJobs;
    }

    /**
     * @summary Processes jobs in batches using database transactions with per-job fallback on error
     */
    private async batchUpsertJobs(processedJobs: ProcessedJob[], tracker?: ErrorTracker) {
        if (processedJobs.length === 0) return;

        const buildUpsertArgs = (job: ProcessedJob) => ({
            where: { ashbyId: job.ashbyId },
            create: {
                ashbyId: job.ashbyId,
                title: job.title,
                companySlug: job.companySlug,
                departmentId: job.departmentId,
                locationId: job.locationId,
                applyUrl: job.applyUrl,
                salaryMin: job.salaryMin,
                salaryMax: job.salaryMax,
                salaryCurrency: job.salaryCurrency,
                salaryInterval: job.salaryInterval,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType,
                employmentType: job.employmentType,
                publishedAt: job.publishedAt,
                isListed: job.isListed,
                country: job.country,
                region: job.region,
                city: job.city,
                postalAddress: job.postalAddress,
                metadata: job.metadata,
                contentHash: job.contentHash,
                active: true
            },
            update: {
                title: job.title,
                departmentId: job.departmentId,
                locationId: job.locationId,
                applyUrl: job.applyUrl,
                salaryMin: job.salaryMin,
                salaryMax: job.salaryMax,
                salaryCurrency: job.salaryCurrency,
                salaryInterval: job.salaryInterval,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType,
                employmentType: job.employmentType,
                publishedAt: job.publishedAt,
                isListed: job.isListed,
                country: job.country,
                region: job.region,
                city: job.city,
                postalAddress: job.postalAddress,
                metadata: job.metadata,
                contentHash: job.contentHash,
                updatedAt: new Date(),
                active: true
            }
        });

        // Process in batches
        for (let i = 0; i < processedJobs.length; i += BATCH_SIZE) {
            const batch = processedJobs.slice(i, i + BATCH_SIZE);
            let succeededJobs: ProcessedJob[] = batch;

            try {
                const findManyFn = (prisma.job as any)?.findMany;
                const createManyFn = (prisma.job as any)?.createMany;

                if (typeof findManyFn === 'function' && typeof createManyFn === 'function') {
                    // Fast bulk path: 1 SELECT + 1 INSERT (createMany) for new jobs, only upserting changed existing jobs
                    const existingRows: { ashbyId: string; contentHash: string; active: boolean }[] = await findManyFn({
                        where: { ashbyId: { in: batch.map(j => j.ashbyId) } },
                        select: { ashbyId: true, contentHash: true, active: true }
                    });
                    const existingMap = new Map(existingRows.map(r => [r.ashbyId, r]));

                    const toCreate = batch.filter(j => !existingMap.has(j.ashbyId));
                    const toUpdate = batch.filter(j => {
                        const prev = existingMap.get(j.ashbyId);
                        return prev !== undefined && (prev.contentHash !== j.contentHash || !prev.active);
                    });

                    if (toCreate.length > 0) {
                        await createManyFn({
                            data: toCreate.map(job => ({
                                ashbyId: job.ashbyId,
                                title: job.title,
                                companySlug: job.companySlug,
                                departmentId: job.departmentId,
                                locationId: job.locationId,
                                applyUrl: job.applyUrl,
                                salaryMin: job.salaryMin,
                                salaryMax: job.salaryMax,
                                salaryCurrency: job.salaryCurrency,
                                salaryInterval: job.salaryInterval,
                                isRemote: job.isRemote,
                                workplaceType: job.workplaceType,
                                employmentType: job.employmentType,
                                publishedAt: job.publishedAt,
                                isListed: job.isListed,
                                country: job.country,
                                region: job.region,
                                city: job.city,
                                postalAddress: job.postalAddress,
                                metadata: job.metadata,
                                contentHash: job.contentHash,
                                active: true
                            })),
                            skipDuplicates: true
                        });
                    }

                    if (toUpdate.length > 0) {
                        await prisma.$transaction(
                            toUpdate.map(job => prisma.job.upsert(buildUpsertArgs(job)))
                        );
                    }
                } else {
                    // Standard transaction upsert path
                    await prisma.$transaction(
                        batch.map(job => prisma.job.upsert(buildUpsertArgs(job)))
                    );
                }
            } catch (batchErr: any) {
                console.warn(
                    `  ⚠️ [BatchError] Transaction failed for batch starting at index ${i} (${batchErr?.message || 'Unknown error'}). Falling back to per-job upsert...`
                );
                succeededJobs = [];
                for (const job of batch) {
                    try {
                        await prisma.job.upsert(buildUpsertArgs(job));
                        succeededJobs.push(job);
                    } catch (jobErr: any) {
                        if (tracker) {
                            tracker.dbErrors++;
                            tracker.recordEvent({
                                category: 'db_error',
                                companySlug: job.companySlug,
                                jobId: job.ashbyId,
                                message: jobErr?.message || String(jobErr),
                                actionTaken: 'skipped_corrupt_job_in_fallback'
                            });
                        }
                        console.error(
                            `  ❌ [JobStoreError] Failed to store job ${job.ashbyId} (${job.companySlug}): ${jobErr?.message || jobErr}`
                        );
                    }
                }
            }

            // Update Redis cache for succeeded jobs
            if (this.isRedisConnected && succeededJobs.length > 0) {
                const pipeline = redis.pipeline();
                succeededJobs.forEach(job => {
                    pipeline.set(`job:${job.ashbyId}:hash`, job.contentHash, 'EX', 60 * 60 * 24 * 7);
                });
                await pipeline.exec();
            }
        }
    }

    /**
     * @summary Processes a single company's jobs, sanitizing fields and metadata before returning prepared job records
     */
    private async processCompanyJobs(
        companySlug: string,
        jobs: AshbyJob[]
    ): Promise<ProcessedJob[]> {
        const changedJobs = await this.filterChangedJobs(jobs);
        if (changedJobs.length === 0) return [];

        const processedJobs: ProcessedJob[] = [];

        for (const { job, hash } of changedJobs) {
            const cleanTitle = sanitizeText(job.title);
            if (!cleanTitle || !job.id) {
                console.warn(`  ⚠️ [ValidationFilter] Skipping malformed job in ${companySlug} (id=${job.id})`);
                continue;
            }

            const cleanDept = sanitizeText(job.department);
            const cleanLoc = sanitizeText(job.location);
            const departmentId = await this.getOrCreateDepartment(cleanDept);
            const locationId = await this.getOrCreateLocation(cleanLoc);
            const salary = extractSalary(job);
            const cleanApplyUrl = sanitizeJobUrl(job.applyUrl, companySlug, job.id, true);
            const cleanMetadata = sanitizeJsonMetadata(job);
            const postal = job.address?.postalAddress;
            const parsedPublishedAt = job.publishedAt ? new Date(job.publishedAt) : null;
            const validPublishedAt = parsedPublishedAt && !isNaN(parsedPublishedAt.getTime()) ? parsedPublishedAt : null;

            processedJobs.push({
                ashbyId: job.id,
                title: cleanTitle,
                companySlug,
                departmentId,
                locationId,
                applyUrl: cleanApplyUrl,
                salaryMin: salary.min,
                salaryMax: salary.max,
                salaryCurrency: salary.currency,
                salaryInterval: salary.interval,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType,
                employmentType: job.employmentType,
                publishedAt: validPublishedAt,
                isListed: job.isListed !== false,
                country: postal?.addressCountry ? sanitizeText(postal.addressCountry) : null,
                region: postal?.addressRegion ? sanitizeText(postal.addressRegion) : null,
                city: postal?.addressLocality ? sanitizeText(postal.addressLocality) : null,
                postalAddress: postal ? sanitizeJsonMetadata(postal) : null,
                metadata: cleanMetadata,
                contentHash: hash
            });
        }

        return processedJobs;
    }

    /**
     * @summary Entry point. Fetches companies concurrently with adaptive rate-limiting and streams batch writes to DB.
     */
    public async runAll(options: {
        slugs?: string[];
        workerId?: number;
        concurrency?: number;
        saveTelemetry?: boolean;
    } = {}): Promise<ErrorReportDocument> {
        const startTime = Date.now();
        const workerPrefix = options.workerId !== undefined ? `[Worker #${options.workerId} | PID ${process.pid}] ` : '';
        const concurrencyLimit = options.concurrency ?? CONCURRENCY_LIMIT;
        const shouldSaveTelemetry = options.saveTelemetry ?? (options.workerId === undefined);

        await this.initRedis();

        // Pre-warm department and location caches in 2 queries to avoid per-company round trips
        if (typeof (prisma.department as any)?.findMany === 'function') {
            const depts = await (prisma.department as any).findMany({ select: { id: true, name: true } }).catch(() => []);
            for (const d of depts || []) this.departmentCache.set(d.name, d.id);
        }
        if (typeof (prisma.location as any)?.findMany === 'function') {
            const locs = await (prisma.location as any).findMany({ select: { id: true, name: true } }).catch(() => []);
            for (const l of locs || []) this.locationCache.set(l.name, l.id);
        }
        if (typeof (prisma.job as any)?.findMany === 'function') {
            const activeSlugs = await (prisma.job as any)
                .findMany({ where: { active: true }, select: { companySlug: true }, distinct: ['companySlug'] })
                .catch(() => null);
            if (Array.isArray(activeSlugs)) {
                this.hasLoadedExistingJobSlugs = true;
                for (const row of activeSlugs) {
                    if (row?.companySlug) this.companiesWithExistingJobs.add(row.companySlug);
                }
            }
        }

        const companies = options.slugs
            ? options.slugs.map(slug => ({ slug }))
            : await prisma.company.findMany({
                where: { status: 'ACTIVE' },
                select: { slug: true }
            });

        console.log(`🚀 ${workerPrefix}Starting HIGH-PERFORMANCE scrape for ${companies.length} companies`);
        console.log(`   ${workerPrefix}Concurrency: ${concurrencyLimit} | Batch Size: ${BATCH_SIZE}`);
        console.log(`   ${workerPrefix}Redis: ${this.isRedisConnected ? '✅ Connected' : '⚠️ Disabled'}\n`);

        // Create adaptive concurrency limiter and telemetry tracker
        const limit = createLimiter(concurrencyLimit);
        const tracker = new ErrorTracker('db_scrape');
        tracker.companiesAttempted = companies.length;

        let completed = 0;
        let totalProcessed = 0;
        const pendingJobs: ProcessedJob[] = [];
        let flushChain = Promise.resolve();

        const enqueueFlushIfNeeded = (force = false) => {
            while (pendingJobs.length >= BATCH_SIZE || (force && pendingJobs.length > 0)) {
                const chunkToWrite = pendingJobs.splice(0, BATCH_SIZE);
                flushChain = flushChain.then(async () => {
                    await this.batchUpsertJobs(chunkToWrite, tracker);
                });
            }
        };

        const fetchPromises = companies.map(company =>
            limit(async () => {
                const boardResult = await fetchAshbyBoardWithFallback(company.slug, {
                    includeCompensation: true
                });
                completed++;

                if (boardResult.rateLimited) {
                    tracker.rateLimitsEncountered++;
                    limit.onRateLimit();
                } else {
                    limit.onSuccess();
                }

                if (boardResult.source === 'graphql') {
                    tracker.graphqlFallbacksUsed++;
                    tracker.recordEvent({
                        category: 'graphql_fallback',
                        companySlug: company.slug,
                        message: 'Posting API returned 404/403; recovered board via Ashby hosted GraphQL API',
                        actionTaken: `recovered_${boardResult.jobs.length}_jobs`
                    });
                }

                if (boardResult.notFound) {
                    tracker.companiesNotFound++;
                    await this.recordNotFoundStrike(company.slug, 3);
                } else if (boardResult.source === 'rest' || boardResult.source === 'graphql') {
                    this.notFoundStrikes.delete(company.slug);
                    if (!this.hasLoadedExistingJobSlugs || this.companiesWithExistingJobs.has(company.slug)) {
                        const activeIds = boardResult.jobs.map(j => j.id);
                        await this.deactivateStaleJobs(company.slug, activeIds);
                    }
                }

                if (boardResult.validationIssues && boardResult.validationIssues.length > 0) {
                    tracker.recordValidationIssues(boardResult.validationIssues);
                    const filteredCount = boardResult.validationIssues.filter(i => i.action === 'filtered').length;
                    if (filteredCount > 0) {
                        console.warn(
                            `  ⚠️ ${workerPrefix}[Sanitizer] ${boardResult.slug}: filtered ${filteredCount} malformed job record(s)`
                        );
                    }
                }

                if (boardResult.jobs.length > 0) {
                    tracker.companiesWithJobs++;
                    tracker.jobsCollected += boardResult.jobs.length;
                    const processed = await this.processCompanyJobs(boardResult.slug, boardResult.jobs);
                    totalProcessed += processed.length;
                    pendingJobs.push(...processed);
                    enqueueFlushIfNeeded(false);
                    if (companies.length <= 50) {
                        console.log(`  ✅ ${workerPrefix}${boardResult.slug}: ${boardResult.jobs.length} jobs (${processed.length} changed)`);
                    }
                }

                // Progress indicator every 50 companies
                if (completed % 50 === 0 || completed === companies.length) {
                    console.log(
                        `📊 ${workerPrefix}Progress: ${completed}/${companies.length} companies | ${tracker.jobsCollected} jobs found (concurrency: ${limit.getConcurrency()})`
                    );
                }
            })
        );

        await Promise.all(fetchPromises);

        console.log(`\n📦 ${workerPrefix}Flushing remaining jobs to database...`);
        enqueueFlushIfNeeded(true);
        await flushChain;

        const report = tracker.buildReport();
        if (shouldSaveTelemetry) {
            const reportPath = tracker.saveReport();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✅ ${workerPrefix}Scrape complete in ${elapsed}s`);
            console.log(`   ${workerPrefix}Companies: ${companies.length} | Jobs processed: ${totalProcessed}`);
            if (reportPath) {
                console.log(`   📋 Telemetry & Error Report: ${reportPath}`);
            }
        } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ ${workerPrefix}Shard complete in ${elapsed}s (${totalProcessed} jobs processed)`);
        }

        return report;
    }
}

if (require.main === module) {
    if (process.argv.includes('--ipc-worker')) {
        process.once('message', async (msg: { workerId: number; slugs: string[]; concurrency?: number }) => {
            const scraper = new AshbyScraper();
            try {
                const report = await scraper.runAll({
                    slugs: msg.slugs,
                    workerId: msg.workerId,
                    concurrency: msg.concurrency,
                    saveTelemetry: false
                });
                if (process.send) {
                    process.send({ type: 'worker_done', workerId: msg.workerId, report });
                }
                await prisma.$disconnect();
                if (redis.status === 'ready') await redis.quit();
                process.exit(0);
            } catch (err: any) {
                if (process.send) {
                    process.send({ type: 'worker_error', workerId: msg.workerId, error: err?.message || String(err) });
                }
                await prisma.$disconnect();
                process.exit(1);
            }
        });
    } else {
        const scraper = new AshbyScraper();
        scraper.runAll()
            .then(async () => {
                await prisma.$disconnect();
                if (redis.status === 'ready') await redis.quit();
            })
            .catch(async (e) => {
                console.error(e);
                await prisma.$disconnect();
                process.exit(1);
            });
    }
}
