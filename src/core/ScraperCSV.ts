/**
 * @file CSV Job Scraper (High-Performance)
 * @summary Scrapes jobs concurrently, streams to CSV. Optional Google Drive upload.
 * @tags CSV, Export, Concurrent, Streaming, High-Performance
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLimiter } from '../lib/Concurrency';
import { uploadWithOAuth } from '../lib/GoogleDriveOAuth';
import { fetchAshbyBoardWithFallback } from '../lib/AshbyClient';
import { sanitizeJobUrl, sanitizePublishedDate, sanitizeText } from '../lib/Sanitizer';
import { ErrorTracker } from '../lib/ErrorTracker';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configuration
const CONCURRENCY_LIMIT = 15;  // Parallel API requests

export interface JobRecord {
    company: string;
    title: string;
    link: string;
    publishedDate: string;
    location: string;
    department: string;
}

/**
 * @summary Fetches and sanitizes all job postings for a company from Ashby's public API with GraphQL fallback
 */
export async function fetchJobsForCompany(
    companySlug: string,
    tracker?: ErrorTracker,
    onRateLimit?: () => void,
    onSuccess?: () => void
): Promise<JobRecord[]> {
    const result = await fetchAshbyBoardWithFallback(companySlug, {
        includeCompensation: false
    });

    if (result.rateLimited) {
        if (tracker) {
            tracker.rateLimitsEncountered++;
            tracker.recordEvent({
                category: 'rate_limited',
                companySlug,
                message: 'HTTP 429 Too Many Requests received from Posting API',
                actionTaken: 'throttled_concurrency'
            });
        }
        if (onRateLimit) onRateLimit();
    } else if (onSuccess) {
        onSuccess();
    }

    if (result.failure && tracker) {
        tracker.recordEvent({
            category: 'api_error',
            subkind: result.failure.kind === 'timeout'
                ? 'timeout'
                : result.failure.kind === 'network'
                ? 'network'
                : `http_${result.failure.status || '5xx'}`,
            companySlug,
            message: `Posting API failed (${result.failure.code || result.failure.kind}) after ${result.failure.attempts} attempts`,
            actionTaken: 'retry_exhausted',
            httpStatus: result.failure.status,
            attempts: result.failure.attempts
        });
    }

    if (result.source === 'graphql' && tracker) {
        tracker.graphqlFallbacksUsed++;
        tracker.recordEvent({
            category: 'graphql_fallback',
            companySlug,
            message: 'Posting API returned 404/403; recovered board via Ashby hosted GraphQL API',
            actionTaken: `recovered_${result.jobs.length}_jobs`
        });
    }

    if (result.notFound && tracker) {
        tracker.companiesNotFound++;
    }

    if (result.validationIssues && result.validationIssues.length > 0 && tracker) {
        tracker.recordValidationIssues(result.validationIssues);
    }

    return result.jobs.map(job => ({
        company: sanitizeText(companySlug),
        title: sanitizeText(job.title),
        link: sanitizeJobUrl(job.jobUrl, companySlug, job.id, false),
        publishedDate: sanitizePublishedDate(job.publishedAt) || '',
        location: sanitizeText(job.location),
        department: sanitizeText(job.department)
    }));
}

/**
 * @summary Escapes a CSV field value (handles commas, quotes, newlines, carriage returns, and null bytes)
 */
export function escapeCSV(value: string): string {
    // eslint-disable-next-line no-control-regex
    const clean = (value ?? '').replace(/\x00/g, '');
    if (clean.includes(',') || clean.includes('"') || clean.includes('\n') || clean.includes('\r')) {
        return `"${clean.replace(/"/g, '""')}"`;
    }
    return clean;
}

/**
 * @summary Formats a job record as a CSV line
 */
export function formatCSVRow(job: JobRecord): string {
    return [
        escapeCSV(job.company),
        escapeCSV(job.title),
        escapeCSV(job.link),
        escapeCSV(job.publishedDate),
        escapeCSV(job.location),
        escapeCSV(job.department)
    ].join(',');
}

/**
 * @summary Uploads a file to Google Drive using OAuth (personal accounts)
 */
async function uploadToGoogleDrive(filePath: string): Promise<string | null> {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    return await uploadWithOAuth(filePath, folderId);
}

/**
 * @summary Main function - scrapes jobs concurrently and streams to CSV
 */
export async function scrapeToCSV() {
    const startTime = Date.now();
    const uploadToCloud = process.argv.includes('--upload-cloud');

    console.log('📄 HIGH-PERFORMANCE CSV Job Scraper\n');

    // Get all active companies from database
    const companies = await prisma.company.findMany({
        where: { status: 'ACTIVE' },
        select: { slug: true }
    });

    if (companies.length === 0) {
        console.log('⚠️  No active companies found. Run: npm run seed');
        await prisma.$disconnect();
        return;
    }

    console.log(`🏢 Found ${companies.length} active companies`);
    console.log(`⚡ Concurrency: ${CONCURRENCY_LIMIT} parallel requests\n`);

    // Create output directory and file
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `jobs_${timestamp}.csv`;
    const filePath = path.join(outputDir, fileName);

    // Create write stream for streaming output
    const writeStream = fs.createWriteStream(filePath);
    const headers = 'Company,Job Title,Job Link,Published Date,Location,Department';
    writeStream.write(headers + '\n');

    // Create concurrency limiter and telemetry tracker
    const limit = createLimiter(CONCURRENCY_LIMIT);
    const tracker = new ErrorTracker('csv_scrape');
    tracker.companiesAttempted = companies.length;

    let completed = 0;
    let totalJobs = 0;

    // Fetch all companies concurrently
    const fetchPromises = companies.map(company =>
        limit(async () => {
            const jobs = await fetchJobsForCompany(
                company.slug,
                tracker,
                () => limit.onRateLimit(),
                () => limit.onSuccess()
            );
            completed++;

            if (jobs.length > 0) {
                tracker.companiesWithJobs++;
                tracker.jobsCollected += jobs.length;
                totalJobs += jobs.length;
                // Stream write each job immediately
                for (const job of jobs) {
                    writeStream.write(formatCSVRow(job) + '\n');
                }
                console.log(`  ✅ ${company.slug}: ${jobs.length} jobs`);
            }

            // Progress indicator every 100 companies
            if (completed % 100 === 0) {
                console.log(`📊 Progress: ${completed}/${companies.length} companies (${totalJobs} jobs so far)`);
            }
        })
    );

    await Promise.all(fetchPromises);
    tracker.saveReport(outputDir);

    // Close the write stream
    await new Promise<void>((resolve, reject) => {
        writeStream.end((err: Error | null) => {
            if (err) reject(err);
            else resolve();
        });
    });

    await prisma.$disconnect();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (totalJobs === 0) {
        console.log('\n⚠️  No jobs found. Check company slugs.');
        fs.unlinkSync(filePath); // Remove empty file
        return;
    }

    console.log(`\n✅ Exported ${totalJobs} jobs to: ${filePath}`);
    console.log(`⏱️  Completed in ${elapsed}s`);

    // Upload to Google Drive if flag is set
    if (uploadToCloud) {
        await uploadToGoogleDrive(filePath);
    } else {
        console.log('\n💡 Tip: Add --upload-cloud to upload to Google Drive');
    }
}

// Run
if (require.main === module) {
    scrapeToCSV().catch(console.error);
}
