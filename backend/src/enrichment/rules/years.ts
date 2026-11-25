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

/** Optional context passed to extractMinYears (never used to extract year numbers). */
export interface ExtractMinYearsOptions {
  title?: string;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
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
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
};

const NUM_WORDS_PATTERN =
  'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty';
const NUM_TOKEN = `(?:\\d{1,2}|${NUM_WORDS_PATTERN})`;
const PAREN_NUM = `(?:\\s*\\((?:\\d{1,2}|${NUM_WORDS_PATTERN})\\))?`;
const CANDIDATE_SOURCE =
  `(?<![\\d,.$€£])(?<!\\w-)\\b(${NUM_TOKEN})${PAREN_NUM}\\s*(?:\\+|plus)?\\s*(?:(?:(?:years?|yrs?)\\s+)?(?:-|to|through)\\s*(?:${NUM_TOKEN})${PAREN_NUM}\\s*(?:\\+|plus)?\\s*)?(?:or more\\s+|or greater\\s+)?(?:years?|yrs?)\\b(?!-)`;
const BETWEEN_AND_RE = new RegExp(
  `(\\bbetween\\s+${NUM_TOKEN}${PAREN_NUM}(?:\\s+(?:years?|yrs?))?\\s+)and(?=\\s+${NUM_TOKEN})`,
  'gi'
);

