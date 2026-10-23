/**
 * @file Core Ashby job scraper (High-Performance)
 * @summary Fetches jobs from Ashby API using concurrent requests, batch DB writes, and Redis caching
 * @tags Core, Ashby API, Redis, Batch, Concurrent, High-Performance
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { createLimiter } from '../lib/Concurrency';
import { redis } from '../lib/Redis';

const prisma = new PrismaClient();

// Configuration
const CONCURRENCY_LIMIT = 15;  // Parallel API requests
const BATCH_SIZE = 100;        // Jobs per DB transaction

// Types for Ashby API Response
interface AshbyJob {
    id: string;
    title: string;
    department: string;
    location: string;
    employmentType: string;
    applyUrl: string;
    isRemote: boolean;
    compensationTier?: {
        min: number;
        max: number;
        currency: string;
        interval: string;
    };
    jobUrl: string;
}

interface AshbyResponse {
    jobs: AshbyJob[];
}

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
    metadata: any;
    contentHash: string;
}

/**
 * @summary High-performance scraper class with concurrent requests and batch DB writes
 */
export class AshbyScraper {
    private departmentCache = new Map<string, string>();
    private locationCache = new Map<string, string>();
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
     * @summary Calls Ashby API to fetch all jobs for a company
     */
    private async fetchJobs(companySlug: string): Promise<{ slug: string; jobs: AshbyJob[] }> {
        try {
            const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}?includeCompensation=true`;
            const { data } = await axios.get<AshbyResponse>(url, { timeout: 10000 });
            return { slug: companySlug, jobs: data.jobs || [] };
        } catch (e: any) {
            if (axios.isAxiosError(e) && e.response?.status === 404) {
                // Mark as NOT_FOUND (will be batched later)
                await prisma.company.update({
                    where: { slug: companySlug },
                    data: { status: 'NOT_FOUND' }
                }).catch(() => { }); // Ignore if company doesn't exist
            }
            return { slug: companySlug, jobs: [] };
        }
    }

    /**
     * @summary Creates MD5 hash of job content for change detection
     */
    private generateHash(job: AshbyJob): string {
        const content = `${job.title}|${job.location}|${job.department}|${job.compensationTier?.min}|${job.compensationTier?.max}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * @summary Gets or creates department with in-memory caching
     */
    private async getOrCreateDepartment(name: string): Promise<string | null> {
        if (!name) return null;

        // Check cache first
        if (this.departmentCache.has(name)) {
            return this.departmentCache.get(name)!;
        }

        const dept = await prisma.department.upsert({
            where: { name },
            update: {},
            create: { name }
        });

        this.departmentCache.set(name, dept.id);
        return dept.id;
    }

    /**
     * @summary Gets or creates location with in-memory caching
     */
    private async getOrCreateLocation(name: string): Promise<string | null> {
        if (!name) return null;

        // Check cache first
        if (this.locationCache.has(name)) {
            return this.locationCache.get(name)!;
        }

        const loc = await prisma.location.upsert({
            where: { name },
            update: {},
            create: { name }
        });

        this.locationCache.set(name, loc.id);
        return loc.id;
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
     * @summary Processes jobs in batches using database transactions
     */
    private async batchUpsertJobs(processedJobs: ProcessedJob[]) {
        if (processedJobs.length === 0) return;

        // Process in batches
        for (let i = 0; i < processedJobs.length; i += BATCH_SIZE) {
            const batch = processedJobs.slice(i, i + BATCH_SIZE);

            // Use transaction for batch upsert
            await prisma.$transaction(
                batch.map(job =>
                    prisma.job.upsert({
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
                            metadata: job.metadata,
                            contentHash: job.contentHash,
                            active: true
                        },
                        update: {
                            title: job.title,
                            departmentId: job.departmentId,
                            locationId: job.locationId,
                            salaryMin: job.salaryMin,
                            salaryMax: job.salaryMax,
                            contentHash: job.contentHash,
                            updatedAt: new Date(),
                            active: true
                        }
                    })
                )
            );

            // Update Redis cache
            if (this.isRedisConnected) {
                const pipeline = redis.pipeline();
                batch.forEach(job => {
                    pipeline.set(`job:${job.ashbyId}:hash`, job.contentHash, 'EX', 60 * 60 * 24 * 7);
                });
                await pipeline.exec();
            }
        }
    }

    /**
     * @summary Processes a single company's jobs and returns prepared job records
     */
    private async processCompanyJobs(
        companySlug: string,
        jobs: AshbyJob[]
    ): Promise<ProcessedJob[]> {
        const changedJobs = await this.filterChangedJobs(jobs);
        if (changedJobs.length === 0) return [];

        const processedJobs: ProcessedJob[] = [];

        for (const { job, hash } of changedJobs) {
            const departmentId = await this.getOrCreateDepartment(job.department);
            const locationId = await this.getOrCreateLocation(job.location);

            processedJobs.push({
                ashbyId: job.id,
                title: job.title,
                companySlug,
                departmentId,
                locationId,
                applyUrl: job.applyUrl,
                salaryMin: job.compensationTier?.min,
                salaryMax: job.compensationTier?.max,
                salaryCurrency: job.compensationTier?.currency,
                metadata: job,
                contentHash: hash
            });
        }

        return processedJobs;
    }

    /**
     * @summary Entry point. Fetches companies concurrently and batch-writes to DB.
     */
    public async runAll() {
        const startTime = Date.now();

        await this.initRedis();

        const companies = await prisma.company.findMany({
            where: { status: 'ACTIVE' },
            select: { slug: true }
        });

        console.log(`🚀 Starting HIGH-PERFORMANCE scrape for ${companies.length} companies`);
        console.log(`   Concurrency: ${CONCURRENCY_LIMIT} | Batch Size: ${BATCH_SIZE}`);
        console.log(`   Redis: ${this.isRedisConnected ? '✅ Connected' : '⚠️ Disabled'}\n`);

        // Create concurrency limiter
        const limit = createLimiter(CONCURRENCY_LIMIT);

        // Fetch all companies concurrently
        let completed = 0;
        const allJobs: ProcessedJob[] = [];

        const fetchPromises = companies.map(company =>
            limit(async () => {
                const result = await this.fetchJobs(company.slug);
                completed++;

                if (result.jobs.length > 0) {
                    const processed = await this.processCompanyJobs(result.slug, result.jobs);
                    allJobs.push(...processed);
                    console.log(`  ✅ ${result.slug}: ${result.jobs.length} jobs (${processed.length} changed)`);
                }

                // Progress indicator every 100 companies
                if (completed % 100 === 0) {
                    console.log(`📊 Progress: ${completed}/${companies.length} companies`);
                }
            })
        );

        await Promise.all(fetchPromises);

        console.log(`\n📦 Batch writing ${allJobs.length} jobs to database...`);
        await this.batchUpsertJobs(allJobs);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Scrape complete in ${elapsed}s`);
        console.log(`   Companies: ${companies.length} | Jobs processed: ${allJobs.length}`);
    }
}

if (require.main === module) {
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
