/**
 * @file Database Verification & Data Integrity Auditor
 * @summary Verifies database connectivity, table counts (Company, Job, Department, Location), salary extraction coverage, and sanitization integrity
 * @tags Utility, Verification, Database, Integrity, Audit
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface DbVerificationReport {
    companiesTotal: number;
    companiesActive: number;
    companiesNotFound: number;
    jobsTotal: number;
    jobsActive: number;
    jobsInactive: number;
    jobsWithSalary: number;
    departmentsTotal: number;
    locationsTotal: number;
    emptyTitles: number;
    invalidApplyUrls: number;
    nullByteMetadataIssues: number;
}

/**
 * @summary Audits database row counts, company statuses, salary coverage, and job data sanitization integrity
 */
export async function verifyDatabase(): Promise<DbVerificationReport> {
    console.log('🔍 Running Database Verification & Data Integrity Audit...\n');

    const [
        companiesTotal,
        companiesActive,
        companiesNotFound,
        jobsTotal,
        jobsActive,
        jobsInactive,
        jobsWithSalary,
        departmentsTotal,
        locationsTotal
    ] = await Promise.all([
        prisma.company.count(),
        prisma.company.count({ where: { status: 'ACTIVE' } }),
        prisma.company.count({ where: { status: 'NOT_FOUND' } }),
        prisma.job.count(),
        prisma.job.count({ where: { active: true } }),
        prisma.job.count({ where: { active: false } }),
        prisma.job.count({ where: { salaryMin: { not: null } } }),
        prisma.department.count(),
        prisma.location.count()
    ]);

    console.log(`📊 Table Counts:`);
    console.log(`   Companies   : ${companiesTotal} (ACTIVE: ${companiesActive}, NOT_FOUND: ${companiesNotFound})`);
    console.log(`   Jobs        : ${jobsTotal} (Active: ${jobsActive}, Inactive: ${jobsInactive}, With Salary: ${jobsWithSalary})`);
    console.log(`   Departments : ${departmentsTotal}`);
    console.log(`   Locations   : ${locationsTotal}`);

    const companiesPerSlug = await prisma.company.findMany({
        include: { _count: { select: { jobs: true } } },
        orderBy: { jobs: { _count: 'desc' } },
        take: 15
    });

    console.log(`\n🏢 Top ${companiesPerSlug.length} Companies by Job Count:`);
    for (const c of companiesPerSlug) {
        console.log(`   - ${c.slug.padEnd(20)} | status: ${c.status.padEnd(10)} | jobs: ${c._count.jobs}`);
    }

    const sampleJobs = await prisma.job.findMany({
        take: 500,
        select: {
            ashbyId: true,
            title: true,
            applyUrl: true,
            metadata: true
        }
    });

    let emptyTitles = 0;
    let invalidApplyUrls = 0;
    let nullByteMetadataIssues = 0;

    for (const j of sampleJobs) {
        if (!j.title || j.title.trim().length === 0) emptyTitles++;
        if (!j.applyUrl || !/^https?:\/\//i.test(j.applyUrl)) invalidApplyUrls++;
        const rawMeta = JSON.stringify(j.metadata ?? {});
        if (rawMeta.includes('\\u0000')) nullByteMetadataIssues++;
    }

    console.log(`\n🛡️  Sanitization & Integrity Audit (${sampleJobs.length} jobs inspected):`);
    console.log(`   - Empty Titles           : ${emptyTitles}`);
    console.log(`   - Invalid Apply URLs     : ${invalidApplyUrls}`);
    console.log(`   - Null-Byte JSONB Issues : ${nullByteMetadataIssues}`);

    const topSalaryJobs = await prisma.job.findMany({
        where: { salaryMax: { not: null }, salaryCurrency: 'USD' },
        orderBy: { salaryMax: 'desc' },
        take: 5,
        include: { location: true }
    });

    if (topSalaryJobs.length > 0) {
        console.log(`\n💰 Sample Extracted Salaries (Top ${topSalaryJobs.length}):`);
        for (const s of topSalaryJobs) {
            console.log(
                `   - [${s.companySlug}] ${s.title} (${s.location?.name || 'N/A'}): ${s.salaryCurrency} ${s.salaryMin?.toLocaleString()} - ${s.salaryMax?.toLocaleString()}`
            );
        }
    }

    const passed = emptyTitles === 0 && invalidApplyUrls === 0 && nullByteMetadataIssues === 0;
    console.log(`\n${passed ? '✅ Database Integrity Check PASSED (0 data errors)' : '⚠️  Database Integrity Issues Detected'}`);

    return {
        companiesTotal,
        companiesActive,
        companiesNotFound,
        jobsTotal,
        jobsActive,
        jobsInactive,
        jobsWithSalary,
        departmentsTotal,
        locationsTotal,
        emptyTitles,
        invalidApplyUrls,
        nullByteMetadataIssues
    };
}

if (require.main === module) {
    verifyDatabase()
        .catch(err => {
            console.error('❌ Verification failed:', err);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}
