/**
 * @file JobAttributesText.test.ts
 * @summary Unit tests for description text extraction and whitespace-normalized SHA-256 hashing
 * @tags unit, enrichment, text, hash, job-attributes, BF-026
 */

import { getDescriptionText, hashDescription } from '../../src/enrichment/text';
import { sanitizeJobDescriptionPlain } from '../../src/lib/Sanitizer';

describe('description text and hash helpers', () => {
  it('returns metadata.descriptionPlain unchanged', () => {
    expect(getDescriptionText({ descriptionPlain: 'A &amp; B\nC' })).toBe('A &amp; B\nC');
  });

  it('falls back to plain text of descriptionHtml', () => {
    const html = '<p>5+ years</p><ul><li>Go</li></ul>';
    const result = getDescriptionText({ descriptionPlain: '', descriptionHtml: html });
    expect(result).toBe(sanitizeJobDescriptionPlain(undefined, html));
    expect(result).toContain('5+ years');
    expect(result).toMatch(/(?:\n| )Go/);
  });

  it('returns empty string for null, arrays, strings and missing fields', () => {
    expect(getDescriptionText(null)).toBe('');
    expect(getDescriptionText([])).toBe('');
    expect(getDescriptionText('x')).toBe('');
    expect(getDescriptionText({})).toBe('');
  });

  it('hash is 64 hex chars and ignores whitespace differences', () => {
    const h1 = hashDescription('a  b\n');
    const h2 = hashDescription('a b');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash changes when words change', () => {
    expect(hashDescription('5+ years')).not.toBe(hashDescription('6+ years'));
  });
});
