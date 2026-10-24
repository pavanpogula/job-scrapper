/**
 * @file Company discovery service
 * @summary Auto-discovers companies from Wayback Machine CDX and CommonCrawl APIs, validates slugs, and enriches organization metadata
 * @tags Discovery, Wayback Machine, CommonCrawl, Validation, Regex, Blocklist
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { fetchOrganizationMetadata } from '../lib/AshbyClient';

const prisma = new PrismaClient();

const CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';
const COMMON_CRAWL_INDEX_URL = 'https://index.commoncrawl.org/CC-MAIN-2024-51-index';

// Strict regex: 
// - Must start/end with a-z or 0-9
// - Can contain hyphens
// - No distinct generic terms that are obviously code/css
const VALID_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BLOCKLIST = new Set([
    'login', 'api', 'feed', 'jobs', 'careers', 'admin', 'dashboard', 'search',
    'assets', 'static', 'fonts', 'css', 'js', 'favicon', 'robots.txt',
    'null', 'undefined', 'true', 'false', '0x', '100vh', '500ms', 'void',
    'embed', 'application', 'apply', 'graphql', 'non-user-graphql', 'posting-api',
    'sitemap.xml', 'manifest.json', 'health', 'status', 'privacy', 'terms',
    'oauth', 'auth', 'webhook', 'webhooks', 'internal', 'nan'
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
async function fetchAshbyUrls(limit = 1000) {
    console.log('Fetching URLs from Wayback Machine CDX...');
    try {
        const response = await axios.get(CDX_API_URL, {
            params: {
                url: 'jobs.ashbyhq.com/*',
                output: 'json',
                fl: 'original',
                collapse: 'urlkey',
                limit
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
 * @summary Fetches archived Ashby URLs from CommonCrawl Index API (JSONL format)
 */
export async function fetchCommonCrawlUrls(): Promise<string[]> {
    try {
        const response = await axios.get<string>(COMMON_CRAWL_INDEX_URL, {
            params: {
                url: 'jobs.ashbyhq.com/*',
                output: 'json',
                fl: 'url'
            },
            timeout: 15000
        });

        if (typeof response.data !== 'string') return [];

        return response.data
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                try {
                    return JSON.parse(line).url as string;
                } catch {
                    return '';
                }
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * @summary Parses Ashby URL and extracts company slug from path
 */
export function extractCompanySlug(url: string): string | null {
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

    } catch {
        return null;
    }
}

/**
 * @summary Enriches a company record in DB with real display name and logoUrl from Ashby's hosted page
 */
export async function enrichCompanyMetadata(slug: string): Promise<boolean> {
    const metadata = await fetchOrganizationMetadata(slug);
    if (metadata.status !== 'ok' || (!metadata.name && !metadata.logoUrl)) {
        return false;
    }

    try {
        await prisma.company.update({
            where: { slug },
            data: {
                ...(metadata.name ? { name: metadata.name } : {}),
                ...(metadata.logoUrl ? { logoUrl: metadata.logoUrl } : {})
            }
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * @summary Main discovery function. Fetches URLs, extracts slugs, upserts to DB.
 */
export async function runDiscovery(options: { includeCommonCrawl?: boolean; enrichMetadata?: boolean } = {}) {
    const urls = await fetchAshbyUrls();
    if (options.includeCommonCrawl) {
        const ccUrls = await fetchCommonCrawlUrls();
        urls.push(...ccUrls);
    }
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
            if (options.enrichMetadata) {
                await enrichCompanyMetadata(slug);
            }
            process.stdout.write('.');
        } catch {
            console.error(`Failed to upsert ${slug}`);
        }
    }
    console.log('\nDiscovery complete.');
}

// Allow running directly
if (require.main === module) {
    const includeCommonCrawl = process.argv.includes('--common-crawl');
    const enrichMetadata = process.argv.includes('--enrich');
    runDiscovery({ includeCommonCrawl, enrichMetadata })
        .then(async () => {
            await prisma.$disconnect();
        })
        .catch(async (e) => {
            console.error(e);
            await prisma.$disconnect();
            process.exit(1);
        });
}