const POST_REJECT_RE =
  /^\s*(?:'s?\s*)?(?:in a row|ago|old(?:er)?|of\s+age|(?:or\s+)?older|(?:or\s+)?younger|(?:or\s+)?under|running|straight)\b/i;
const PRE_REJECT_RE = /\b(?:per|each|every|a)\b\s*$/i;
const PRE_AGE_RE =
  /\bage(?:\s+(?:of|requirement|limit|minimum))?\s*:?\s*(?:at\s+least\s+|minimum\s+(?:of\s+)?)?$/i;

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
const LEVEL_HEADING_QUALIFIER_RE =
  /\b(?:level\s+(?:I{1,3}|IV|[1-5])|(?:tech(?:nician)?|engineer|developer|specialist|analyst|manager|designer|scientist|architect|rep(?:resentative)?)\s+(?:I{1,3}|IV|[1-5])|\b(?:junior|entry[- ]level|associate|mid[- ]level|senior|sr\.?|staff|principal)\b)/i;

const MULTI_LEVEL_ORG_SUFFIX_RE =
  /^\s*(?:of|within|in|across)\s+(?:the\s+|an?\s+|our\s+)?(?:organization|company|business|enterprise|leadership|management|stakeholders?|personnel|staff|team|clients?|customers?)\b/i;
const MULTI_LEVEL_COMM_PREFIX_RE =
  /\b(?:with|engage|engaging|engagement|communicate|communicating|collaborate|collaborating|interact|interacting|present|presenting|work|working|partner|partnering|relationships?)\s+(?:at\s+|across\s+|with\s+)?$/i;

const UNPARSED_REJECT_SPAN_RE = new RegExp(
  [
    `\\b(?:per|each|every|a)\\s+(?:years?|yrs?)\\b`,
    `\\b(?:${NUM_TOKEN})?${PAREN_NUM}\\s*(?:\\+|plus)?\\s*(?:years?|yrs?)\\s*(?:'s?\\s*)?(?:in a row|ago|old(?:er)?|of\\s+age|(?:or\\s+)?older|(?:or\\s+)?younger|(?:or\\s+)?under|running|straight)\\b`,
    `\\bage(?:\\s+(?:of|requirement|limit|minimum))?\\s*:?\\s*(?:at\\s+least\\s+|minimum\\s+(?:of\\s+)?)?(?:${NUM_TOKEN})${PAREN_NUM}\\s*(?:years?|yrs?)\\b`,
  ].join('|'),
  'gi'
);
const NON_HYPHEN_YEAR_RE = /(?<!-)\b(?:years?|yrs?)\b(?!-)/gi;
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
  levelHeading: string | null;
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
 * @summary Normalizes dash variants, curly apostrophes, NBSP, and "between X and Y" connectors with 1:1 character lengths
 */
function normalizeWorkingText(line: string): string {
  return line
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(BETWEEN_AND_RE, '$1to ');
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
 * @summary Checks short title/heading strings for multi-level range phrases without matching org-level prose
 */
function hasShortLineMultiLevel(s: string): boolean {
  const re = /\b(?:all|multiple|various|several)\s+(?:experience\s+|seniority\s+|career\s+)?levels\b/gi;
  for (const m of s.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = s.slice(Math.max(0, start - 35), start);
    const after = s.slice(end);
    if (MULTI_LEVEL_ORG_SUFFIX_RE.test(after)) continue;
    if (MULTI_LEVEL_COMM_PREFIX_RE.test(before)) continue;
    return true;
  }
  if (/\b(?:I\s*(?:\/|,)\s*II(?:\s*(?:\/|,|\bor\b)\s*(?:III|Senior|Sr\.?))?|II\s*(?:\/|,)\s*III|L[2-7]\s*\/\s*L[3-8]|IC[2-7]\s*\/\s*IC[3-8])\b/.test(s)) {
    return true;
  }
  if (/\b(?:junior|jr\.?|mid(?:-level)?|senior|sr\.?|staff|principal)\s*\/\s*(?:mid(?:-level)?|senior|sr\.?|staff|principal)\b/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * @summary Detects multi-level job postings from title or non-blurb body cues
 */
function hasMultiLevelPostingCue(normLines: string[], normTitle: string): boolean {
  if (normTitle && hasShortLineMultiLevel(normTitle)) {
    return true;
  }

  let section: SectionKind = 'neutral';
  for (const line of normLines) {
    const trimmed = collapseSpaces(line);
    if (trimmed.length === 0) continue;

    section = classifyHeading(trimmed, section);
    if (section === 'other') continue;
    if (MONEY_LINE_RE.test(line)) continue;
    if (BLURB_LINE_RE.test(line) && !CANDIDATE_PRONOUN_RE.test(line)) continue;

    if (trimmed.length <= 80 && !trimmed.endsWith('.') && hasShortLineMultiLevel(trimmed)) {
      return true;
    }

    const hiringMatch = trimmed.match(
      /\b(?:hiring|interviewing|recruiting|seeking|considering|open(?:\s+to)?|looking\s+for|welcoming|accepting)\b[^.;\n]{0,60}\b(?:at|across|for|from)?\s*(?:all|multiple|several|various)\s+(?:experience\s+|seniority\s+|career\s+|engineering\s+)?levels\b(.*)/i
    );
    if (hiringMatch && !MULTI_LEVEL_ORG_SUFFIX_RE.test(hiringMatch[1])) {
      return true;
    }

    if (
      /\b(?:this\s+)?(?:role|position|requisition|opening|posting)\b[^.;\n]{0,60}\b(?:all|multiple|several|various)\s+(?:experience\s+|seniority\s+|career\s+)?levels\b/i.test(
        trimmed
      )
    ) {
      return true;
    }

    if (
      /\b(?:can\s+be\s+hired|may\s+be\s+(?:hired|filled)|hired\s+at)\b[^.;\n]{0,60}\b(?:level\s+)?(?:I\b[^.;\n]{0,25}\bII\b|1\b[^.;\n]{0,25}\b2\b|(?:junior|associate|entry)[^.;\n]{0,30}(?:mid|senior|staff)|(?:mid|senior)[^.;\n]{0,30}(?:senior|staff|principal))/i.test(
        trimmed
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * @summary Checks whether unrejected non-hyphenated "year(s)" appears within 40 chars of "experience" inside the same qualifying sentence
 */
function hasUnparsedExperienceYears(normLines: string[]): boolean {
  let section: SectionKind = 'neutral';
  for (const normLine of normLines) {
    const trimmed = collapseSpaces(normLine);
    section = classifyHeading(trimmed, section);
    if (trimmed.length === 0) continue;
    if (section === 'other') continue;
    if (MONEY_LINE_RE.test(normLine)) continue;
    if (BLURB_LINE_RE.test(normLine) && !CANDIDATE_PRONOUN_RE.test(normLine)) continue;

    for (const rawSent of trimmed.split(/[.;!?]+/)) {
      const cleaned = rawSent.replace(UNPARSED_REJECT_SPAN_RE, (m) => ' '.repeat(m.length));
      const yearPositions: number[] = [];
      const expPositions: number[] = [];

      for (const m of cleaned.matchAll(NON_HYPHEN_YEAR_RE)) {
        if (m.index !== undefined) yearPositions.push(m.index);
      }
      for (const m of cleaned.matchAll(EXP_WORD_RE)) {
        if (m.index !== undefined) expPositions.push(m.index);
      }

      for (const yIdx of yearPositions) {
        for (const eIdx of expPositions) {
          if (Math.abs(yIdx - eIdx) <= 40) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * @summary Extracts minimum required years of experience, original-text evidence, and ambiguity flag
 */
export function extractMinYears(text: string, opts?: ExtractMinYearsOptions): YearsResult {
  if (!text || text.trim().length === 0) {
    return { value: null, evidence: null, ambiguous: false };
  }

  const rawLines = text.split(/\r?\n/);
  const normLines = rawLines.map(normalizeWorkingText);
  const normTitle = opts?.title ? collapseSpaces(normalizeWorkingText(opts.title)) : '';
  let section: SectionKind = 'neutral';
  let currentLevelHeading: string | null = null;
  const accepted: Candidate[] = [];
  let sawOverLimit = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const normLine = normLines[i];
    const trimmedNorm = collapseSpaces(normLine);

    const prevSection: SectionKind = section;
    section = classifyHeading(trimmedNorm, section);
    if (
      trimmedNorm.length > 0 &&
      trimmedNorm.length <= 60 &&
      !trimmedNorm.endsWith('.') &&
      section !== prevSection &&
      section !== 'required'
    ) {
      currentLevelHeading = null;
    } else if (
      trimmedNorm.length > 0 &&
      trimmedNorm.length <= 60 &&
      !trimmedNorm.endsWith('.') &&
      section === 'required' &&
      REQ_HEADING_RE.test(trimmedNorm) &&
      LEVEL_HEADING_QUALIFIER_RE.test(trimmedNorm)
    ) {
      currentLevelHeading = trimmedNorm.toLowerCase();
    }

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
      if (after.trim().length === 0 && i + 1 < normLines.length) {
        if (POST_REJECT_RE.test(` ${normLines[i + 1].trimStart()}`)) continue;
      }

      const before12 = normLine.slice(Math.max(0, start - 12), start);
      if (PRE_REJECT_RE.test(before12)) continue;

      const before35 = normLine.slice(Math.max(0, start - 35), start);
      if (PRE_AGE_RE.test(before35)) continue;

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
        levelHeading: !preferred && section === 'required' ? currentLevelHeading : null,
        normLine,
        rawLine,
      });
    }
  }

  const required = accepted.filter((c) => !c.preferred);
  const preferred = accepted.filter((c) => c.preferred);

  if (required.length === 0) {
    const onlyPreferred = preferred.length > 0;
    const unparsedYears = !onlyPreferred && !sawOverLimit && hasUnparsedExperienceYears(normLines);
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
  const headingLevels = new Set<string>();
  const headingLevelValues = new Set<number>();
  for (const c of required) {
    if (LEVEL_LABEL_RE.test(c.normLine.trimStart())) {
      levelValues.add(c.value);
    }
    if (c.levelHeading !== null) {
      headingLevels.add(c.levelHeading);
      headingLevelValues.add(c.value);
    }
  }

  const ambiguous =
    AMBIGUOUS_LINE_RE.test(winner.normLine) ||
    levelValues.size >= 2 ||
    (headingLevels.size >= 2 && headingLevelValues.size >= 2) ||
    hasMultiLevelPostingCue(normLines, normTitle);

  return {
    value: winner.value,
    evidence,
    ambiguous,
  };
}
