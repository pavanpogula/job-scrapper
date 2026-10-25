/**
 * @file ISO-3166 alpha-2 Country Normalization Backfill CLI
 * @summary Backfills and normalizes country strings on existing Job records to 2-letter uppercase ISO codes and updates contentHash
 * @tags Database, CLI, Normalization, Country, Backfill
 */

import { PrismaClient } from '@prisma/client';
import { toIsoCountry } from '../lib/Country';
import { computeJobContentHash } from '../core/Scraper';

const prisma = new PrismaClient();

export interface NormalizeResult {
    scanned: number;
    changed: number;
    unknown: number;
}

/**
 * @summary Paginates all jobs with non-null country and standardizes country code to ISO-3166 alpha-2
 * @param dryRun If true, previews changes without writing to database
 * @returns Summary counts of scanned, changed, and unknown jobs
 */
export async function normalizeCountries(dryRun: boolean = false): Promise<NormalizeResult> {
    let scanned = 0;
    let changed = 0;
    let unknown = 0;

    const pageSize = 500;
    let cursor: string | undefined = undefined;

    let hasMore = true;
    while (hasMore) {
        const jobs: any[] = await prisma.job.findMany({
            where: {
                country: { not: null }
            },
            take: pageSize,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { id: 'asc' },
            select: {
                id: true,
                title: true,
                applyUrl: true,
                salaryMin: true,
                salaryMax: true,
                salaryCurrency: true,
                salaryInterval: true,
                isRemote: true,
                workplaceType: true,
                employmentType: true,
                publishedAt: true,
                isListed: true,
                country: true,
                region: true,
                city: true,
                metadata: true,
                department: true,
                location: true
            }
        });

        if (jobs.length === 0) {
            hasMore = false;
            break;
        }

        for (const job of jobs) {
            scanned++;
            const normalized = toIsoCountry(job.country);

            if (normalized !== job.country) {
                changed++;
                if (normalized === null) {
                    unknown++;
                }

                const metadata = (job.metadata as Record<string, any>) || {};

                const newHash = computeJobContentHash({
                    title: job.title,
                    location: job.location?.name ?? metadata.location ?? null,
                    department: job.department?.name ?? metadata.department ?? null,
                    salary: {
                        min: job.salaryMin ?? null,
                        max: job.salaryMax ?? null,
                        currency: job.salaryCurrency ?? null,
                        interval: job.salaryInterval ?? null
                    },
                    isRemote: job.isRemote,
                    workplaceType: job.workplaceType ?? null,
                    employmentType: job.employmentType ?? null,
                    publishedAt: job.publishedAt ? job.publishedAt.toISOString() : null,
                    applyUrl: job.applyUrl,
                    isListed: job.isListed,
                    country: normalized,
                    region: job.region,
                    city: job.city,
                    descriptionHtml: metadata.descriptionHtml ?? '',
                    descriptionPlain: metadata.descriptionPlain ?? '',
                    team: metadata.team ?? null,
                    secondaryLocations: metadata.secondaryLocations ?? []
                });

                if (!dryRun) {
                    await prisma.job.update({
                        where: { id: job.id },
                        data: {
                            country: normalized,
                            contentHash: newHash
                        }
                    });
                }
            }
        }

        cursor = jobs[jobs.length - 1].id;
        if (jobs.length < pageSize) {
            hasMore = false;
        }
    }

    return { scanned, changed, unknown };
}

/**
 * @summary CLI entry point for country normalization
 */
async function main() {
    const isDryRun = process.argv.includes('--dry-run');
    if (isDryRun) {
        console.log('🔍 Running in --dry-run mode (no database writes)...');
    }

    try {
        const result = await normalizeCountries(isDryRun);
        console.log(JSON.stringify(result));
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('Fatal normalization error:', err);
        process.exit(1);
    });
}
