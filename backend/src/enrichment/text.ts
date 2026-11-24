/**
 * @file Job Description Text & Hash Helpers
 * @summary Pure helpers to read normalized job description text from metadata and compute whitespace-normalized SHA-256 hashes
 * @tags enrichment, text, hash, sanitizer, job-attributes, BF-026
 */

import { createHash } from 'node:crypto';
import { sanitizeJobDescriptionPlain } from '../lib/Sanitizer';

/**
 * @summary Extracts plain description text from Job.metadata without double-decoding already-sanitized descriptionPlain
 */
export function getDescriptionText(metadata: unknown): string {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    return '';
  }

  const record = metadata as Record<string, unknown>;
  if (typeof record.descriptionPlain === 'string' && record.descriptionPlain.trim().length > 0) {
    return record.descriptionPlain;
  }

  if (typeof record.descriptionHtml === 'string' && record.descriptionHtml.trim().length > 0) {
    return sanitizeJobDescriptionPlain(undefined, record.descriptionHtml);
  }

  return '';
}

/**
 * @summary Computes a 64-char hex SHA-256 hash of whitespace-collapsed description text
 */
export function hashDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
