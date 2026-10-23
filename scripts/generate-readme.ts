/**
 * @file JOBS.md Markdown Table Generator
 * @summary Parses the latest CSV job export with RFC-4180 quote handling and renders a pipe-escaped JOBS.md table
 * @tags Documentation, Markdown, CSV Parser, Sanitization
 */

import * as fs from 'fs';
import * as path from 'path';

export interface JobRow {
    company: string;
    title: string;
    link: string;
    publishedDate: string;
    location: string;
    department: string;
}

/**
 * @summary Escapes Markdown table cell delimiters (pipes and newlines) so rows never break table layout
 */
export function sanitizeMarkdownCell(text: string): string {
    return (text || '')
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, '\\|')
        .trim();
}

/**
 * @summary Parses CSV content into structured JobRow objects (handles commas and escaped "" quotes)
 */
export function parseCSV(content: string): JobRow[] {
    const lines = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter(line => line.trim());

    if (lines.length <= 1) return [];

    return lines.slice(1).map(line => {
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip escaped quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        return {
            company: values[0] || '',
            title: values[1] || '',
            link: values[2] || '',
            publishedDate: values[3] || '',
            location: values[4] || '',
            department: values[5] || ''
        };
    });
}

/**
 * @summary Formats JobRow array into Markdown table with pipe sanitization and truncation
 */
export function generateMarkdownTable(jobs: JobRow[]): string {
    const timestamp = new Date().toISOString().split('T')[0];

    let markdown = `# 🔍 Job Listings

*Last updated: ${timestamp}* | **Total Jobs: ${jobs.length}**

| # | Company | Job Title | Location | Department | Posted | Apply |
|---|---------|-----------|----------|------------|--------|-------|
`;

    jobs.forEach((job, index) => {
        const id = index + 1;
        const rawTitle = job.title.length > 40 ? job.title.substring(0, 37) + '...' : job.title;
        const rawCompany = job.company.length > 20 ? job.company.substring(0, 17) + '...' : job.company;
        const rawLocation = job.location.length > 20 ? job.location.substring(0, 17) + '...' : job.location;
        const rawDepartment = job.department.length > 15 ? job.department.substring(0, 12) + '...' : job.department;

        const title = sanitizeMarkdownCell(rawTitle);
        const company = sanitizeMarkdownCell(rawCompany);
        const location = sanitizeMarkdownCell(rawLocation);
        const department = sanitizeMarkdownCell(rawDepartment);
        const safeLink = (job.link || '').replace(/[)\s]/g, encodeURIComponent);
        const applyLink = `[Apply →](${safeLink})`;

        markdown += `| ${id} | ${company} | ${title} | ${location} | ${department} | ${job.publishedDate} | ${applyLink} |\n`;
    });

    return markdown;
}

async function main() {
    const outputDir = path.join(__dirname, '..', 'output');

    // Find the most recent CSV file
    const files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.csv') && f.startsWith('jobs_'))
        .sort()
        .reverse();

    if (files.length === 0) {
        console.error('❌ No job CSV files found in output/');
        process.exit(1);
    }

    const latestFile = files[0];
    console.log(`📄 Using latest file: ${latestFile}`);

    const csvPath = path.join(outputDir, latestFile);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const jobs = parseCSV(csvContent);
    console.log(`📊 Parsed ${jobs.length} job listings`);

    const markdown = generateMarkdownTable(jobs);

    // Write to JOBS.md in repo root
    const jobsPath = path.join(__dirname, '..', 'JOBS.md');
    fs.writeFileSync(jobsPath, markdown);
    console.log(`✅ Generated JOBS.md with ${jobs.length} jobs`);
    console.log(`📍 File saved to: ${jobsPath}`);
}

if (require.main === module) {
    main().catch(console.error);
}
