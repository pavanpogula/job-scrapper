/**
 * @file Core Ashby job scraper (High-Performance)
 * @summary Fetches jobs from Ashby API using adaptive concurrency, streaming batch DB writes, and stale job deactivation
 * @tags Core, Ashby API, Batch, Concurrent, High-Performance
 */

import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { createLimiter } from '../lib/Concurrency';
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
import { toIsoCountry } from '../lib/Country';
import { ErrorTracker, ErrorReportDocument } from '../lib/ErrorTracker';

const prisma = new PrismaClient();

// Configuration
const CONCURRENCY_LIMIT = 15;  // Parallel API requests
const BATCH_SIZE = 100;        // Jobs per DB transaction

export interface ContentHashFields {
    title: string;
    location?: string | null;
    department?: string | null;
    salary?: {
        min?: number | null;
        max?: number | null;
        currency?: string | null;
        interval?: string | null;
    } | null;
    isRemote?: boolean;
    workplaceType?: string | null;
    employmentType?: string | null;
    publishedAt?: string | Date | null;
    applyUrl: string;
    isListed?: boolean;
    country?: string | null;
    region?: string | null;
    city?: string | null;
    descriptionHtml?: string | null;
    descriptionPlain?: string | null;
    team?: string | null;
    secondaryLocations?: Array<{ location: string } | string> | null;
}

/**
 * @summary Deterministic JSON stringifier sorting object keys alphabetically
 */
export function stableStringify(val: any): string {
    if (val === null || typeof val !== 'object') {
        return JSON.stringify(val);
    }
    if (Array.isArray(val)) {
        return '[' + val.map(v => (v === undefined ? 'null' : stableStringify(v))).join(',') + ']';
    }
    const keys = Object.keys(val).sort();
    const parts: string[] = [];
    for (const key of keys) {
        const v = val[key];
        if (v !== undefined) {
            parts.push(`${JSON.stringify(key)}:${stableStringify(v)}`);
        }
    }
    return '{' + parts.join(',') + '}';
}

/**
 * @summary Computes 32-character MD5 content hash over explicit fields after sanitization
 */
export function computeJobContentHash(fields: ContentHashFields): string {
    const salaryMin = fields.salary?.min ?? null;
    const salaryMax = fields.salary?.max ?? null;
    const salaryCurrency = fields.salary?.currency ?? null;
    const salaryInterval = fields.salary?.interval ?? null;

    const secondary = Array.isArray(fields.secondaryLocations)
        ? fields.secondaryLocations
            .map(loc => (typeof loc === 'string' ? loc : loc?.location))
            .filter((loc): loc is string => Boolean(loc))
            .sort()
        : [];

    let publishedAtStr: string | null = null;
    if (fields.publishedAt instanceof Date) {
        publishedAtStr = fields.publishedAt.toISOString();
    } else if (typeof fields.publishedAt === 'string') {
        publishedAtStr = fields.publishedAt;
    }

    const canonical = {
        applyUrl: fields.applyUrl || '',
        city: fields.city ?? null,
        country: fields.country ?? null,
        department: fields.department ?? null,
        descriptionHtml: fields.descriptionHtml || '',
        descriptionPlain: fields.descriptionPlain || '',
        employmentType: fields.employmentType ?? null,
        isListed: fields.isListed !== false,
        isRemote: Boolean(fields.isRemote),
        location: fields.location ?? null,
        publishedAt: publishedAtStr,
        region: fields.region ?? null,
        salary: {
            currency: salaryCurrency,
            interval: salaryInterval,
            max: salaryMax,
            min: salaryMin
        },
        secondaryLocations: secondary,
        team: fields.team ?? null,
        title: fields.title || '',
        workplaceType: fields.workplaceType ?? null
    };

    return crypto.createHash('md5').update(stableStringify(canonical)).digest('hex');
}

