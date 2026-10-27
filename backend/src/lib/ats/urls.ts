/**
 * @file Pure ATS URL builders
 * @summary Builds canonical job, board, and application URLs without HTTP dependencies (safe for Vercel edge/API bundle)
 * @tags ATS, URLs, Builders, Routing, ADR-0021
 */

import { AtsSource } from './source';

/**
 * @summary Builds the canonical public job posting URL for an ATS source and board token
 */
export function jobUrl(source: AtsSource, token: string, externalId: string): string {
  const cleanToken = encodeURIComponent((token ?? '').trim().toLowerCase());
  const cleanId = encodeURIComponent((externalId ?? '').trim());

  switch (source) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}/jobs/${cleanId}`;
    case 'ashby':
    default:
      return `https://jobs.ashbyhq.com/${cleanToken}/${cleanId}`;
  }
}

/**
 * @summary Builds the canonical public job board URL for an ATS source and board token
 */
export function boardUrl(source: AtsSource, token: string): string {
  const cleanToken = encodeURIComponent((token ?? '').trim().toLowerCase());

  switch (source) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}`;
    case 'ashby':
    default:
      return `https://jobs.ashbyhq.com/${cleanToken}`;
  }
}

/**
 * @summary Builds the canonical direct application URL for an ATS source and board token
 */
export function applyUrl(source: AtsSource, token: string, externalId: string): string {
  const cleanToken = encodeURIComponent((token ?? '').trim().toLowerCase());
  const cleanId = encodeURIComponent((externalId ?? '').trim());

  switch (source) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}/jobs/${cleanId}`;
    case 'ashby':
    default:
      return `https://jobs.ashbyhq.com/${cleanToken}/${cleanId}/application`;
  }
}
