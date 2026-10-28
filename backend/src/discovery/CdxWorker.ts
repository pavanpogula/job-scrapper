/**
 * @file Company discovery service
 * @summary Auto-discovers companies from Wayback Machine CDX and CommonCrawl APIs, validates slugs/tokens, and enriches organization metadata for Ashby and Greenhouse
 * @tags Discovery, Wayback Machine, CommonCrawl, Validation, Greenhouse, Ashby, Regex, Blocklist
 */

import axios from 'axios';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { fetchOrganizationMetadata } from '../lib/AshbyClient';
import { createLimiter } from '../lib/Concurrency';
import { GreenhouseClient } from '../lib/ats/GreenhouseClient';
import { BoardRef } from '../lib/ats/AtsClient';

const prisma = new PrismaClient();

const CDX_API_URL = 'http://web.archive.org/cdx/search/cdx';

// Strict regex for Ashby slugs:
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
 * Greenhouse hosts to crawl
 */
export const GREENHOUSE_HOSTS = new Set([
    'job-boards.greenhouse.io',
    'boards.greenhouse.io',
    'job-boards.eu.greenhouse.io',
    'boards.eu.greenhouse.io',
]);

/**
 * Reserved URL segments on Greenhouse hosts to drop
 */
export const GREENHOUSE_RESERVED_SEGMENTS = new Set([
    'embed', 'jobs', 'job_app', 'v1', 'api', 'static', 'assets',
    'robots.txt', 'favicon.ico', 'privacy', 'terms', 'health', 'status',
    'search', 'login', 'admin', 'feed', 'docs', 'internal'
]);

/**
 * Greenhouse token format regex: starts with a-z0-9, followed by 1 to 59 chars of a-z0-9, _, -
 */
export const GREENHOUSE_TOKEN_REGEX = /^[a-z0-9][a-z0-9_-]{1,59}$/;

/**
 * @summary Validates company slug against regex, length, blocklist, and numeric patterns for Ashby
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
 * @summary Validates Greenhouse board token format against regex, reserved segments, and length
 */
export function isValidGreenhouseToken(token: string): boolean {
    if (!token) return false;
    const lower = token.toLowerCase();
    if (GREENHOUSE_RESERVED_SEGMENTS.has(lower)) return false;
    return GREENHOUSE_TOKEN_REGEX.test(lower);
}

/**
 * @summary Extracts Greenhouse board token from job board or embed URL
 */
export function extractGreenhouseToken(url: string): string | null {
    try {
        const urlObj = new URL(url);
        if (!GREENHOUSE_HOSTS.has(urlObj.hostname.toLowerCase())) {
            return null;
        }

        // Check embed/job_board?for=<token>
        const forParam = urlObj.searchParams.get('for');
        if (forParam) {
            const cleanFor = decodeURIComponent(forParam).trim().toLowerCase();
            if (isValidGreenhouseToken(cleanFor)) {
                return cleanFor;
            }
        }

        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
        if (pathParts.length >= 1) {
            let segment = decodeURIComponent(pathParts[0]).trim().toLowerCase();
            segment = segment.replace(/["']/g, '');
            if (isValidGreenhouseToken(segment)) {
                return segment;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * @summary Fetches archived Ashby URLs from Wayback Machine CDX API
 */
export async function fetchAshbyUrls(limit = 10000) {
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
        return (response.data as string[][]).slice(1).map(row => row[0]);
    } catch (error) {
        console.error('Error fetching from CDX:', error);
        return [];
    }
}

/**
 * @summary Fetches archived Ashby URLs from CommonCrawl Index API (JSONL format) across multiple pages
 */
export async function fetchCommonCrawlUrls(crawlId = 'CC-MAIN-2024-51', maxPages = 3): Promise<string[]> {
    const urls: string[] = [];
    const indexUrl = `https://index.commoncrawl.org/${crawlId}-index`;

    for (let page = 0; page < maxPages; page++) {
        try {
            const response = await axios.get<string>(indexUrl, {
                params: {
                    url: 'jobs.ashbyhq.com/*',
                    output: 'json',
                    fl: 'url',
                    page
                },
                timeout: 15000
            });

            if (typeof response.data !== 'string') break;

            const pageUrls = response.data
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

            if (pageUrls.length === 0) break;
            urls.push(...pageUrls);
        } catch {
            break;
        }
    }

    return urls;
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
 * @summary Enriches a company record in DB with real display name and logoUrl
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
 * @summary Fetches the latest Common Crawl crawl ID from collinfo.json, falling back to default
 */
export async function fetchLatestCrawlId(fallback = 'CC-MAIN-2024-51'): Promise<string> {
    try {
        const response = await axios.get<Array<{ id: string }>>('https://index.commoncrawl.org/collinfo.json', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; JobScraperBot/1.0)',
            },
        });
        if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].id) {
            return response.data[0].id;
        }
        return fallback;
    } catch {
        return fallback;
    }
}

/**
 * Helper to retry an axios GET request with exponential backoff on 504 / 502 / 503 / 429
 */
async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (attempt < retries && (status === 504 || status === 502 || status === 503 || status === 429 || !status)) {
                await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
                continue;
            }
            return null;
        }
    }
    return null;
}

