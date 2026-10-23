/**
 * @file Database seeding script
 * @summary Seeds database from config. Memory-efficient diff strategy for bulk inserts.
 * @tags Setup, Bulk Insert, Memory Diff, Initial Data
 */

import { PrismaClient } from '@prisma/client';
import { TARGET_COMPANIES } from '../config/Companies';

const prisma = new PrismaClient();

/**
 * @summary Compares TARGET_COMPANIES against DB, bulk inserts new entries
 */
export async function seed() {
    console.log('🌱 Starting Seed Process (Memory Diff Strategy)...');

    // 1. Fetch ALL existing slugs (Low cost: 1 Query)
    const existingCompanies = await prisma.company.findMany({
        select: { slug: true }
    });

    const existingSlugs = new Set(existingCompanies.map((c: { slug: string }) => c.slug));
    console.log(`📊 Found ${existingSlugs.size} existing companies in DB.`);

    // 2. Memory Diff
    const newCompanies = TARGET_COMPANIES.filter(slug => !existingSlugs.has(slug));

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
            status: 'ACTIVE'
        })),
        skipDuplicates: true
    });

    console.log('✅ Seed complete.');
}

if (require.main === module) {
    seed()
        .catch(console.error)
        .finally(() => prisma.$disconnect());
}
