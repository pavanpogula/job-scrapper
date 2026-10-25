/**
 * @file sanitize.test.ts
 * @summary Unit test validating DOMPurify sanitization rules, link attribute injection, and script stripping.
 * @tags sanitize, dompurify, security, xss
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../lib/sanitize';

describe('P5-T07: DOMPurify Sanitization & Invariants', () => {
  it('strips script tags and dangerous event handlers', () => {
    const dirty = '<p>Hello</p><script>alert("XSS")</script><img src="x" onerror="alert(1)" />';
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('<p>Hello</p>');
  });

  it('strips inline style attributes', () => {
    const dirty = '<div style="color: red; position: fixed;">Text</div>';
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain('style=');
    expect(clean).toContain('Text');
  });

  it('enforces target="_blank" and rel="noopener noreferrer nofollow ugc" on anchors', () => {
    const dirty = '<a href="https://example.com/apply">Apply Now</a>';
    const clean = sanitizeHtml(dirty);

    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer nofollow ugc"');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });
});
