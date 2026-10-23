/**
 * @file Backfill Structured Job Fields
 * @summary Backfills structured columns on Job (salaryInterval, isRemote, workplaceType, employmentType, publishedAt, isListed, country, region, city, postalAddress) from metadata JSONB
 * @tags Database, Migration, Backfill, PostgreSQL, JSONB
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * @summary Backfills structured fields for all active jobs in PostgreSQL from their metadata JSONB
 */
export async function backfillJobFields(): Promise<{ updatedCount: number }> {
    console.log('🔄 Backfilling structured fields for active jobs from metadata JSONB...');

    const result = await prisma.$executeRaw`
        UPDATE "Job"
        SET
            "salaryInterval" = (
                SELECT comp->>'interval'
                FROM jsonb_array_elements(
                    CASE 
                        WHEN jsonb_typeof(metadata->'compensation'->'summaryComponents') = 'array'
                        THEN metadata->'compensation'->'summaryComponents'
                        WHEN jsonb_typeof(metadata->'compensation'->'compensationTiers') = 'array'
                        THEN (
                            SELECT jsonb_agg(c)
                            FROM jsonb_array_elements(metadata->'compensation'->'compensationTiers') t,
                            LATERAL jsonb_array_elements(
                                CASE 
                                    WHEN jsonb_typeof(t->'components') = 'array'
                                    THEN t->'components'
                                    ELSE '[]'::jsonb
                                END
                            ) c
                        )
                        ELSE '[]'::jsonb 
                    END
                ) AS comp
                WHERE comp->>'compensationType' = 'Salary'
                  AND (comp->>'minValue' IS NOT NULL OR comp->>'maxValue' IS NOT NULL)
                LIMIT 1
            ),
            "isRemote" = (
                COALESCE((metadata->>'isRemote')::boolean, false) OR
                LOWER(COALESCE(metadata->>'location', '')) LIKE '%remote%'
            ),
            "workplaceType" = NULLIF(TRIM(metadata->>'workplaceType'), ''),
            "employmentType" = NULLIF(TRIM(metadata->>'employmentType'), ''),
            "publishedAt" = CASE
                WHEN metadata->>'publishedAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
                THEN (metadata->>'publishedAt')::timestamptz
                ELSE NULL
            END,
            "isListed" = COALESCE((metadata->>'isListed')::boolean, true),
            "country" = NULLIF(TRIM(metadata->'address'->'postalAddress'->>'addressCountry'), ''),
            "region" = NULLIF(TRIM(metadata->'address'->'postalAddress'->>'addressRegion'), ''),
            "city" = NULLIF(TRIM(metadata->'address'->'postalAddress'->>'addressLocality'), ''),
            "postalAddress" = CASE
                WHEN metadata->'address'->'postalAddress' IS NOT NULL
                THEN metadata->'address'->'postalAddress'
                ELSE NULL
            END
        WHERE active = true;
    `;

    console.log(`✅ Backfilled ${result} active jobs with structured fields.`);
    return { updatedCount: Number(result) };
}

if (require.main === module) {
    backfillJobFields()
        .then(() => prisma.$disconnect())
        .catch(err => {
            console.error('❌ Backfill failed:', err);
            prisma.$disconnect();
            process.exit(1);
        });
}
