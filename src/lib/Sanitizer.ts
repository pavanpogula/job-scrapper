/**
 * @file Job Data Sanitizer & Validator
 * @summary Sanitizes and validates job descriptions, apply/job URLs, and raw JSON metadata; filters malformed job objects and logs issues
 * @tags Sanitization, Validation, URL, HTML, JSONB, Filtering, Error Logging
 */

import { AshbyJob } from './AshbyClient';

export interface ValidationIssue {
    companySlug: string;
    jobId: string;
    field: string;
    reason: string;
    action: 'filtered' | 'sanitized';
}

export interface SanitizeBatchResult {
    validJobs: AshbyJob[];
    issues: ValidationIssue[];
}

// Rejects job IDs that are obvious placeholders, path traversal, or HTML fragments
const INVALID_ID_VALUES = new Set(['null', 'undefined', 'nan', 'true', 'false', '[object object]']);
const INVALID_ID_CHARS_REGEX = /[\s<>'"\\?#]/;

// Matches null bytes, lone UTF-16 surrogates, and non-printable ASCII control chars
// eslint-disable-next-line no-control-regex
const CONTROL_AND_NULL_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
// eslint-disable-next-line no-control-regex
const NULL_AND_SURROGATE_REGEX = /\x00|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
};

/**
 * @summary Decodes common HTML entities in single-line text fields (title, location, department)
 */
export function decodeHtmlEntities(input: string): string {
    return input.replace(/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/gi, match => {
        const lower = match.toLowerCase();
        return HTML_ENTITIES[lower] ?? match;
    });
}

/**
 * @summary Sanitizes single-line text fields (title, department, location) by removing null/control chars, decoding entities, and normalizing whitespace
 */
export function sanitizeText(value: unknown): string {
    if (typeof value !== 'string') return '';
    const cleaned = decodeHtmlEntities(value.replace(CONTROL_AND_NULL_REGEX, ' '));
    return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * @summary Sanitizes HTML job descriptions by stripping null bytes, script/style/iframe tags, inline JS handlers, and oversized base64 data URIs
 */
export function sanitizeJobDescriptionHtml(html: unknown): string {
    if (typeof html !== 'string' || !html) return '';

    return html
        .replace(NULL_AND_SURROGATE_REGEX, '')
        // Remove <script>, <style>, <iframe>, <object>, <embed> blocks
        .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '')
        // Remove inline event handlers like onclick="..." or onload='...'
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        // Neutralize javascript: and vbscript: href/src attributes
        .replace(/(href|src)\s*=\s*["']?\s*(javascript|vbscript):[^"'\s>]*/gi, '$1="#"')
        // Strip huge inline base64 data URIs (>1KB) that bloat PostgreSQL JSONB storage
        .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{1024,}/g, 'data:removed;base64,')
        .trim();
}

/**
 * @summary Sanitizes plain-text job descriptions, falling back to tag-stripped HTML when plain text is missing
 */
export function sanitizeJobDescriptionPlain(plain: unknown, fallbackHtml?: unknown): string {
    let source = typeof plain === 'string' && plain.trim().length > 0 ? plain : '';

    if (!source && typeof fallbackHtml === 'string' && fallbackHtml.trim().length > 0) {
        const cleanHtml = sanitizeJobDescriptionHtml(fallbackHtml);
        source = cleanHtml
            .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, ' ');
    }

    if (!source) return '';

    return decodeHtmlEntities(source.replace(NULL_AND_SURROGATE_REGEX, ''))
        // eslint-disable-next-line no-control-regex
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * @summary Validates and normalizes Ashby job/apply URLs, falling back to canonical Ashby URL if malformed or missing
 */
export function sanitizeJobUrl(
    rawUrl: unknown,
    companySlug: string,
    jobId: string,
    isApplyUrl = false,
    onIssue?: (reason: string) => void
): string {
    const cleanSlug = encodeURIComponent(companySlug.trim());
    const cleanJobId = encodeURIComponent(jobId.trim());
    const canonicalFallback = `https://jobs.ashbyhq.com/${cleanSlug}/${cleanJobId}${isApplyUrl ? '/application' : ''}`;

    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        onIssue?.('Missing URL; replaced with canonical Ashby URL');
        return canonicalFallback;
    }

    const trimmed = rawUrl.replace(CONTROL_AND_NULL_REGEX, '').trim();
    if (
        INVALID_ID_VALUES.has(trimmed.toLowerCase()) ||
        /^(javascript|data|vbscript|file|mailto):/i.test(trimmed)
    ) {
        onIssue?.(`Unsafe or placeholder URL "${trimmed.slice(0, 40)}"; replaced with canonical Ashby URL`);
        return canonicalFallback;
    }

    try {
        // Support relative paths returned by custom boards
        const parsed = trimmed.startsWith('/')
            ? new URL(trimmed, 'https://jobs.ashbyhq.com')
            : new URL(trimmed);

        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            onIssue?.(`Invalid URL protocol "${parsed.protocol}"; replaced with canonical Ashby URL`);
            return canonicalFallback;
        }

        return parsed.toString();
    } catch {
        onIssue?.(`Malformed URL "${trimmed.slice(0, 60)}"; replaced with canonical Ashby URL`);
        return canonicalFallback;
    }
}

/**
 * @summary Normalizes ISO-8601 publishedAt date string to YYYY-MM-DD (or undefined if invalid)
 */
export function sanitizePublishedDate(rawDate: unknown): string | undefined {
    if (typeof rawDate !== 'string' || !rawDate.trim()) return undefined;
    const match = rawDate.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return undefined;
    const dateStr = match[1];
    const parsed = Date.parse(dateStr);
    if (Number.isNaN(parsed)) return undefined;
    return dateStr;
}

