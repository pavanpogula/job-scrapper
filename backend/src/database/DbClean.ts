/**
 * @file Database cleanup script
 * @summary Removes invalid company entries using isValidSlug. Deletes jobs first for FK constraint.
 * @tags Maintenance, Cleanup, Dry-run, --execute
 */

import { PrismaClient } from '@prisma/client';
import { isValidSlug } from '../discovery/CdxWorker';

const prisma = new PrismaClient();

/**
 * @summary Scans all companies, deletes invalid entries and their jobs
 */
export async function cleanDatabase() {
    const isDryRun = !process.argv.includes('--execute');
    console.log(`🧹 Starting Database Cleanup (${isDryRun ? 'DRY RUN' : 'EXECUTION MODE'})...`);

    try {
        const allCompanies = await prisma.company.findMany({
            where: { source: 'ASHBY' },
            select: { id: true, slug: true, name: true }
        });

        console.log(`📊 Scanned ${allCompanies.length} total companies.`);

        const invalidCompanies = allCompanies.filter((c: { id: string; slug: string; name: string | null }) => !isValidSlug(c.slug));

        if (invalidCompanies.length === 0) {
            console.log('✅ No invalid companies found. Database is clean!');
            return;
        }

        console.log(`⚠️ Found ${invalidCompanies.length} invalid entries.`);

        // Show a sample of what we found
        console.log('\nSample of invalid slugs to be removed:');
        invalidCompanies.slice(0, 15).forEach((c: { slug: string }) => console.log(` - ${c.slug}`));
        if (invalidCompanies.length > 15) console.log(`   ...and ${invalidCompanies.length - 15} more.`);

        if (isDryRun) {
            console.log('\n🛑 This was a DRY RUN. No data was deleted.');
            console.log('👉 To actually delete these entries, run this script with --execute');
        } else {
            console.log(`\n🗑️ Deleting ${invalidCompanies.length} companies...`);

            const invalidSlugs = invalidCompanies.map((c: { slug: string }) => c.slug);
            const invalidIds = invalidCompanies.map((c: { id: string }) => c.id);

            // 1. Delete associated jobs first (Foreign Key Constraint)
            if (invalidSlugs.length > 0) {
                const jobsDeleted = await prisma.job.deleteMany({
                    where: {
                        companySlug: { in: invalidSlugs }
                    }
                });
                console.log(`   - Deleted ${jobsDeleted.count} dependent jobs.`);
            }

            // 2. Delete companies
            // Delete in batches or one go? One go is fine for <10k usually
            const result = await prisma.company.deleteMany({
                where: {
                    id: { in: invalidIds }
                }
            });
            console.log(`✅ Successfully deleted ${result.count} entries.`);
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    cleanDatabase();
}
