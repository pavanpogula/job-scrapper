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
 * @summary Parses CSV content into structured JobRow objects
 */
export function parseCSV(content: string): JobRow[] {
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
        // Handle CSV parsing with potential commas in fields
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
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
 * @summary Formats JobRow array into Markdown table with truncation
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
        const title = job.title.length > 40 ? job.title.substring(0, 37) + '...' : job.title;
        const company = job.company.length > 20 ? job.company.substring(0, 17) + '...' : job.company;
        const location = job.location.length > 20 ? job.location.substring(0, 17) + '...' : job.location;
        const department = job.department.length > 15 ? job.department.substring(0, 12) + '...' : job.department;
        const applyLink = `[Apply →](${job.link})`;

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
