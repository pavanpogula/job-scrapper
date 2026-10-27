/**
 * @file Database seeding script
 * @summary Seeds database from config or extracted-slugs.json (--all). Memory-efficient diff strategy for bulk inserts.
 * @tags Setup, Bulk Insert, Memory Diff, Initial Data
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { TARGET_COMPANIES } from '../config/Companies';
import { isValidSlug } from '../discovery/CdxWorker';

const prisma = new PrismaClient();

/**
 * @summary Loads company slugs from extracted-slugs.json when --all flag is enabled
 */
export function loadTargetSlugs(useExtractedFile = false): string[] {
    if (useExtractedFile) {
        const extractedPath = path.join(process.cwd(), 'extracted-slugs.json');
        if (fs.existsSync(extractedPath)) {
            const parsed = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    }
    return TARGET_COMPANIES;
}

/**
 * @summary Compares target companies against DB, bulk inserts new entries
 */
export async function seed(options: { useExtractedSlugs?: boolean } = {}) {
    console.log('🌱 Starting Seed Process (Memory Diff Strategy)...');

    const targetList = loadTargetSlugs(options.useExtractedSlugs ?? false);

    // 1. Fetch ALL existing slugs (Low cost: 1 Query)
    const existingCompanies = await prisma.company.findMany({
        select: { slug: true }
    });

    const existingSlugs = new Set(existingCompanies.map((c: { slug: string }) => c.slug));
    console.log(`📊 Found ${existingSlugs.size} existing companies in DB.`);

    // 2. Memory Diff (excluding invalid or double-hyphen slugs)
    const validTargetList = targetList.filter(slug => isValidSlug(slug) && !slug.includes('--'));
    const invalidCount = targetList.length - validTargetList.length;
    if (invalidCount > 0) {
        console.warn(`⚠️ Filtered out ${invalidCount} invalid or double-hyphen slugs.`);
    }

    const newCompanies = validTargetList.filter(slug => !existingSlugs.has(slug));

    if (newCompanies.length === 0) {
        console.log('✅ No new companies to add.');
        return;
    }

    console.log(`📝 Found ${newCompanies.length} NEW companies to insert.`);

    // 3. Bulk Insert (Low cost: 1 Query)
    // Note: createMany is supported in Postgres
    await prisma.company.createMany({
        data: newCompanies.map(slug => ({
            slug: slug,
            name: slug,
            source: 'ASHBY' as const,
            atsToken: slug,
            status: 'ACTIVE'
        })),
        skipDuplicates: true
    });

    console.log('✅ Seed complete.');
}

if (require.main === module) {
    const useExtractedSlugs = process.argv.includes('--all');
    seed({ useExtractedSlugs })
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
