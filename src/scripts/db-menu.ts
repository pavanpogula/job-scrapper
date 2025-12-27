/**
 * @file Interactive database explorer
 * @summary CLI menu for querying database. Dashboard, search, salaries, raw SQL.
 * @tags CLI, Interactive, readline, Query Tool, SQL
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const MENU = `
=========================================
 💼 Job Scraper Database Explorer
=========================================
1. 📊 Dashboard (High-level stats)
2. 🏢 Jobs per Company (Hiring Volume)
3. 💰 Top Salaries (Highest paying roles)
4. 🔎 Search Jobs (Find by title)
5. 📍 Location Breakdown
6. 👻 Ghost Companies (No jobs found)
7. � Run SQL Query (Advanced)
8. �🚪 Exit
=========================================
`;

/**
 * @summary Shows high-level stats: company, job, department, location counts
 */
async function showDashboard() {
    const [companyCount, jobCount, deptCount, locationCount] = await Promise.all([
        prisma.company.count(),
        prisma.job.count(),
        prisma.department.count(),
        prisma.location.count()
    ]);
    console.log('\n📊 DASHBOARD');
    console.log(`- Companies:   ${companyCount}`);
    console.log(`- Jobs:        ${jobCount}`);
    console.log(`- Departments: ${deptCount}`);
    console.log(`- Locations:   ${locationCount}`);
}

/**
 * @summary Shows top 15 companies ranked by job count
 */
async function showJobsPerCompany() {
    const results = await prisma.job.groupBy({
        by: ['companySlug'],
        _count: { id: true },
        orderBy: {
            _count: { id: 'desc' }
        },
        take: 15
    });

    console.table(results.map((r: { companySlug: string, _count: { id: number } }) => ({
        Company: r.companySlug,
        Jobs: r._count.id
    })));
}

/**
 * @summary Shows top 10 highest-paying jobs with salary info
 */
async function showTopSalaries() {
    const jobs = await prisma.job.findMany({
        where: {
            salaryMax: { not: null }
        },
        orderBy: {
            salaryMax: 'desc'
        },
        take: 10,
        select: {
            title: true,
            companySlug: true,
            salaryMax: true,
            salaryCurrency: true
        }
    });

    console.table(jobs.map((j: { title: string, companySlug: string, salaryMax: number | null, salaryCurrency: string | null }) => ({
        Role: j.title.substring(0, 40), // Truncate for display
        Company: j.companySlug,
        MaxSalary: `${j.salaryMax?.toLocaleString()} ${j.salaryCurrency}`
    })));
}

/**
 * @summary Prompts for search term and finds matching jobs by title
 */
async function searchJobs() {
    return new Promise<void>((resolve) => {
        rl.question('\nEnter search term (e.g. "Engineer"): ', async (term) => {
            if (!term.trim()) {
                resolve();
                return;
            }

            const jobs = await prisma.job.findMany({
                where: {
                    title: { contains: term, mode: 'insensitive' }
                },
                take: 10,
                select: {
                    title: true,
                    companySlug: true,
                    applyUrl: true
                }
            });

            if (jobs.length === 0) {
                console.log('No matches found.');
            } else {
                console.table(jobs.map((j: { title: string, companySlug: string }) => ({
                    Role: j.title.substring(0, 50),
                    Company: j.companySlug
                })));
            }
            resolve();
        });
    });
}

/**
 * @summary Shows top 10 locations by job count
 */
async function showLocations() {
    const results = await prisma.job.groupBy({
        by: ['locationId'],
        _count: { id: true },
        orderBy: {
            _count: { id: 'desc' }
        },
        take: 10
    });

    // We only have IDs, so we need to fetch names. 
    // Optimization: perform a join manually or use raw query, but loop is fine for top 10.
    const locationIds = results.map((r: { locationId: string | null }) => r.locationId).filter((id: string | null) => id !== null) as string[];
    const locations = await prisma.location.findMany({
        where: { id: { in: locationIds } }
    });

    const locMap = new Map(locations.map((l: { id: string, name: string }) => [l.id, l.name]));

    console.table(results.map((r: { locationId: string | null, _count: { id: number } }) => ({
        Location: locMap.get(r.locationId || '') || 'Unknown',
        Jobs: r._count.id
    })));
}

/**
 * @summary Finds companies with zero job listings
 */
async function showGhostCompanies() {
    // Find companies with ZERO jobs
    // Prisma doesn't do "WHERE NOT EXISTS" easily in fluent API effectively without raw or multiple queries
    // Fastest way here: Get all companies, get all companies with jobs, diff them.

    const allCompanies = await prisma.company.findMany({ select: { slug: true } });
    const companiesWithJobs = await prisma.job.groupBy({
        by: ['companySlug'],
    });

    const activeSet = new Set(companiesWithJobs.map((c: { companySlug: string }) => c.companySlug));
    const ghosts = allCompanies.filter((c: { slug: string }) => !activeSet.has(c.slug));

    console.log(`\n👻 Found ${ghosts.length} Ghost Companies (0 jobs):`);
    if (ghosts.length > 0) {
        console.log(ghosts.map((c: { slug: string }) => c.slug).slice(0, 20).join(', '));
        if (ghosts.length > 20) console.log('...');
    }
}

/**
 * @summary Prompts for raw SQL query and executes it
 */
async function runSqlQuery() {
    return new Promise<void>((resolve) => {
        rl.question('\nEnter SQL query: ', async (sql) => {
            if (!sql.trim()) {
                resolve();
                return;
            }

            try {
                const results = await prisma.$queryRawUnsafe(sql) as any[];

                if (results.length === 0) {
                    console.log('No results.');
                } else {
                    console.table(results.slice(0, 50)); // Limit to 50 rows for display
                    if (results.length > 50) {
                        console.log(`... and ${results.length - 50} more rows`);
                    }
                }
            } catch (err: any) {
                console.error('SQL Error:', err.message);
            }
            resolve();
        });
    });
}

/**
 * @summary Main menu loop. Displays options and handles user input.
 */
function prompt() {
    rl.question(`\nSelect an option [1-8]: `, async (answer) => {
        try {
            switch (answer.trim()) {
                case '1': await showDashboard(); break;
                case '2': await showJobsPerCompany(); break;
                case '3': await showTopSalaries(); break;
                case '4': await searchJobs(); break;
                case '5': await showLocations(); break;
                case '6': await showGhostCompanies(); break;
                case '7': await runSqlQuery(); break;
                case '8':
                    console.log('Bye! 👋');
                    await prisma.$disconnect();
                    rl.close();
                    process.exit(0);
                    break;
                default:
                    console.log('Invalid option.');
            }
        } catch (e) {
            console.error('Error:', e);
        }

        // Loop unless exit
        if (answer.trim() !== '8') prompt();
    });
}

// Start
console.log(MENU);
prompt();