interface ProcessedJob {
    ashbyId: string;
    title: string;
    companySlug: string;
    departmentId: string | null;
    locationId: string | null;
    applyUrl: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    salaryInterval: string | null;
    isRemote: boolean;
    workplaceType: string | null;
    employmentType: string | null;
    publishedAt: Date | null;
    isListed: boolean;
    country: string | null;
    region: string | null;
    city: string | null;
    postalAddress: any;
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
    private companiesWithExistingJobs = new Set<string>();
    private hasLoadedExistingJobSlugs = false;

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
     * @summary Creates MD5 hash of job content for change detection over explicit sanitized fields
     */
    public generateHash(job: AshbyJob | ContentHashFields): string {
        if ('salary' in job && typeof (job as any).salary === 'object' && ('min' in (job as any).salary || 'max' in (job as any).salary)) {
            return computeJobContentHash(job as ContentHashFields);
        }
        const ashbyJob = job as AshbyJob;
        const salary = extractSalary(ashbyJob);
        const postal = ashbyJob.address?.postalAddress;
        return computeJobContentHash({
            title: sanitizeText(ashbyJob.title),
            location: sanitizeText(ashbyJob.location) || null,
            department: sanitizeText(ashbyJob.department) || null,
            salary: {
                min: salary.min ?? null,
                max: salary.max ?? null,
                currency: salary.currency ?? null,
                interval: salary.interval ?? null
            },
            isRemote: Boolean(ashbyJob.isRemote),
            workplaceType: ashbyJob.workplaceType ?? null,
            employmentType: ashbyJob.employmentType ?? null,
            publishedAt: ashbyJob.publishedAt ? new Date(ashbyJob.publishedAt).toISOString() : null,
            applyUrl: ashbyJob.applyUrl || '',
            isListed: ashbyJob.isListed !== false,
            country: toIsoCountry(postal?.addressCountry),
            region: postal?.addressRegion ? sanitizeText(postal.addressRegion) : null,
            city: postal?.addressLocality ? sanitizeText(postal.addressLocality) : null,
            descriptionHtml: ashbyJob.descriptionHtml || (ashbyJob as any).metadata?.descriptionHtml || '',
            descriptionPlain: ashbyJob.descriptionPlain || (ashbyJob as any).metadata?.descriptionPlain || '',
            team: ashbyJob.team || (ashbyJob as any).metadata?.team || null,
            secondaryLocations: ashbyJob.secondaryLocations || (ashbyJob as any).metadata?.secondaryLocations || []
        });
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
                departmentId: job.departmentId ?? null,
                locationId: job.locationId ?? null,
                applyUrl: job.applyUrl,
                salaryMin: job.salaryMin ?? null,
                salaryMax: job.salaryMax ?? null,
                salaryCurrency: job.salaryCurrency ?? null,
                salaryInterval: job.salaryInterval ?? null,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType ?? null,
                employmentType: job.employmentType ?? null,
                publishedAt: job.publishedAt ?? null,
                isListed: job.isListed,
                country: job.country ?? null,
                region: job.region ?? null,
                city: job.city ?? null,
                postalAddress: job.postalAddress ?? Prisma.DbNull,
                metadata: job.metadata,
                contentHash: job.contentHash,
                lastSeenAt: new Date(),
                active: true
            },
            update: {
                title: job.title,
                departmentId: job.departmentId ?? null,
                locationId: job.locationId ?? null,
                applyUrl: job.applyUrl,
                salaryMin: job.salaryMin ?? null,
                salaryMax: job.salaryMax ?? null,
                salaryCurrency: job.salaryCurrency ?? null,
                salaryInterval: job.salaryInterval ?? null,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType ?? null,
                employmentType: job.employmentType ?? null,
                publishedAt: job.publishedAt ?? null,
                isListed: job.isListed,
                country: job.country ?? null,
                region: job.region ?? null,
                city: job.city ?? null,
                postalAddress: job.postalAddress ?? Prisma.DbNull,
                metadata: job.metadata,
                contentHash: job.contentHash,
                lastSeenAt: new Date(),
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
                        const now = new Date();
                        await createManyFn({
                            data: toCreate.map(job => ({
                                ashbyId: job.ashbyId,
                                title: job.title,
                                companySlug: job.companySlug,
                                departmentId: job.departmentId ?? null,
                                locationId: job.locationId ?? null,
                                applyUrl: job.applyUrl,
                                salaryMin: job.salaryMin ?? null,
                                salaryMax: job.salaryMax ?? null,
                                salaryCurrency: job.salaryCurrency ?? null,
                                salaryInterval: job.salaryInterval ?? null,
                                isRemote: job.isRemote,
                                workplaceType: job.workplaceType ?? null,
                                employmentType: job.employmentType ?? null,
                                publishedAt: job.publishedAt ?? null,
                                isListed: job.isListed,
                                country: job.country ?? null,
                                region: job.region ?? null,
                                city: job.city ?? null,
                                postalAddress: job.postalAddress ?? Prisma.DbNull,
                                metadata: job.metadata,
                                contentHash: job.contentHash,
                                lastSeenAt: now,
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
        }
    }

    /**
     * @summary Processes a single company's jobs, sanitizing fields and metadata before returning prepared job records
     */
    private async processCompanyJobs(
        companySlug: string,
        jobs: AshbyJob[]
    ): Promise<ProcessedJob[]> {
        if (jobs.length === 0) return [];

        const processedJobs: ProcessedJob[] = [];

        for (const job of jobs) {
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
            const cleanCountry = toIsoCountry(postal?.addressCountry);
            const cleanRegion = postal?.addressRegion ? sanitizeText(postal.addressRegion) : null;
            const cleanCity = postal?.addressLocality ? sanitizeText(postal.addressLocality) : null;

            // Generate contentHash AFTER sanitization over explicit field list
            const hash = computeJobContentHash({
                title: cleanTitle,
                location: cleanLoc || null,
                department: cleanDept || null,
                salary: {
                    min: salary.min ?? null,
                    max: salary.max ?? null,
                    currency: salary.currency ?? null,
                    interval: salary.interval ?? null
                },
                isRemote: Boolean(job.isRemote),
                workplaceType: job.workplaceType ?? null,
                employmentType: job.employmentType ?? null,
                publishedAt: validPublishedAt ? validPublishedAt.toISOString() : null,
                applyUrl: cleanApplyUrl,
                isListed: job.isListed !== false,
                country: cleanCountry,
                region: cleanRegion,
                city: cleanCity,
                descriptionHtml: cleanMetadata?.descriptionHtml || job.descriptionHtml || '',
                descriptionPlain: cleanMetadata?.descriptionPlain || job.descriptionPlain || '',
                team: cleanMetadata?.team || job.team || null,
                secondaryLocations: job.secondaryLocations || cleanMetadata?.secondaryLocations || []
            });

            processedJobs.push({
                ashbyId: job.id,
                title: cleanTitle,
                companySlug,
                departmentId,
                locationId,
                applyUrl: cleanApplyUrl,
                salaryMin: salary.min ?? null,
                salaryMax: salary.max ?? null,
                salaryCurrency: salary.currency ?? null,
                salaryInterval: salary.interval ?? null,
                isRemote: job.isRemote,
                workplaceType: job.workplaceType ?? null,
                employmentType: job.employmentType ?? null,
                publishedAt: validPublishedAt,
                isListed: job.isListed !== false,
                country: cleanCountry,
                region: postal?.addressRegion ? sanitizeText(postal.addressRegion) : null,
                city: postal?.addressLocality ? sanitizeText(postal.addressLocality) : null,
                postalAddress: postal ? (sanitizeJsonMetadata(postal) ?? Prisma.DbNull) : Prisma.DbNull,
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
        recheckNotFound?: boolean;
    } = {}): Promise<ErrorReportDocument> {
        const startTime = Date.now();
        const workerPrefix = options.workerId !== undefined ? `[Worker #${options.workerId} | PID ${process.pid}] ` : '';
        const concurrencyLimit = options.concurrency ?? CONCURRENCY_LIMIT;
        const shouldSaveTelemetry = options.saveTelemetry ?? (options.workerId === undefined);

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

        const isSundayUtc = new Date().getUTCDay() === 0;
        const recheckNotFound = options.recheckNotFound ?? (process.argv.includes('--recheck-not-found') || isSundayUtc);
        const statusFilter = recheckNotFound ? { in: ['ACTIVE', 'NOT_FOUND'] as any } : 'ACTIVE';

        const companies: Array<{ slug: string; consecutiveNotFound?: number; consecutiveFailures?: number }> = options.slugs
            ? await prisma.company.findMany({
                where: { slug: { in: options.slugs } },
                select: { slug: true, consecutiveNotFound: true, consecutiveFailures: true }
            }).then(rows => {
                const rowMap = new Map(rows.map(r => [r.slug, r]));
                return options.slugs!.map(s => rowMap.get(s) ?? { slug: s, consecutiveNotFound: 0, consecutiveFailures: 0 });
            }).catch(() => options.slugs!.map(slug => ({ slug, consecutiveNotFound: 0, consecutiveFailures: 0 })))
            : await prisma.company.findMany({
                where: { status: statusFilter },
                select: { slug: true, consecutiveNotFound: true, consecutiveFailures: true }
            });

        console.log(`🚀 ${workerPrefix}Starting HIGH-PERFORMANCE scrape for ${companies.length} companies`);
        console.log(`   ${workerPrefix}Concurrency: ${concurrencyLimit} | Batch Size: ${BATCH_SIZE}\n`);

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
                flushChain = flushChain
                    .then(async () => {
                        await this.batchUpsertJobs(chunkToWrite, tracker);
                    })
                    .catch((err: any) => {
                        tracker.dbErrors++;
                        tracker.recordEvent({
                            category: 'db_error',
                            companySlug: 'system',
                            message: `Batch flush failed: ${err.message || String(err)}`,
                            actionTaken: 'batch_flush_failed'
                        });
                        console.error(`  ❌ ${workerPrefix}[DbFlushError] Batch flush failed: ${err.message || String(err)}`);
                    });
            }
        };

        const fetchPromises = companies.map(company =>
            limit(async () => {
                try {
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

                    const now = new Date();

                    // Company health rules
                    if (boardResult.notFound) {
                        tracker.companiesNotFound++;
                        const consecutiveNotFound = (company.consecutiveNotFound ?? 0) + 1;
                        const isQuarantined = consecutiveNotFound >= 3;

                        if (isQuarantined) {
                            const updateManyFn = (prisma.job as any)?.updateMany;
                            if (typeof updateManyFn === 'function') {
                                await updateManyFn({
                                    where: { companySlug: company.slug, active: true },
                                    data: { active: false }
                                }).catch(() => {});
                            }
                            tracker.recordEvent({
                                category: 'company_quarantined',
                                companySlug: company.slug,
                                message: `Quarantined company after ${consecutiveNotFound} consecutive 404 responses; deactivated active jobs`,
                                actionTaken: 'status_not_found'
                            });
                        }

                        await prisma.company.update({
                            where: { slug: company.slug },
                            data: {
                                consecutiveNotFound,
                                lastCheckedAt: now,
                                ...(isQuarantined ? { status: 'NOT_FOUND' } : {})
                            }
                        }).catch(() => {});
                    } else if (boardResult.source === 'rest' || boardResult.source === 'graphql') {
                        // Success resets strike counters and restores ACTIVE status
                        await prisma.company.update({
                            where: { slug: company.slug },
                            data: {
                                status: 'ACTIVE',
                                consecutiveNotFound: 0,
                                consecutiveFailures: 0,
                                lastSuccessAt: now,
                                lastCheckedAt: now
                            }
                        }).catch(() => {});

                        const activeIds = boardResult.jobs.map(j => j.id);

                        // Touch lastSeenAt on existing jobs with one raw UPDATE per company
                        if (activeIds.length > 0 && typeof prisma.$executeRaw === 'function') {
                            await prisma.$executeRaw`UPDATE "Job" SET "lastSeenAt" = ${now} WHERE "companySlug" = ${company.slug} AND "ashbyId" = ANY(${activeIds})`.catch(() => {});
                        }

                        if (!this.hasLoadedExistingJobSlugs || this.companiesWithExistingJobs.has(company.slug)) {
                            await this.deactivateStaleJobs(company.slug, activeIds);
                        }
                    } else {
                        // source === 'none' with notFound === false (fetch error, network, timeout, 5xx)
                        const consecutiveFailures = (company.consecutiveFailures ?? 0) + 1;

                        if (consecutiveFailures >= 7) {
                            tracker.recordEvent({
                                category: 'company_unreachable',
                                companySlug: company.slug,
                                message: `Company fetch failed ${consecutiveFailures} consecutive times`,
                                actionTaken: 'alert_unreachable'
                            });
                        }

                        await prisma.company.update({
                            where: { slug: company.slug },
                            data: {
                                consecutiveFailures,
                                lastCheckedAt: now
                            }
                        }).catch(() => {});
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
                } catch (err: any) {
                    completed++;
                    tracker.companiesFailed++;
                    tracker.recordEvent({
                        category: 'company_error',
                        companySlug: company.slug,
                        message: err.message || String(err),
                        actionTaken: 'skipped'
                    });
                    console.error(`  ❌ ${workerPrefix}[CompanyError] Failed processing ${company.slug}: ${err.message || String(err)}`);
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
            })
            .catch(async (e) => {
                console.error(e);
                await prisma.$disconnect();
                process.exit(1);
            });
    }
}
