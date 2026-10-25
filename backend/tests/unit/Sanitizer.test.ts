/**
 * @file Sanitizer & Validator Unit Tests
 * @summary Unit test suite for job description HTML/plain sanitization, URL validation, JSONB null-byte stripping, and malformed job filtering
 * @tags Unit Test, Sanitization, Validation, URL, HTML, JSONB
 */

import {
    sanitizeText,
    sanitizeJobDescriptionHtml,
    sanitizeJobDescriptionPlain,
    sanitizeJobUrl,
    sanitizePublishedDate,
    sanitizeJsonMetadata,
    validateAndSanitizeJob,
    sanitizeJobBatch
} from '../../src/lib/Sanitizer';

describe('Sanitizer & Validator Unit Tests', () => {
    describe('sanitizeText', () => {
        it('should strip null bytes, control chars, decode HTML entities, and collapse whitespace', () => {
            expect(sanitizeText('  Senior\u0000  Software &amp; Cloud\n\tEngineer  ')).toBe(
                'Senior Software & Cloud Engineer'
            );
            expect(sanitizeText('Role &quot;Lead&quot; &#39;A&#39;&nbsp;Team')).toBe(
                'Role "Lead" \'A\' Team'
            );
            expect(sanitizeText(null)).toBe('');
        });

        it('should strip lone UTF-16 surrogates without affecting valid emoji pairs', () => {
            // \uD800 without low surrogate and \uDC00 without high surrogate
            expect(sanitizeText('Lead \uD800 Engineer \uDC00')).toBe('Lead Engineer');
            // Valid surrogate pair (rocket emoji 🚀 is \uD83D\uDE80)
            expect(sanitizeText('Rocket \uD83D\uDE80 Engineer')).toBe('Rocket 🚀 Engineer');
        });
    });

    describe('sanitizeJobDescriptionHtml', () => {
        it('should strip script, style, iframe tags, inline event handlers, null bytes, and huge base64 strings', () => {
            const bigBase64 = 'A'.repeat(1200);
            const dirtyHtml = `
                <p onclick="alert(1)">Hello\u0000 World</p>
                <script>evil()</script>
                <style>body { display:none }</style>
                <iframe src="https://evil.com"></iframe>
                <a href="javascript:alert(2)">Apply</a>
                <img src="data:image/png;base64,${bigBase64}" />
            `;
            const clean = sanitizeJobDescriptionHtml(dirtyHtml);
            expect(clean).toContain('<p>Hello World</p>');
            expect(clean).not.toContain('<script>');
            expect(clean).not.toContain('<style>');
            expect(clean).not.toContain('<iframe');
            expect(clean).not.toContain('onclick');
            expect(clean).not.toContain('javascript:');
            expect(clean).not.toContain('\u0000');
            expect(clean).toContain('data:removed;base64,');
        });
    });

    describe('sanitizeJobDescriptionPlain', () => {
        it('should fallback to stripping HTML when plain text is missing and remove null bytes', () => {
            const html = '<p>We are hiring\u0000</p><ul><li>Backend</li><li>Frontend</li></ul>';
            const plain = sanitizeJobDescriptionPlain('', html);
            expect(plain).toContain('We are hiring');
            expect(plain).toContain('Backend');
            expect(plain).not.toContain('<p>');
            expect(plain).not.toContain('\u0000');
        });
    });

    describe('sanitizeJobUrl', () => {
        it('should keep valid https URLs and resolve relative paths against jobs.ashbyhq.com', () => {
            expect(
                sanitizeJobUrl('https://jobs.ashbyhq.com/1password/abc-123/application', '1password', 'abc-123', true)
            ).toBe('https://jobs.ashbyhq.com/1password/abc-123/application');

            expect(sanitizeJobUrl('/1password/abc-123', '1password', 'abc-123', false)).toBe(
                'https://jobs.ashbyhq.com/1password/abc-123'
            );
        });

        it('should fallback to canonical Ashby URL and record issue when URL is missing, unsafe, or malformed', () => {
            const reasons: string[] = [];
            const fallback1 = sanitizeJobUrl('javascript:alert(1)', 'deel', 'job-99', true, r =>
                reasons.push(r)
            );
            const fallback2 = sanitizeJobUrl('http://[invalid-url', 'deel', 'job-99', false, r =>
                reasons.push(r)
            );
            const fallback3 = sanitizeJobUrl('', 'deel', 'job-99', false, r => reasons.push(r));

            expect(fallback1).toBe('https://jobs.ashbyhq.com/deel/job-99/application');
            expect(fallback2).toBe('https://jobs.ashbyhq.com/deel/job-99');
            expect(fallback3).toBe('https://jobs.ashbyhq.com/deel/job-99');
            expect(reasons).toHaveLength(3);
        });
    });

    describe('sanitizePublishedDate', () => {
        it('should extract valid YYYY-MM-DD and reject invalid dates', () => {
            expect(sanitizePublishedDate('2026-03-15T12:30:00.000Z')).toBe('2026-03-15');
            expect(sanitizePublishedDate('not-a-date')).toBeUndefined();
            expect(sanitizePublishedDate(null)).toBeUndefined();
        });
    });

    describe('sanitizeJsonMetadata', () => {
        it('should recursively strip null bytes and sanitize nested descriptionHtml/descriptionPlain', () => {
            const raw = {
                id: 'job-1',
                nested: { text: 'bad\u0000byte' },
                descriptionHtml: '<p>Hi</p><script>bad()</script>',
                descriptionPlain: ''
            };
            const sanitized = sanitizeJsonMetadata(raw);
            expect(sanitized.nested.text).toBe('badbyte');
            expect(sanitized.descriptionHtml).toBe('<p>Hi</p>');
            expect(sanitized.descriptionPlain).toBe('Hi');
        });
    });

    describe('validateAndSanitizeJob & sanitizeJobBatch', () => {
        it('should filter out malformed jobs (missing id/title, placeholder id, duplicates) and sanitize valid ones', () => {
            const batch = [
                null,
                { id: 'undefined', title: 'Bad ID' },
                { id: 'id with spaces', title: 'Bad ID 2' },
                { id: 'valid-1', title: '   ' },
                {
                    id: 'valid-2',
                    title: 'Staff &amp; Principal\u0000 Engineer',
                    department: 'Engineering\nCore',
                    location: 'Remote',
                    jobUrl: 'javascript:void(0)',
                    applyUrl: '',
                    descriptionHtml: '<p>Role overview</p><script>xss()</script>'
                },
                {
                    id: 'valid-2',
                    title: 'Duplicate ID should be filtered'
                }
            ];

            const { validJobs, issues } = sanitizeJobBatch(batch, '1password');

            expect(validJobs).toHaveLength(1);
            expect(validJobs[0].id).toBe('valid-2');
            expect(validJobs[0].title).toBe('Staff & Principal Engineer');
            expect(validJobs[0].department).toBe('Engineering Core');
            expect(validJobs[0].jobUrl).toBe('https://jobs.ashbyhq.com/1password/valid-2');
            expect(validJobs[0].applyUrl).toBe('https://jobs.ashbyhq.com/1password/valid-2/application');
            expect((validJobs[0] as any).descriptionHtml).toBe('<p>Role overview</p>');

            // 5 filtered items + 2 sanitized URLs = 7 recorded issues
            expect(issues.filter(i => i.action === 'filtered')).toHaveLength(5);
            expect(issues.filter(i => i.action === 'sanitized')).toHaveLength(2);
        });
    });
});
