/**
 * @file site.ts
 * @summary Site-wide facts shown in the UI (founder credit); edit here, not in components
 * @tags frontend, site, founder
 */

/** Founder credited in the footer and on the About page. */
export const FOUNDER = {
  name: 'Pavan Reddy Pogula',
  linkedinUrl: 'https://www.linkedin.com/in/pavan-reddy-pogula/',
  /** Self-hosted copy of the LinkedIn profile photo (frontend/public/founder.jpg); LinkedIn's own image links expire. */
  photoUrl: '/founder.jpg',
} as const;

/**
 * @summary Short display form of a LinkedIn profile URL, e.g. "linkedin.com/in/pavan-reddy-pogula"
 */
export function displayLinkedInUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
