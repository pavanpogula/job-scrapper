/**
 * @file Company Organization Metadata Enricher
 * @summary Concurrently enriches active hiring companies with real display names and logo URLs from Ashby hosted boards
 * @tags Company, Enrichment, Logo, Organization, Metadata, Concurrency
 */

import { PrismaClient } from '@prisma/client';
import { createLimiter } from '../lib/Concurrency';
import { AtsClient, BoardRef } from '../lib/ats/AtsClient';
import { AshbyAtsClient } from '../lib/ats/AshbyAtsClient';
import { GreenhouseClient } from '../lib/ats/GreenhouseClient';
import { AtsSource, parseAtsSources, toAtsSource, toDbAts } from '../lib/ats/source';

const prisma = new PrismaClient();

export interface EnrichmentResult {
    totalTargeted: number;
    enrichedCount: number;
    failedCount: number;
    skippedCount: number;
    durationSeconds: number;
}

/**
 * @summary Enriches active hiring companies that lack a display name or logo URL using adaptive concurrency
 */
export async function enrichActiveCompanies(options: {
    concurrency?: number;
    limit?: number;
    forceAll?: boolean;
    sources?: AtsSource[];
    clients?: Map<AtsSource, AtsClient>;
} = {}): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const concurrency = options.concurrency ?? 15;

    const sourcesFlag = process.argv.find(a => a.startsWith('--sources='));
    let enabledSources: AtsSource[];
    if (options.sources && options.sources.length > 0) {
        enabledSources = options.sources;
    } else if (sourcesFlag) {
        const raw = sourcesFlag.split('=')[1];
        try {
            enabledSources = parseAtsSources(raw);
        } catch (err: unknown) {
            console.error(`❌ ${(err as Error).message}`);
            process.exit(1);
        }
    } else {
        enabledSources = ['ashby'];
    }

    const clients = options.clients
        ? new Map(options.clients)
        : new Map<AtsSource, AtsClient>([
            ['ashby', new AshbyAtsClient()],
            ['greenhouse', new GreenhouseClient()]
        ]);

    const enabledDbSources = enabledSources.map(toDbAts);

    console.log('🔍 Identifying active hiring companies needing enrichment...');

    // Find companies with active jobs
    const activeCompanies = await prisma.company.findMany({
        where: {
            source: { in: enabledDbSources },
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
            source: true,
            atsToken: true,
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
            skippedCount: 0,
            durationSeconds: 0
        };
    }

    const limiter = createLimiter(concurrency);
    let enrichedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let processed = 0;

    const tasks = candidates.map(company =>
        limiter(async () => {
            const atsSource = toAtsSource(company.source);
            const client = clients.get(atsSource);

            if (!client) {
                processed++;
                skippedCount++;
                console.warn(`  ⚠️ [Enrich] Skipping ${company.slug}: no AtsClient registered for source ${atsSource}`);
                return;
            }

            try {
                const ref: BoardRef = {
                    slug: company.slug,
                    source: atsSource,
                    atsToken: company.atsToken || company.slug
                };
                const meta = await client.fetchCompanyMetadata(ref);
                processed++;

                if (meta.status === 'rate_limited') {
                    failedCount++;
                    limiter.onRateLimit(meta.retryAfterSeconds ? meta.retryAfterSeconds * 1000 : undefined);
                } else if (meta.status === 'ok' && (meta.name || meta.logoUrl)) {
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
                    console.log(`  📊 [${processed}/${candidates.length}] Enriched: ${enrichedCount} | No meta: ${failedCount} | Skipped: ${skippedCount}`);
                }
            } catch (err: any) {
                processed++;
                failedCount++;
                if (err?.response?.status === 429) {
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
    console.log(`   Skipped (unregistered): ${skippedCount}`);

    return {
        totalTargeted: candidates.length,
        enrichedCount,
        failedCount,
        skippedCount,
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
