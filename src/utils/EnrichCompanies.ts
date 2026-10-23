/**
 * @file Company Organization Metadata Enricher
 * @summary Concurrently enriches active hiring companies with real display names and logo URLs from Ashby hosted boards
 * @tags Company, Enrichment, Logo, Organization, Metadata, Concurrency
 */

import { PrismaClient } from '@prisma/client';
import { createLimiter } from '../lib/Concurrency';
import { fetchOrganizationMetadata } from '../lib/AshbyClient';

const prisma = new PrismaClient();

export interface EnrichmentResult {
    totalTargeted: number;
    enrichedCount: number;
    failedCount: number;
    durationSeconds: number;
}

/**
 * @summary Enriches active hiring companies that lack a display name or logo URL using adaptive concurrency
 */
export async function enrichActiveCompanies(options: {
    concurrency?: number;
    limit?: number;
    forceAll?: boolean;
} = {}): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const concurrency = options.concurrency ?? 15;

    console.log('🔍 Identifying active hiring companies needing enrichment...');

    // Find companies with active jobs
    const activeCompanies = await prisma.company.findMany({
        where: {
            jobs: {
                some: { active: true }
            },
            ...(options.forceAll
                ? {}
                : {
                    OR: [
                        { name: null },
                        { logoUrl: null }
                    ]
                })
        },
        select: {
            slug: true,
            name: true,
            logoUrl: true
        },
        take: options.limit
    });

    // Also include companies where name === slug as needing enrichment
    const candidates = options.forceAll
        ? activeCompanies
        : activeCompanies.filter(c => !c.name || c.name === c.slug || !c.logoUrl);

    console.log(`🎯 Found ${candidates.length} active hiring companies to enrich (concurrency = ${concurrency})...`);

    if (candidates.length === 0) {
        return {
            totalTargeted: 0,
            enrichedCount: 0,
            failedCount: 0,
            durationSeconds: 0
        };
    }

    const limiter = createLimiter(concurrency);
    let enrichedCount = 0;
    let failedCount = 0;
    let processed = 0;

    const tasks = candidates.map(company =>
        limiter(async () => {
            try {
                const meta = await fetchOrganizationMetadata(company.slug);
                processed++;

                if (meta && (meta.name || meta.logoUrl)) {
                    await prisma.company.update({
                        where: { slug: company.slug },
                        data: {
                            ...(meta.name ? { name: meta.name } : {}),
                            ...(meta.logoUrl ? { logoUrl: meta.logoUrl } : {})
                        }
                    });
                    enrichedCount++;
                    limiter.onSuccess();
                } else {
                    failedCount++;
                }

                if (processed % 100 === 0 || processed === candidates.length) {
                    console.log(`  📊 [${processed}/${candidates.length}] Enriched: ${enrichedCount} | No meta: ${failedCount}`);
                }
            } catch (err: any) {
                processed++;
                failedCount++;
                if (err?.response?.status === 429 || err?.response?.status === 403) {
                    limiter.onRateLimit();
                }
            }
        })
    );

    await Promise.all(tasks);

    const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
    console.log(`\n🎉 Company enrichment complete in ${durationSeconds}s!`);
    console.log(`   Total targeted: ${candidates.length}`);
    console.log(`   Successfully enriched: ${enrichedCount}`);
    console.log(`   No metadata / un-enriched: ${failedCount}`);

    return {
        totalTargeted: candidates.length,
        enrichedCount,
        failedCount,
        durationSeconds
    };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
    const limitArg = args.find(a => a.startsWith('--limit='));
    const forceAll = args.includes('--force');

    const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 15;
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

    enrichActiveCompanies({ concurrency, limit, forceAll })
        .then(() => prisma.$disconnect())
        .catch(err => {
            console.error('❌ Enrichment failed:', err);
            prisma.$disconnect();
            process.exit(1);
        });
}
