/**
 * @file Job Last-Updated Resolution Helper
 * @summary Determines lastUpdatedAt timestamp and lastUpdatedSource according to scrape change detection rules
 * @tags Scraper, Timestamp, Freshness, LastUpdated
 */

export type LastUpdatedSource = 'ashby' | 'detected' | 'published' | 'firstSeen';

export interface PrevJobState {
    active: boolean;
    contentHash: string;
    lastUpdatedAt?: Date | string | null;
    lastUpdatedSource?: string | null;
}

export interface NextJobInput {
    contentHash?: string;
    updatedAt?: Date | string | null;
    publishedAt?: Date | string | null;
    active?: boolean;
    isRawTouch?: boolean;
}

export interface LastUpdatedResolution {
    lastUpdatedAt: Date | null;
    lastUpdatedSource: LastUpdatedSource | null;
}

/**
 * Safely parses any date representation, returning null for invalid or unparseable values.
 * @param d Input date object, string, number, or null/undefined
 * @returns Valid Date instance or null
 */
function parseValidDate(d: unknown): Date | null {
    if (!d) return null;
    if (d instanceof Date) {
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof d === 'string' || typeof d === 'number') {
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

/**
 * Resolves the lastUpdatedAt timestamp and provenance source for a job posting.
 *
 * Rules:
 * 1. NEW job (!prev):
 *    - Ashby update time present and valid -> Ashby time, source 'ashby'
 *    - else publishedAt present and valid -> publishedAt, source 'published'
 *    - else -> now (scrape time), source 'firstSeen'
 * 2. EXISTING job whose contentHash changed (prev.contentHash !== next.contentHash):
 *    - Ashby update time present and valid -> Ashby time, source 'ashby'
 *    - else -> now (scrape time), source 'detected'
 * 3. EXISTING job with unchanged contentHash but re-activated (!prev.active):
 *    - Keep stored lastUpdatedAt; if stored is null, initialise per rule 1
 * 4. Raw touches (isRawTouch) and unchanged active rows:
 *    - Never change lastUpdatedAt or lastUpdatedSource
 * 5. Monotonicity:
 *    - Never move lastUpdatedAt backwards: final = max(stored, computed) when stored exists
 *
 * @param prev Existing job record from database, or null/undefined for new jobs
 * @param next Scraped job data to be stored
 * @param now Reference timestamp representing current scrape time (defaults to new Date())
 * @returns Resolved timestamp and provenance source
 */
export function resolveLastUpdated(
    prev: PrevJobState | null | undefined,
    next: NextJobInput,
    now: Date = new Date()
): LastUpdatedResolution {
    // Rule 1: NEW job
    if (!prev) {
        const ashbyDate = parseValidDate(next.updatedAt);
        if (ashbyDate) {
            return { lastUpdatedAt: ashbyDate, lastUpdatedSource: 'ashby' };
        }
        const publishedDate = parseValidDate(next.publishedAt);
        if (publishedDate) {
            return { lastUpdatedAt: publishedDate, lastUpdatedSource: 'published' };
        }
        return { lastUpdatedAt: now, lastUpdatedSource: 'firstSeen' };
    }

    const storedDate = parseValidDate(prev.lastUpdatedAt);
    const storedSource = (prev.lastUpdatedSource as LastUpdatedSource) ?? null;

    // Rule 4: Raw touch
    if (next.isRawTouch) {
        return { lastUpdatedAt: storedDate, lastUpdatedSource: storedSource };
    }

    const hashChanged = next.contentHash ? prev.contentHash !== next.contentHash : false;

    // Rule 3: Hash unchanged but re-activated
    if (!hashChanged && !prev.active && (next.active ?? true)) {
        if (storedDate) {
            return {
                lastUpdatedAt: storedDate,
                lastUpdatedSource: storedSource ?? (parseValidDate(next.publishedAt) ? 'published' : 'firstSeen'),
            };
        }
        // If stored is null, initialise per rule 1
        return resolveLastUpdated(null, next, now);
    }

    // Rule 4: Unchanged active rows
    if (!hashChanged) {
        return { lastUpdatedAt: storedDate, lastUpdatedSource: storedSource };
    }

    // Rule 2: Content hash changed
    let computedDate: Date;
    let computedSource: LastUpdatedSource;

    const ashbyDate = parseValidDate(next.updatedAt);
    if (ashbyDate) {
        computedDate = ashbyDate;
        computedSource = 'ashby';
    } else {
        computedDate = now;
        computedSource = 'detected';
    }

    // Rule 5: Never move lastUpdatedAt backwards
    if (storedDate && storedDate.getTime() > computedDate.getTime()) {
        return {
            lastUpdatedAt: storedDate,
            lastUpdatedSource: storedSource ?? computedSource,
        };
    }

    return {
        lastUpdatedAt: computedDate,
        lastUpdatedSource: computedSource,
    };
}