/**
 * @summary Crawls Common Crawl for Greenhouse board URLs using paged CDX index
 */
export async function crawlGreenhouseCommonCrawl(options: {
    crawlId?: string;
    deadline: number;
    hosts?: string[];
}): Promise<Set<string>> {
    const crawlId = options.crawlId ?? (await fetchLatestCrawlId());
    const indexUrl = `https://index.commoncrawl.org/${crawlId}-index`;
    const hosts = options.hosts ?? Array.from(GREENHOUSE_HOSTS);
    const tokens = new Set<string>();

    console.log(`🌐 Crawling Common Crawl (${crawlId}) for Greenhouse hosts...`);

    const onUrl = (url: string) => {
        const token = extractGreenhouseToken(url);
        if (token) {
            tokens.add(token);
        }
    };

    for (const host of hosts) {
        if (Date.now() >= options.deadline) break;

        // Try showNumPages first
        let numPages: number | null = null;
        try {
            const resp = await fetchWithRetry(() =>
                axios.get<{ pages: number } | string>(indexUrl, {
                    params: {
                        url: `${host}/*`,
                        showNumPages: true,
                        output: 'json',
                    },
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScraperBot/1.0)' },
                })
            );
            if (resp && typeof resp.data === 'object' && typeof resp.data.pages === 'number') {
                numPages = resp.data.pages;
            } else if (resp && typeof resp.data === 'string') {
                const match = resp.data.match(/"pages":\s*(\d+)/) || resp.data.match(/pages:\s*(\d+)/);
                if (match) numPages = parseInt(match[1], 10);
            }
        } catch {
            numPages = null;
        }

        if (numPages !== null && numPages > 0) {
            for (let page = 0; page < numPages; page++) {
                if (Date.now() >= options.deadline) break;
                await fetchCommonCrawlPage(indexUrl, `${host}/*`, page, onUrl);
            }
        } else {
            // Narrower prefixes fallback on 504 / timeout: a-z, 0-9
            const prefixes = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
            for (const prefix of prefixes) {
                if (Date.now() >= options.deadline) break;
                for (let page = 0; page < 5; page++) {
                    if (Date.now() >= options.deadline) break;
                    const count = await fetchCommonCrawlPage(indexUrl, `${host}/${prefix}*`, page, onUrl);
                    if (count === 0) break;
                }
            }
        }
    }

    return tokens;
}

/**
 * Fetches a single page of JSONL lines from Common Crawl index
 */
async function fetchCommonCrawlPage(
    indexUrl: string,
    urlPattern: string,
    page: number,
    onUrl: (url: string) => void
): Promise<number> {
    const resp = await fetchWithRetry(() =>
        axios.get<string>(indexUrl, {
            params: {
                url: urlPattern,
                output: 'json',
                fl: 'url',
                page,
            },
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScraperBot/1.0)' },
        })
    );

    if (!resp || typeof resp.data !== 'string') return 0;
    const lines = resp.data.split('\n');
    let count = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed) as { url?: string };
            if (parsed.url) {
                onUrl(parsed.url);
                count++;
            }
        } catch {
            // ignore JSON parse error
        }
    }
    return count;
}

export interface DiscoverySummary {
    source: 'ashby' | 'greenhouse';
    tokensFound: number;
    alreadyKnown: number;
    validated: number;
    inserted: number;
    skippedByBudget: number;
}

export interface DiscoveryOptions {
    source?: 'ashby' | 'greenhouse';
    includeCommonCrawl?: boolean;
    enrichMetadata?: boolean;
    tokenBudget?: number;
    timeBudgetMs?: number;
    crawlId?: string;
    hosts?: string[];
    prismaClient?: PrismaClient;
}

