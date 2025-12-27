/**
 * @file Company discovery service
 * @summary Auto-discovers companies from Wayback Machine CDX API. Validates slugs with regex and blocklist.
 * @tags Discovery, Wayback Machine, Validation, Regex, Blocklist
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';

// Strict regex: 
// - Must start/end with a-z or 0-9
// - Can contain hyphens
// - No distinct generic terms that are obviously code/css
const VALID_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BLOCKLIST = new Set([
    'login', 'api', 'feed', 'jobs', 'careers', 'admin', 'dashboard', 'search',
    'assets', 'static', 'fonts', 'css', 'js', 'favicon', 'robots.txt',
    'null', 'undefined', 'true', 'false', '0x', '100vh', '500ms', 'void'
]);

/**
 * @summary Validates company slug against regex, length, blocklist, and numeric patterns
 */
export function isValidSlug(slug: string): boolean {
    if (!slug) return false;

    // 1. Length check (most legitimate company names are > 2 chars, though 'x' or 'ai' exist, let's say min 2)
    if (slug.length < 2 || slug.length > 50) return false;

    // 2. Regex check (Content format)
    if (!VALID_SLUG_REGEX.test(slug)) return false;

    // 3. Blocklist check (Known keywords)
    if (BLOCKLIST.has(slug)) return false;

    // 4. Numeric check: Pure numbers are rarely valid company slugs (usually pagination or ids)
    if (/^\d+$/.test(slug)) return false;

    return true;
}

/**
 * @summary Fetches archived Ashby URLs from Wayback Machine CDX API
 */
async function fetchAshbyUrls() {
    console.log('Fetching URLs from Wayback Machine CDX...');
    try {
        const response = await axios.get(CDX_API_URL, {
            params: {
                url: 'jobs.ashbyhq.com/*',
                output: 'json',
                fl: 'original',
                collapse: 'urlkey',
                limit: 1000 // Limit for testing, remove for full run
            }
        });

        // CDX returns array of arrays: [["original"], ["url1"], ["url2"]...]
        return response.data.slice(1).map((row: string[]) => row[0]);
    } catch (error) {
        console.error('Error fetching from CDX:', error);
        return [];
    }
}

/**
 * @summary Parses Ashby URL and extracts company slug from path
 */
function extractCompanySlug(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

        // Pattern: https://jobs.ashbyhq.com/<slug>/...
        if (pathParts.length >= 1) {
            // Remove any URL encoded stuff which might indicate junk
            let slug = decodeURIComponent(pathParts[0]).toLowerCase();

            // Clean up common trash suffix/prefix chars if any slip through regex (e.g. quotes)
            slug = slug.replace(/["']/g, '');

            if (isValidSlug(slug)) {
                return slug;
            }
        }
        return null;

    } catch (e) {
        return null;
    }
}

/**
 * @summary Main discovery function. Fetches URLs, extracts slugs, upserts to DB.
 */
export async function runDiscovery() {
    const urls = await fetchAshbyUrls();
    console.log(`Found ${urls.length} URLs. Extracting slugs...`);

    const slugs = new Set<string>();
    for (const url of urls) {
        const slug = extractCompanySlug(url);
        if (slug) {
            slugs.add(slug);
        }
    }

    console.log(`Found ${slugs.size} unique company slugs.`);

    // Upsert into DB
    for (const slug of slugs) {
        try {
            await prisma.company.upsert({
                where: { slug: slug },
                update: {}, // No update if exists
                create: {
                    slug: slug,
                    name: slug, // Placeholder, can be updated by scraper
                }
            });
            process.stdout.write('.');
        } catch (e) {
            console.error(`Failed to upsert ${slug}`);
        }
    }
    console.log('\nDiscovery complete.');
}

// Allow running directly
if (require.main === module) {
    runDiscovery()
        .then(async () => {
            await prisma.$disconnect();
        })
        .catch(async (e) => {
            console.error(e);
            await prisma.$disconnect();
            process.exit(1);
        });
}
