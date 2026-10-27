/**
 * @file Search Reference Matcher (test oracle)
 * @summary Independent plain-TypeScript statement of the BF-020 search rule, used to decide which seeded jobs must match
 * @tags tests, search, oracle, BF-020
 *
 * Deliberately does NOT import backend/src/lib/search.ts: if both were written from the same code, a shared bug
 * would make the tests pass. Keep this file small and obviously correct.
 */

/** Characters after which a token counts as starting a new word (the field start also counts). */
const WORD_SEPARATORS = [' ', '-', '(', '/', ',', '&'];

/** Characters stripped from both ends of every token; a trailing '.' is stripped too. */
const EDGE_PUNCTUATION = '"\'“”‘’()[]{}<>,;:!?';

export interface ReferenceJob {
  id: string;
  title: string;
  companyName: string | null;
  departmentName: string | null;
  locationName: string | null;
  active: boolean;
  isListed: boolean;
}

/**
 * @summary Splits user text into search tokens per the BF-020 rule
 */
export function referenceTokens(text: string): string[] {
  const words = text.slice(0, 100).trim().toLowerCase().split(/\s+/);
  const tokens: string[] = [];
  for (const word of words) {
    let start = 0;
    let end = word.length;
    while (start < end && EDGE_PUNCTUATION.includes(word.charAt(start))) start++;
    while (end > start && (EDGE_PUNCTUATION.includes(word.charAt(end - 1)) || word.charAt(end - 1) === '.')) end--;
    const token = word.slice(start, end).slice(0, 50);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens.slice(0, 8);
}

/**
 * @summary True when the token begins a word somewhere in the field (case-insensitive, literal characters)
 */
function startsAWord(field: string | null, token: string): boolean {
  if (!field) return false;
  const haystack = field.toLowerCase();
  for (let i = haystack.indexOf(token); i !== -1; i = haystack.indexOf(token, i + 1)) {
    if (i === 0 || WORD_SEPARATORS.includes(haystack.charAt(i - 1))) return true;
  }
  return false;
}

/**
 * @summary Ids of visible jobs matching the search text; every token must start a word in some searchable field
 */
export function referenceSearch(jobs: ReferenceJob[], text: string): string[] {
  const tokens = referenceTokens(text);
  return jobs
    .filter((job) => job.active && job.isListed)
    .filter((job) =>
      tokens.every((token) =>
        [job.title, job.companyName, job.departmentName, job.locationName].some((field) => startsAWord(field, token))
      )
    )
    .map((job) => job.id)
    .sort();
}
