/**
 * @file Pure ATS URL builders
 * @summary Builds canonical job, board, and application URLs without HTTP dependencies (safe for Vercel edge/API bundle)
 * @tags ATS, URLs, Builders, Routing, ADR-0021, ADR-0022
 */

import { AtsSource } from './source';

/**
 * @summary Formats and URI-encodes the ATS board token according to source case sensitivity rules
 */
function cleanBoardToken(source: AtsSource, token: string): string {
  const trimmed = (token ?? '').trim();
  return encodeURIComponent(source === 'lever' ? trimmed : trimmed.toLowerCase());
}

/**
 * @summary Builds the canonical public job posting URL for an ATS source and board token
 */
export function jobUrl(source: AtsSource, token: string, externalId: string): string {
  const cleanToken = cleanBoardToken(source, token);
  const cleanId = encodeURIComponent((externalId ?? '').trim());

  switch (source) {
    case 'ashby':
      return `https://jobs.ashbyhq.com/${cleanToken}/${cleanId}`;
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}/jobs/${cleanId}`;
    case 'lever':
      return `https://jobs.lever.co/${cleanToken}/${cleanId}`;
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unsupported ATS source: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * @summary Builds the canonical public job board URL for an ATS source and board token
 */
export function boardUrl(source: AtsSource, token: string): string {
  const cleanToken = cleanBoardToken(source, token);

  switch (source) {
    case 'ashby':
      return `https://jobs.ashbyhq.com/${cleanToken}`;
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}`;
    case 'lever':
      return `https://jobs.lever.co/${cleanToken}`;
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unsupported ATS source: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * @summary Builds the canonical direct application URL for an ATS source and board token
 */
export function applyUrl(source: AtsSource, token: string, externalId: string): string {
  const cleanToken = cleanBoardToken(source, token);
  const cleanId = encodeURIComponent((externalId ?? '').trim());

  switch (source) {
    case 'ashby':
      return `https://jobs.ashbyhq.com/${cleanToken}/${cleanId}/application`;
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${cleanToken}/jobs/${cleanId}`;
    case 'lever':
      return `https://jobs.lever.co/${cleanToken}/${cleanId}/apply`;
    default: {
      const exhaustiveCheck: never = source;
      throw new Error(`Unsupported ATS source: ${String(exhaustiveCheck)}`);
    }
  }
}
