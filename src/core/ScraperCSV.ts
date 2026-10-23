/**
 * @file CSV Job Scraper (High-Performance)
 * @summary Scrapes jobs concurrently, streams to CSV. Optional Google Drive upload.
 * @tags CSV, Export, Concurrent, Streaming, High-Performance
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createLimiter } from '../lib/Concurrency';
import { uploadWithOAuth } from '../lib/GoogleDriveOAuth';
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
 * @summary Fetches all job postings for a company from Ashby's public API
 */
export async function fetchJobsForCompany(companySlug: string): Promise<JobRecord[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;

    try {
        const response = await axios.get<{ jobs: any[] }>(url, { timeout: 10000 });
        const jobs = response.data?.jobs || [];

        return jobs.map(job => ({
            company: companySlug,
            title: job.title,
            link: `https://jobs.ashbyhq.com/${companySlug}/${job.id}`,
            publishedDate: job.publishedAt ? job.publishedAt.split('T')[0] : '',
            location: job.location || '',
            department: job.department || ''
        }));
    } catch {
        return [];
    }
}

/**
 * @summary Escapes a CSV field value (handles commas, quotes, newlines)
 */
export function escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
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

    // Create concurrency limiter
    const limit = createLimiter(CONCURRENCY_LIMIT);

    let completed = 0;
    let totalJobs = 0;

    // Fetch all companies concurrently
    const fetchPromises = companies.map(company =>
        limit(async () => {
            const jobs = await fetchJobsForCompany(company.slug);
            completed++;

            if (jobs.length > 0) {
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
