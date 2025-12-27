/**
 * @file Core Ashby job scraper
 * @summary Fetches jobs from Ashby API, normalizes data, and stores in database with Redis caching for change detection
 * @tags Core, Ashby API, Redis, Upsert, Change Detection
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { redis } from './lib/redis';

const prisma = new PrismaClient();

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

/**
 * @summary Main scraper class. Fetches jobs from Ashby API, hashes content, upserts to DB.
 */
export class AshbyScraper {

    /**
     * @summary Calls Ashby API to fetch all jobs for a company. Handles 404 by marking company as NOT_FOUND.
     */
    private async fetchJobs(companySlug: string): Promise<AshbyJob[]> {
        try {
            const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}?includeCompensation=true`;
            console.log(`Fetching ${url}...`);
            const { data } = await axios.get<AshbyResponse>(url);
            return data.jobs || [];
        } catch (e: any) {
            if (axios.isAxiosError(e) && e.response?.status === 404) {
                console.warn(`⚠️ Company ${companySlug} not found (404). Marking as NOT_FOUND.`);
                await prisma.company.update({
                    where: { slug: companySlug },
                    data: { status: 'NOT_FOUND' }
                });
            } else {
                console.error(`Error fetching ${companySlug}:`, e instanceof Error ? e.message : e);
            }
            return [];
        }
    }

    /**
     * @summary Creates MD5 hash of job content for change detection. Avoids redundant DB writes.
     */
    private generateHash(job: AshbyJob): string {
        const content = `${job.title}|${job.location}|${job.department}|${job.compensationTier?.min}|${job.compensationTier?.max}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * @summary Upserts a department record. Returns ID or null if name is empty.
     */
    private async getOrCreateDepartment(name: string): Promise<string | null> {
        if (!name) return null;
        const dept = await prisma.department.upsert({
            where: { name },
            update: {},
            create: { name }
        });
        return dept.id;
    }

    /**
     * @summary Upserts a location record. Returns ID or null if name is empty.
     */
    private async getOrCreateLocation(name: string): Promise<string | null> {
        if (!name) return null;
        const loc = await prisma.location.upsert({
            where: { name },
            update: {},
            create: { name }
        });
        return loc.id;
    }

    /**
     * @summary Processes all jobs for a company. Checks Redis cache, upserts changed jobs.
     */
    public async processCompany(companySlug: string) {
        const jobs = await this.fetchJobs(companySlug);
        if (jobs.length === 0) return;

        console.log(`Processing ${jobs.length} jobs for ${companySlug}...`);

        // Ensure Redis connection
        if (redis.status === 'wait') {
            try { await redis.connect(); } catch { /* Redis optional */ }
        }
        const isRedisConnected = redis.status === 'ready';

        for (const job of jobs) {
            try {
                const contentHash = this.generateHash(job);
                const redisKey = `job:${job.id}:hash`;

                let shouldProcess = true;

                if (isRedisConnected) {
                    const cachedHash = await redis.get(redisKey);
                    if (cachedHash === contentHash) {
                        shouldProcess = false;
                    }
                }

                if (!shouldProcess) continue;

                const departmentId = await this.getOrCreateDepartment(job.department);
                const locationId = await this.getOrCreateLocation(job.location);

                await prisma.job.upsert({
                    where: { ashbyId: job.id },
                    create: {
                        ashbyId: job.id,
                        title: job.title,
                        companySlug: companySlug,
                        departmentId: departmentId,
                        locationId: locationId,
                        applyUrl: job.applyUrl,
                        salaryMin: job.compensationTier?.min,
                        salaryMax: job.compensationTier?.max,
                        salaryCurrency: job.compensationTier?.currency,
                        metadata: job as any,
                        contentHash: contentHash,
                        active: true
                    },
                    update: {
                        title: job.title,
                        departmentId: departmentId,
                        locationId: locationId,
                        salaryMin: job.compensationTier?.min,
                        salaryMax: job.compensationTier?.max,
                        contentHash: contentHash,
                        updatedAt: new Date(),
                        active: true
                    }
                });

                if (isRedisConnected) {
                    await redis.set(redisKey, contentHash, 'EX', 60 * 60 * 24 * 7);
                }

            } catch (e) {
                console.error(`Failed to process job ${job.id}:`, e);
            }
        }
    }

    /**
     * @summary Entry point. Fetches all ACTIVE companies and scrapes each one sequentially.
     */
    public async runAll() {
        const companies = await prisma.company.findMany({
            where: { status: 'ACTIVE' }
        });
        console.log(`Starting scrape for ${companies.length} ACTIVE companies.`);

        for (const company of companies) {
            await this.processCompany(company.slug);
        }
        console.log("Scrape complete.");
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
