/**
 * @file sanitize.ts
 * @summary DOMPurify sanitization utility with strict security hooks (rel/target enforcement and style stripping)
 */

import DOMPurify from 'dompurify';

// Configure DOMPurify hook to enforce secure link targets and rel attributes
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow ugc');
  }
});

/**
 * @summary Sanitizes HTML strings for safe injection into the DOM
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  return DOMPurify.sanitize(rawHtml, {
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}

export default sanitizeHtml;