/**
 * @summary Recursively sanitizes a JSON metadata object so PostgreSQL JSONB never fails on null bytes or invalid surrogates
 */
export function sanitizeJsonMetadata(value: any): any {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
        return value.replace(NULL_AND_SURROGATE_REGEX, '');
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitizeJsonMetadata(item));
    }

    if (typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
            if (val === undefined || typeof val === 'function' || typeof val === 'symbol') {
                continue;
            }
            const cleanKey = key.replace(NULL_AND_SURROGATE_REGEX, '');
            if (cleanKey === 'descriptionHtml') {
                result[cleanKey] = sanitizeJobDescriptionHtml(val);
            } else if (cleanKey === 'descriptionPlain') {
                result[cleanKey] = sanitizeJobDescriptionPlain(val, (value as any).descriptionHtml);
            } else {
                result[cleanKey] = sanitizeJsonMetadata(val);
            }
        }
        return result;
    }

    return null;
}

/**
 * @summary Validates and sanitizes a single raw AshbyJob object, returning null if unrecoverably malformed
 */
export function validateAndSanitizeJob(
    rawJob: any,
    companySlug: string,
    issues: ValidationIssue[] = []
): AshbyJob | null {
    if (!rawJob || typeof rawJob !== 'object') {
        issues.push({
            companySlug,
            jobId: 'unknown',
            field: 'job',
            reason: 'Job entry is null or not an object',
            action: 'filtered'
        });
        return null;
    }

    // 1. Validate job.id
    const rawId = typeof rawJob.id === 'string' ? rawJob.id.trim() : String(rawJob.id ?? '').trim();
    if (
        !rawId ||
        rawId.length > 128 ||
        INVALID_ID_VALUES.has(rawId.toLowerCase()) ||
        INVALID_ID_CHARS_REGEX.test(rawId)
    ) {
        issues.push({
            companySlug,
            jobId: rawId || 'missing',
            field: 'id',
            reason: `Invalid or missing job id "${rawId.slice(0, 40)}"`,
            action: 'filtered'
        });
        return null;
    }

    // 2. Validate & sanitize job.title
    const cleanTitle = sanitizeText(rawJob.title);
    if (!cleanTitle || INVALID_ID_VALUES.has(cleanTitle.toLowerCase())) {
        issues.push({
            companySlug,
            jobId: rawId,
            field: 'title',
            reason: 'Job title is empty or placeholder after sanitization',
            action: 'filtered'
        });
        return null;
    }

    // 3. Sanitize department, location, employmentType
    const cleanDepartment = sanitizeText(rawJob.department);
    const cleanLocation = sanitizeText(rawJob.location);
    const cleanEmploymentType = sanitizeText(rawJob.employmentType);

    // 4. Sanitize jobUrl and applyUrl
    const cleanJobUrl = sanitizeJobUrl(rawJob.jobUrl, companySlug, rawId, false, reason => {
        issues.push({
            companySlug,
            jobId: rawId,
            field: 'jobUrl',
            reason,
            action: 'sanitized'
        });
    });

    const cleanApplyUrl = sanitizeJobUrl(rawJob.applyUrl, companySlug, rawId, true, reason => {
        issues.push({
            companySlug,
            jobId: rawId,
            field: 'applyUrl',
            reason,
            action: 'sanitized'
        });
    });

    // 5. Sanitize descriptions if present on rawJob
    const sanitizedMetadata = sanitizeJsonMetadata({
        ...rawJob,
        id: rawId,
        title: cleanTitle,
        department: cleanDepartment,
        location: cleanLocation,
        employmentType: cleanEmploymentType,
        jobUrl: cleanJobUrl,
        applyUrl: cleanApplyUrl
    });

    return {
        ...sanitizedMetadata,
        id: rawId,
        title: cleanTitle,
        department: cleanDepartment,
        location: cleanLocation,
        employmentType: cleanEmploymentType,
        jobUrl: cleanJobUrl,
        applyUrl: cleanApplyUrl,
        isRemote: Boolean(rawJob.isRemote) || cleanLocation.toLowerCase().includes('remote'),
        publishedAt: rawJob.publishedAt ?? undefined
    };
}

/**
 * @summary Validates and sanitizes an array of raw Ashby jobs, filtering out corrupt objects and collecting validation issues
 */
export function sanitizeJobBatch(rawJobs: any[], companySlug: string): SanitizeBatchResult {
    const validJobs: AshbyJob[] = [];
    const issues: ValidationIssue[] = [];

    if (!Array.isArray(rawJobs)) {
        issues.push({
            companySlug,
            jobId: 'batch',
            field: 'jobs',
            reason: 'Jobs payload is not an array',
            action: 'filtered'
        });
        return { validJobs, issues };
    }

    const seenIds = new Set<string>();

    for (const rawJob of rawJobs) {
        const rawId = rawJob && typeof rawJob === 'object' ? String(rawJob.id ?? '').trim() : '';
        if (rawId && seenIds.has(rawId)) {
            issues.push({
                companySlug,
                jobId: rawId,
                field: 'id',
                reason: 'Duplicate job ID in same company board response',
                action: 'filtered'
            });
            continue;
        }

        const sanitized = validateAndSanitizeJob(rawJob, companySlug, issues);
        if (!sanitized) continue;

        seenIds.add(sanitized.id);
        validJobs.push(sanitized);
    }

    return { validJobs, issues };
}
