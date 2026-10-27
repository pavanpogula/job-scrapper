/**
 * @file Job Search Tokenizer & Where Builder
 * @summary Turns user search text into tokens and a Prisma filter: every token must start a word in the title, company, department or location (BF-020)
 * @tags Search, Prisma, API, Jobs, BF-020
 */

import type { Prisma } from '@prisma/client';

/** Maximum characters of search text considered (longer input is cut). */
export const MAX_SEARCH_LENGTH = 100;
/** Maximum number of tokens; extra words are ignored. */
export const MAX_SEARCH_TOKENS = 8;
/** Maximum characters per token. */
export const MAX_TOKEN_LENGTH = 50;

/** Characters after which a token counts as starting a new word (the field start also counts). */
export const WORD_SEPARATORS = [' ', '-', '(', '/', ',', '&'] as const;

/** Characters stripped from both ends of each word; a trailing '.' is stripped too, inner ones are kept. */
const EDGE_PUNCTUATION = new Set(['"', "'", '“', '”', '‘', '’', '(', ')', '[', ']', '{', '}', '<', '>', ',', ';', ':', '!', '?']);

/**
 * @summary Splits search text into lowercase, de-duplicated tokens with edge punctuation removed
 * @param text Raw search text from the query string
 * @returns Up to MAX_SEARCH_TOKENS tokens; empty when nothing searchable remains
 */
export function tokenizeSearch(text: string | undefined | null): string[] {
  if (typeof text !== 'string') return [];
  const words = text.slice(0, MAX_SEARCH_LENGTH).trim().toLowerCase().split(/\s+/);
  const tokens: string[] = [];
  for (const word of words) {
    let start = 0;
    let end = word.length;
    while (start < end && EDGE_PUNCTUATION.has(word.charAt(start))) start++;
    while (end > start && (EDGE_PUNCTUATION.has(word.charAt(end - 1)) || word.charAt(end - 1) === '.')) end--;
    const token = word.slice(start, end).slice(0, MAX_TOKEN_LENGTH);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens.slice(0, MAX_SEARCH_TOKENS);
}

/**
 * @summary Canonical form of a search for cache keys: tokens sorted and space-joined, or '' when there are none
 * @param text Raw search text
 */
export function canonicalSearch(text: string | undefined | null): string {
  return [...tokenizeSearch(text)].sort().join(' ');
}

/**
 * @summary Escapes LIKE wildcards so `%`, `_` and `\` in user input match literally
 * @param token Search token
 */
export function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * @summary String-filter conditions that are true when the token starts a word in a text column
 * @param token Search token (already lowercase; matching is case-insensitive)
 */
function wordStartConditions(token: string): Prisma.StringFilter[] {
  const escaped = escapeLike(token);
  return [
    { startsWith: escaped, mode: 'insensitive' },
    ...WORD_SEPARATORS.map((sep): Prisma.StringFilter => ({ contains: `${sep}${escaped}`, mode: 'insensitive' })),
  ];
}

/**
 * @summary Builds the Prisma filter for a search: AND over tokens, each token OR'd across the four searchable fields
 * @param tokens Tokens from tokenizeSearch
 * @returns A JobWhereInput, or null when there is nothing to search
 */
export function buildSearchWhere(tokens: string[]): Prisma.JobWhereInput | null {
  if (tokens.length === 0) return null;
  return {
    AND: tokens.map((token): Prisma.JobWhereInput => {
      const conditions = wordStartConditions(token);
      return {
        OR: [
          { OR: conditions.map((c): Prisma.JobWhereInput => ({ title: c })) },
          { company: { OR: conditions.map((c): Prisma.CompanyWhereInput => ({ name: c })) } },
          { department: { OR: conditions.map((c): Prisma.DepartmentWhereInput => ({ name: c })) } },
          { location: { OR: conditions.map((c): Prisma.LocationWhereInput => ({ name: c })) } },
        ],
      };
    }),
  };
}
