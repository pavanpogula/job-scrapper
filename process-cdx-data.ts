/**
 * @file CDX Data Processor
 * @summary Converts raw Wayback Machine CDX response to valid company slugs
 * @tags Utility, CDX, Data Processing
 */

import * as fs from 'fs';
import { isValidSlug } from './src/discovery/cdx-worker';

// If running with a file path argument
const inputFile = process.argv[2];

// Example: npx ts-node process-cdx-data.ts response.json
async function processRawCDXData(rawData: string[][]) {
    console.log(`📥 Processing ${rawData.length} raw URLs...\n`);

    const validSlugs = new Set<string>();
    const rejectedSlugs = new Map<string, string>(); // slug -> reason

    for (const row of rawData) {
        const url = row[0];

        // Skip header row
        if (url === 'original') continue;

        // Skip root URLs without path
        if (url.match(/^https?:\/\/jobs\.ashbyhq\.com\/?$/)) continue;

        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

            if (pathParts.length === 0) continue;

            // First path segment is the company slug
            let slug = decodeURIComponent(pathParts[0]).toLowerCase();

            // Clean up common junk
            slug = slug.replace(/[\"\']/g, '').trim();

            // Skip known invalid patterns
            if (slug.startsWith('.well-known')) {
                rejectedSlugs.set(slug, 'System path');
                continue;
            }
            if (slug.startsWith('$') || slug.startsWith('%')) {
                rejectedSlugs.set(slug, 'Encoded/variable');
                continue;
            }
            if (slug === '*' || slug.includes('*')) {
                rejectedSlugs.set(slug, 'Wildcard');
                continue;
            }
            if (slug.match(/^\d+$/)) {
                rejectedSlugs.set(slug, 'Pure number');
                continue;
            }

            // Skip UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
            if (slug.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                rejectedSlugs.set(slug, 'UUID');
                continue;
            }

            // Skip hex strings (likely job IDs or hashes)
            if (slug.match(/^[0-9a-f]{20,}$/i)) {
                rejectedSlugs.set(slug, 'Hex string');
                continue;
            }

            // Skip CSS-like values (100vw, 750ms, etc.)
            if (slug.match(/^\d+(px|em|rem|vh|vw|ms|s|%)$/i)) {
                rejectedSlugs.set(slug, 'CSS value');
                continue;
            }

            // Skip very short slugs (likely junk)
            if (slug.length < 2) {
                rejectedSlugs.set(slug, 'Too short');
                continue;
            }

            // Use existing validation
            if (isValidSlug(slug)) {
                validSlugs.add(slug);
            } else {
                rejectedSlugs.set(slug, 'Failed isValidSlug');
            }

        } catch (e) {
            // Invalid URL
        }
    }

    console.log('✅ VALID SLUGS FOUND:', validSlugs.size);
    console.log('━'.repeat(40));

    // Output as array for companies.ts
    const slugArray = Array.from(validSlugs).sort();
    console.log('\n📋 Copy this to src/config/companies.ts:\n');
    console.log('export const TARGET_COMPANIES = [');
    slugArray.forEach(slug => console.log(`  "${slug}",`));
    console.log('];');

    // Also save to file
    const outputPath = 'extracted-slugs.json';
    fs.writeFileSync(outputPath, JSON.stringify(slugArray, null, 2));
    console.log(`\n💾 Saved to ${outputPath}`);

    console.log(`\n❌ Rejected: ${rejectedSlugs.size} unique invalid slugs`);

    return slugArray;
}

// Run if executed directly
if (require.main === module) {
    if (inputFile) {
        console.log(`Reading from ${inputFile}...`);
        const rawContent = fs.readFileSync(inputFile, 'utf-8');
        const rawData = JSON.parse(rawContent);
        processRawCDXData(rawData);
    } else {
        console.log('Usage: npx ts-node process-cdx-data.ts <path-to-json-file>');
        console.log('Example: npx ts-node process-cdx-data.ts ~/Desktop/response.json');
    }
}

export { processRawCDXData };
