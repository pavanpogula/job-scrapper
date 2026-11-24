/**
 * @file Years of Experience Rules Extractor
 * @summary Pure deterministic extractor for minimum required years of experience from job description text
 * @tags enrichment, rules, years, job-attributes, BF-026
 */

/** Result of extracting minimum required years of experience from a job description. */
export interface YearsResult {
  value: number | null;
  evidence: string | null;
  ambiguous: boolean;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};

const NUM_TOKEN = '(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)';
const CANDIDATE_SOURCE =
  `(?<![\\d,.$€£])\\b(${NUM_TOKEN})(?:\\s*\\(\\d{1,2}\\))?\\s*(?:\\+|plus)?\\s*(?:(?:-|to)\\s*(${NUM_TOKEN})\\s*\\+?\\s*)?(?:or more\\s+|or greater\\s+)?(?:years?|yrs?)\\b(?!-)`;

const POST_REJECT_RE = /^\s*(?:'s?\s*)?(?:in a row|ago|old|running|straight)\b/i;
const PRE_REJECT_RE = /\b(?:per|each|every|a)\b\s*$/i;

const REQ_HEADING_RE =
  /requirements|qualifications|what you(?:'ll| will)? (?:need|bring)|you (?:have|bring)|about you|must have|minimum|basic|who you are|what we(?:'re| are) looking for|what we look for|what we require|ideally you(?:'d| would) have/i;
const PREF_HEADING_RE =
  /preferred\s+(?:qualifications?|skills?|requirements?|experience|background)|^(?:strongly\s+|highly\s+)?preferred\s*:?$|nice to haves?|nice-to-haves?|would be nice to have|good-to-haves?|bonus\s*(?:points|qualifications?|skills?)?:?$|what will set you apart|desired\s+(?:qualifications?|skills?|experience|background)|\b(?:is a plus|added plus|pluses)\s*:?$/i;
const OTHER_HEADING_RE =
  /^(?:benefits|perks|about\s+(?:us|the company)|compensation|salary|pay(?:\s+range|\s+transparency)?)\b|\b(?:benefits|perks|about\s+(?:us|the company)|compensation|salary|pay range)\b/i;

const EXP_CUE_RE =
  /experience|exp\b|industry|professional|background|track record|working|hands-on|developing|designing|managing|leading|in (?:a|an)\b.*\brole/i;
const DEGREE_CUE_RE = /\b(?:BS|MS|B\.?S\.?|M\.?S\.?|bachelor'?s?|master'?s?|degree|PhD)\b/i;

const MONEY_LINE_RE =
  /[$€£]\s?\d|per (?:year|annum)|salary|compensation|pay range|bonus|equity|401k|pto|vacation|parental/i;
const BLURB_LINE_RE =
  /founded|\b(?:our|company|rich)\s+history\b|building on (?:more than )?\d|we(?:'ve| have)|our (?:company|team|customers)|has (?:been|provided|powered)|since \d{4}|anniversary/i;
const CANDIDATE_PRONOUN_RE = /\b(?:you|your|candidate|applicant)\b/i;

const INLINE_PREF_CUE_RE =
  /\b(?:prefer(?:red|ably)?|nice to have|bonus|optional|ideally|desired|advantage)\b|\ba plus\b/i;
const TRAIL_MODIFIER_RE =
  /,\s*(?:preferably|ideally)\s+(?:in|within|from|with|including|at|for)\b.*$|,\s*with\s+(?:a\s+)?(?:strong\s+)?prefer(?:ence|red)\b.*$|,\s*with\s+(?:a\s+)?(?:(?!years?\b)[^.;]){0,100}\bpreferred\b.*$/i;
const IN_LIEU_RE = /\bin lieu of (?:a )?(?:bachelor'?s?|college|4-year)?\s*degree\b/i;
const PRECEDED_BY_DEGREE_OR_RE =
  /\b(?:bachelor'?s?|master'?s?|bs|ms|ba|associate'?s?|high school diploma(?:\s+or\s+(?:equivalent|ged))?)\s*(?:degree)?\s*(?:in [^,.;\n]{1,60})?,?\s*(?:\bor\b|;)\s*$/i;
const BACHELOR_ANY_RE = /\b(?:bachelor'?s?|bs|b\.?s\.?|undergraduate)\b/i;
const AMBIGUOUS_LINE_RE = /not required|or equivalent experience in lieu|\bor\b.*\byears?\b.*\bor\b/i;
const LEVEL_LABEL_RE =
  /^(?:junior|mid|senior|staff|principal|lead|level|L\d|IC\d|P\d)\b[^:\n]{0,40}:/i;

const YEAR_WORD_RE = /\byears?\b/gi;
const EXP_WORD_RE = /\bexperience\b/gi;

const MAX_REASONABLE_YEARS = 30;
const MAX_EVIDENCE_CHARS = 160;

type SectionKind = 'neutral' | 'required' | 'preferred' | 'other';

interface Candidate {
  value: number;
  lineIndex: number;
  matchStart: number;
  matchEnd: number;
  preferred: boolean;
  normLine: string;
  rawLine: string;
}

/**
 * @summary Parses a digit string or English number word into its numeric value
 */
function parseNumToken(token: string): number {
  const lower = token.toLowerCase();
  if (lower in NUMBER_WORDS) {
    return NUMBER_WORDS[lower];
  }
  return Number.parseInt(lower, 10);
}

/**
 * @summary Normalizes dash variants, curly apostrophes, and NBSP with 1:1 character lengths
 */
function normalizeWorkingText(line: string): string {
  return line
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ');
}

/**
 * @summary Checks whether a candidate span sits inside a preferred-only sentence or clause
 */
function isInlinePreferred(normLine: string, matchStart: number, matchEnd: number): boolean {
  let sentStart = 0;
  for (let idx = matchStart - 1; idx >= 0; idx--) {
    const ch = normLine[idx];
    if ((ch === '.' || ch === '!' || ch === '?') && (idx + 1 >= normLine.length || /\s/.test(normLine[idx + 1]))) {
      sentStart = idx + 1;
      break;
    }
  }
  let sentEnd = normLine.length;
  for (let idx = matchEnd; idx < normLine.length; idx++) {
    const ch = normLine[idx];
    if ((ch === '.' || ch === '!' || ch === '?') && (idx + 1 >= normLine.length || /\s/.test(normLine[idx + 1]))) {
      sentEnd = idx;
      break;
    }
  }

  let sent = normLine.slice(sentStart, sentEnd);
  const relStart = matchStart - sentStart;
  const relEnd = matchEnd - sentStart;

  // Strip parenthetical asides that do not enclose the years match itself
  sent = sent.replace(/\([^()]*\)/g, (paren, offset: number) => {
    if (offset <= relStart && offset + paren.length >= relEnd) {
      return paren;
    }
    return ' ';
  });

  // Strip trailing subdomain/environment preference modifiers after the matched years phrase
  const head = sent.slice(0, Math.min(sent.length, relEnd));
  const tail = sent.slice(Math.min(sent.length, relEnd)).replace(TRAIL_MODIFIER_RE, '');
  return INLINE_PREF_CUE_RE.test(head + tail);
}

/**
 * @summary Returns true when a match belongs to an alternative/in-lieu degree clause rather than the base BS path
 */
function isAlternativeDegreeClause(normLine: string, matchStart: number, matchEnd: number): boolean {
  const sepRe = /;\s*|\s+\bor\b\s+|,\s*(?=(?:bachelor'?s?|master'?s?|bs|ms|phd|ph\.?d|associate'?s?|advanced)\b)/gi;
  const spans: Array<{ start: number; end: number }> = [];
  let last = 0;
  for (const m of normLine.matchAll(sepRe)) {
    if (m.index !== undefined) {
      spans.push({ start: last, end: m.index });
      last = m.index + m[0].length;
    }
  }
  spans.push({ start: last, end: normLine.length });

  const mySpan = spans.find((s) => matchStart >= s.start && matchEnd <= s.end) ?? { start: 0, end: normLine.length };
  const clause = normLine.slice(mySpan.start, mySpan.end);
  const beforeClause = normLine.slice(0, mySpan.start);

  if (IN_LIEU_RE.test(clause) && !BACHELOR_ANY_RE.test(clause)) {
    return true;
  }
  if (PRECEDED_BY_DEGREE_OR_RE.test(beforeClause) && !/\band\b/i.test(clause.slice(0, matchStart - mySpan.start))) {
    return true;
  }
  // If any clause on this line pairs Bachelor's + years, prefer only the Bachelor's clause
  const hasBachelorYearsClause = spans.some((s) => {
    const c = normLine.slice(s.start, s.end);
    return BACHELOR_ANY_RE.test(c) && new RegExp(CANDIDATE_SOURCE, 'i').test(c);
  });
  if (hasBachelorYearsClause && !BACHELOR_ANY_RE.test(clause)) {
    return true;
  }
  return false;
}

/**
 * @summary Collapses all whitespace runs into single spaces and trims ends
 */
function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * @summary Updates section classification when a short heading line is encountered
 */
function classifyHeading(trimmedNorm: string, current: SectionKind): SectionKind {
  if (trimmedNorm.length === 0 || trimmedNorm.length > 60 || trimmedNorm.endsWith('.')) {
    return current;
  }
  if (!/about you/i.test(trimmedNorm) && OTHER_HEADING_RE.test(trimmedNorm)) {
    return 'other';
  }
  if (PREF_HEADING_RE.test(trimmedNorm)) {
    return 'preferred';
  }
  if (REQ_HEADING_RE.test(trimmedNorm)) {
    return 'required';
  }
  return current;
}

/**
 * @summary Extracts a <=160 char evidence slice from the original line covering the winning match
 */
function buildEvidence(rawLine: string, normLine: string, matchStart: number, matchEnd: number): string {
  const collapsedRaw = collapseSpaces(rawLine);
  if (collapsedRaw.length <= MAX_EVIDENCE_CHARS) {
    return collapsedRaw;
  }

  // Locate the matched token inside the space-collapsed line using the same position ratio
  const matchedNorm = collapseSpaces(normLine.slice(matchStart, matchEnd));
  const collapsedNorm = collapseSpaces(normLine);
  const idx = collapsedNorm.indexOf(matchedNorm);
  if (idx === -1) {
    return collapsedRaw.slice(0, MAX_EVIDENCE_CHARS).trimEnd();
  }

  const start = Math.max(0, Math.min(idx - 40, collapsedRaw.length - MAX_EVIDENCE_CHARS));
  const end = Math.min(collapsedRaw.length, start + MAX_EVIDENCE_CHARS);
  return collapsedRaw.slice(start, end).trim();
}

/**
 * @summary Checks whether "year(s)" appears within 40 chars of "experience" in normalized text
 */
function hasUnparsedExperienceYears(normText: string): boolean {
  const collapsed = collapseSpaces(normText);
  const yearPositions: number[] = [];
  const expPositions: number[] = [];

  for (const m of collapsed.matchAll(YEAR_WORD_RE)) {
    if (m.index !== undefined) yearPositions.push(m.index);
  }
  for (const m of collapsed.matchAll(EXP_WORD_RE)) {
    if (m.index !== undefined) expPositions.push(m.index);
  }

  for (const yIdx of yearPositions) {
    for (const eIdx of expPositions) {
      if (Math.abs(yIdx - eIdx) <= 40) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @summary Extracts minimum required years of experience, original-text evidence, and ambiguity flag
 */
export function extractMinYears(text: string): YearsResult {
  if (!text || text.trim().length === 0) {
    return { value: null, evidence: null, ambiguous: false };
  }

  const rawLines = text.split(/\r?\n/);
  let section: SectionKind = 'neutral';
  const accepted: Candidate[] = [];
  let sawOverLimit = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const normLine = normalizeWorkingText(rawLine);
    const trimmedNorm = collapseSpaces(normLine);

    section = classifyHeading(trimmedNorm, section);
    if (trimmedNorm.length === 0) continue;

    if (MONEY_LINE_RE.test(normLine)) continue;
    if (BLURB_LINE_RE.test(normLine) && !CANDIDATE_PRONOUN_RE.test(normLine)) continue;

    const hasCue =
      EXP_CUE_RE.test(normLine) ||
      DEGREE_CUE_RE.test(normLine) ||
      section === 'required' ||
      section === 'preferred';
    if (!hasCue) continue;

    const regex = new RegExp(CANDIDATE_SOURCE, 'gi');
    for (const match of normLine.matchAll(regex)) {
      if (match.index === undefined) continue;
      const start = match.index;
      const end = start + match[0].length;
      const after = normLine.slice(end);
      if (POST_REJECT_RE.test(after)) continue;

      const before12 = normLine.slice(Math.max(0, start - 12), start);
      if (PRE_REJECT_RE.test(before12)) continue;

      const value = parseNumToken(match[1]);
      if (Number.isNaN(value) || value < 0) continue;
      if (value > MAX_REASONABLE_YEARS) {
        sawOverLimit = true;
        continue;
      }
      if (isAlternativeDegreeClause(normLine, start, end)) {
        continue;
      }

      const preferred = section === 'preferred' || isInlinePreferred(normLine, start, end);
      accepted.push({
        value,
        lineIndex: i,
        matchStart: start,
        matchEnd: end,
        preferred,
        normLine,
        rawLine,
      });
    }
  }

  const required = accepted.filter((c) => !c.preferred);
  const preferred = accepted.filter((c) => c.preferred);

  if (required.length === 0) {
    const onlyPreferred = preferred.length > 0;
    const unparsedYears = !onlyPreferred && !sawOverLimit && hasUnparsedExperienceYears(normalizeWorkingText(text));
    return {
      value: null,
      evidence: null,
      ambiguous: onlyPreferred || unparsedYears,
    };
  }

  let winner = required[0];
  for (let i = 1; i < required.length; i++) {
    if (required[i].value > winner.value) {
      winner = required[i];
    }
  }

  const evidence = buildEvidence(winner.rawLine, winner.normLine, winner.matchStart, winner.matchEnd);

  const levelValues = new Set<number>();
  for (const c of required) {
    if (LEVEL_LABEL_RE.test(c.normLine.trimStart())) {
      levelValues.add(c.value);
    }
  }

  const ambiguous =
    AMBIGUOUS_LINE_RE.test(winner.normLine) ||
    levelValues.size >= 2;

  return {
    value: winner.value,
    evidence,
    ambiguous,
  };
}