/**
 * @summary Validates candidate Greenhouse tokens with GET /v1/boards/{token} at <= 5 concurrent and upserts Company records
 */
export async function validateAndSeedGreenhouseTokens(
    tokens: string[],
    options: {
        deadline: number;
        enrichMetadata?: boolean;
        prismaClient?: PrismaClient;
    }
): Promise<{ validated: number; inserted: number; timedOutCount: number }> {
    const db = options.prismaClient ?? prisma;
    const ghClient = new GreenhouseClient();
    const limiter = createLimiter(5, { minConcurrency: 1, defaultCooldownMs: 2000 });

    let validated = 0;
    let inserted = 0;
    let timedOutCount = 0;

    // Queue every token on the limiter so up to 5 are validated at once (a 429 slows all of them down)
    const work = tokens.map((token) =>
        limiter(async () => {
            if (Date.now() >= options.deadline) {
                timedOutCount++;
                return;
            }

            validated++;
            const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`;
            try {
                const response = await axios.get<{ name?: string | null }>(apiUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScraperBot/1.0)' },
                });

                if (response.status === 200) {
                    const companyName = response.data?.name?.trim() || token;
                    const slug = `gh--${token}`;

                    await db.company.upsert({
                        where: {
                            source_atsToken: {
                                source: 'GREENHOUSE',
                                atsToken: token,
                            },
                        },
                        create: {
                            slug,
                            source: 'GREENHOUSE',
                            atsToken: token,
                            name: companyName,
                            status: 'ACTIVE',
                        },
                        update: {
                            name: companyName,
                            status: 'ACTIVE',
                        },
                    });

                    inserted++;

                    if (options.enrichMetadata) {
                        try {
                            const ref: BoardRef = { slug, source: 'greenhouse', atsToken: token };
                            const meta = await ghClient.fetchCompanyMetadata(ref);
                            if (meta.status === 'ok') {
                                await db.company.update({
                                    where: { slug },
                                    data: {
                                        lastEnrichedAt: new Date(),
                                        ...(meta.logoUrl ? { logoUrl: meta.logoUrl } : {}),
                                    },
                                });
                            }
                        } catch {
                            // Non-fatal logo enrichment error
                        }
                    }

                    limiter.onSuccess();
                }
            } catch (err: unknown) {
                const status = (err as { response?: { status?: number; headers?: Record<string, string> } })?.response?.status;
                if (status === 429) {
                    const retryHeader = (err as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after'];
                    const retrySec = retryHeader ? parseInt(retryHeader, 10) : 5;
                    limiter.onRateLimit(retrySec * 1000);
                }
                // 404 is dropped (valid = false)
            }
        })
    );
    await Promise.all(work);

    return { validated, inserted, timedOutCount };
}

/**
 * @summary Parses --budget=N (a positive whole number) or --budget=all (no cap) into a token budget
 */
export function parseTokenBudget(raw: string): number {
    const value = raw.trim().toLowerCase();
    if (value === 'all') return Number.MAX_SAFE_INTEGER;
    if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error(`Invalid --budget="${raw}": use a positive whole number or "all"`);
    }
    return Number(value);
}

/**
 * @summary Parses --time-budget-min=N (1 to 120 whole minutes) into milliseconds
 */
export function parseTimeBudgetMs(raw: string): number {
    const value = raw.trim();
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 120) {
        throw new Error(`Invalid --time-budget-min="${raw}": use a whole number of minutes from 1 to 120`);
    }
    return Number(value) * 60 * 1000;
}

/**
 * @summary Main discovery function. Discovers company tokens for Ashby or Greenhouse and upserts to DB.
 */
export async function runDiscovery(options: DiscoveryOptions = {}): Promise<DiscoverySummary | void> {
    const sourceArg = process.argv.find(a => a.startsWith('--source='));
    const source = options.source ?? (sourceArg ? sourceArg.split('=')[1].toLowerCase() as 'ashby' | 'greenhouse' : 'ashby');
    const db = options.prismaClient ?? prisma;

    if (source === 'greenhouse') {
        const startTime = Date.now();
        const timeBudgetMs = options.timeBudgetMs ?? 20 * 60 * 1000; // 20 minutes default
        const deadline = startTime + timeBudgetMs;
        const tokenBudget = options.tokenBudget ?? 500;

        console.log(`🚀 Starting Greenhouse Discovery (token budget: ${tokenBudget}, time budget: ${timeBudgetMs / 1000}s)...`);

        const discoveredTokensSet = await crawlGreenhouseCommonCrawl({
            crawlId: options.crawlId,
            deadline,
            hosts: options.hosts,
        });

        const allDiscoveredTokens = Array.from(discoveredTokensSet);
        console.log(`🔍 Found ${allDiscoveredTokens.length} unique Greenhouse tokens from crawl.`);

        // Filter tokens not already in DB
        const existingCompanies = await db.company.findMany({
            where: { source: 'GREENHOUSE' },
            select: { atsToken: true },
        });
        const knownTokens = new Set(existingCompanies.map(c => c.atsToken?.toLowerCase()).filter(Boolean));

        const candidates = allDiscoveredTokens.filter(t => !knownTokens.has(t));
        const alreadyKnown = allDiscoveredTokens.length - candidates.length;

        console.log(`📋 Existing Greenhouse boards in DB: ${knownTokens.size} | New candidate tokens: ${candidates.length}`);

        // Cap at budget
        const toValidate = candidates.slice(0, tokenBudget);
        let skippedByBudget = candidates.length - toValidate.length;

        const { validated, inserted, timedOutCount } = await validateAndSeedGreenhouseTokens(toValidate, {
            deadline,
            enrichMetadata: options.enrichMetadata,
            prismaClient: db,
        });

        skippedByBudget += timedOutCount;

        const summary: DiscoverySummary = {
            source: 'greenhouse',
            tokensFound: allDiscoveredTokens.length,
            alreadyKnown,
            validated,
            inserted,
            skippedByBudget,
        };

        console.log('\n════════════════════════════════════════════════════════════');
        console.log('              GREENHOUSE DISCOVERY SUMMARY                  ');
        console.log('════════════════════════════════════════════════════════════');
        console.log(`  • Tokens found in crawl      : ${summary.tokensFound}`);
        console.log(`  • Already known in DB        : ${summary.alreadyKnown}`);
        console.log(`  • Tokens validated (API)     : ${summary.validated}`);
        console.log(`  • Companies inserted/updated : ${summary.inserted}`);
        console.log(`  • Skipped by budget/time     : ${summary.skippedByBudget}`);
        console.log('════════════════════════════════════════════════════════════\n');

        if (process.env.GITHUB_STEP_SUMMARY) {
            try {
                const md = [
                    '### Greenhouse Discovery Summary',
                    `- **Tokens found in crawl**: ${summary.tokensFound}`,
                    `- **Already known in DB**: ${summary.alreadyKnown}`,
                    `- **Tokens validated**: ${summary.validated}`,
                    `- **Companies inserted/updated**: ${summary.inserted}`,
                    `- **Skipped by budget/time**: ${summary.skippedByBudget}`,
                ].join('\n');
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
            } catch {
                // Ignore step summary write error
            }
        }

        return summary;
    }

    // Default: Ashby discovery (unchanged behaviour)
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
        if (!isValidSlug(slug) || slug.includes('--')) {
            continue;
        }
        try {
            await db.company.upsert({
                where: { slug: slug },
                update: {}, // No update if exists
                create: {
                    slug: slug,
                    name: slug, // Placeholder, can be updated by scraper
                    source: 'ASHBY' as const,
                    atsToken: slug,
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
    const sourceArg = process.argv.find(a => a.startsWith('--source='));
    const source = sourceArg ? (sourceArg.split('=')[1].toLowerCase() as 'ashby' | 'greenhouse') : undefined;

    let tokenBudget: number | undefined;
    let timeBudgetMs: number | undefined;
    try {
        const budgetArg = process.argv.find(a => a.startsWith('--budget='));
        if (budgetArg) tokenBudget = parseTokenBudget(budgetArg.split('=')[1]);
        const timeArg = process.argv.find(a => a.startsWith('--time-budget-min='));
        if (timeArg) timeBudgetMs = parseTimeBudgetMs(timeArg.split('=')[1]);
    } catch (e: unknown) {
        console.error(`❌ ${(e as Error).message}`);
        process.exit(1);
    }

    runDiscovery({ source, includeCommonCrawl, enrichMetadata, tokenBudget, timeBudgetMs })
        .then(async () => {
            await prisma.$disconnect();
        })
        .catch(async (e: unknown) => {
            console.error(e);
            await prisma.$disconnect();
            process.exit(1);
        });
}
