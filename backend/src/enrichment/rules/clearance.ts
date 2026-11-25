/**
 * @file Security Clearance Rules Extractor
 * @summary Pure deterministic extractor for security clearance requirements and eligibility across US and allied frameworks
 * @tags enrichment, rules, clearance, job-attributes, BF-026
 */

/** Result of detecting security clearance requirement or eligibility in job text. */
export interface ClearanceResult {
  required: boolean;
  evidence: string | null;
  ambiguous: boolean;
}

/** False-friend phrases stripped before evaluating clearance keywords. */
export const CLEARANCE_FALSE_FRIENDS: readonly RegExp[] = Object.freeze([
  /\brange clearances?\b/i,
  /\blow[- ]clearances?\b/i,
  /\bground clearances?\b/i,
  /\bcustoms clearances?\b/i,
  /\bmedical clearances?\b/i,
  /\bflight clearances?\b/i,
  /\bairspace clearances?\b/i,
  /\btool clearances?\b/i,
  /\bheight clearances?\b/i,
  /\bclearance sales?\b/i,
  /\bregulatory clearances?\b/i,
  /\bclearances?\s+for\s+on-?site\s+work\b/i,
  /\bthose with\s+(?:an\s+)?active clearances?\b[^.\n]{0,60}\bdifferential\b/i,
  /\bbackground(?:\s+(?:check|screening|investigation))?\s+clearances?\b/i,
  /\bcriminal(?:\s+(?:record|history|background))?(?:\s+check)?\s+clearances?\b/i,
  /\bfingerprint(?:ing)?(?:\s+check)?\s+clearances?\b/i,
  /\bchild\s+abuse(?:\s+(?:history|register|registry))?\s+clearances?\b/i,
  /\b(?:childcare|working\s+with\s+children|vulnerable\s+sector|police(?:\s+check)?)\s+clearances?\b/i,
  /\b(?:health|tb|tuberculosis|immunization|vaccination|drug(?:\s+(?:screen(?:ing)?|test(?:ing)?))?|pre-?employment|tax|ethics|ethical|visa|work|export|import|parking)\s+clearances?\b/i,
  /\btrade secrets?\b/i,
  /\bsecret sauce\b/i,
]);

/** Strong US security clearance patterns. */
export const CLEARANCE_STRONG_PATTERNS: readonly RegExp[] = Object.freeze([
  /\b(security|government|federal|dod|doe|personnel|active|interim)\s+clearances?\b/i,
  /\btop[\s-]secret\b/i,
  /\bTS\s*\/\s*SCI\b|\bTS-SCI\b|\bTS\s+clearances?\b/,
  /\bpublic\s+trust\b/i,
  /\bpolygraph\b|\b(ci|full[\s-]scope|lifestyle|counter-?intelligence)\s+poly\b/i,
  /\bsecret\b[^.\n]{0,40}\bclearances?\b|\bclearances?\b[^.\n]{0,40}\bsecret\b/i,
  /\beligib\w*\b[^.\n]{0,30}\b(?:Secret|TS|SCI)\b|\b(?:Secret|TS|SCI)\b[^.\n]{0,30}\beligib\w*\b/,
  /\b[QL][\s-]clearances?\b/,
  /\bobtain\b[^.\n]{0,40}\bclearances?\b|\beligib\w*\b[^.\n]{0,40}\bclearances?\b/i,
]);

/** Strong non-US allied clearance patterns (UK, NATO, Canada, Australia). */
export const CLEARANCE_NON_US_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bdeveloped vetting\b|\bsecurity check(ed)?\s*\(SC\)/i,
  /\(?\b(SC|DV)\)?\s+(clearance|cleared|vetting)\b|\bBPSS\b|\bCTC\s+(clearance|cleared)\b/,
  /\bNATO\s+(secret|confidential|cosmic|clearance)\b/i,
  /\b(NV1|NV2|AGSVA)\b|\bbaseline\s+(security\s+)?clearance\b|\bnegative vetting\b/i,
  /\breliability\s+(status|clearance|screening)\b|\b(government of canada|canadian)\b[^.\n]{0,40}\b(security|secret|clearance)\b/i,
]);

/** Weak or bare clearance terms that indicate clearance sensitivity with ambiguity. */
export const CLEARANCE_WEAK_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bclearance\b/i,
  /\bSCI\b/,
]);

/** Negation cues within a sentence containing a clearance keyword. */
export const CLEARANCE_NEGATION: RegExp =
  /\b(no|not|without|doesn'?t|does not)\b[^.\n]{0,40}\b(required|require|need(ed)?|necessary)\b|beneficial but not required|not a requirement/i;

/** Preferred/optional cues within a sentence containing a clearance keyword. */
export const CLEARANCE_PREFERRED: RegExp = /prefer|nice to have|a plus|bonus|desired/i;

const MAX_EVIDENCE_CHARS = 160;

/**
 * @summary Replaces false-friend phrases with spaces while keeping character offsets unchanged
 */
function stripFalseFriends(sentence: string): string {
  let clean = sentence;
  for (const re of CLEARANCE_FALSE_FRIENDS) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    clean = clean.replace(globalRe, (match) => ' '.repeat(match.length));
  }
  return clean;
}

/**
 * @summary Collapses whitespace and windows the original sentence to <=160 chars around a match index
 */
function buildSentenceEvidence(origSentence: string, matchIndex: number): string {
  const collapsed = origSentence.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_EVIDENCE_CHARS) {
    return collapsed;
  }

  const ratio = origSentence.length > 0 ? matchIndex / origSentence.length : 0;
  const approxCenter = Math.floor(ratio * collapsed.length);
  const start = Math.max(0, Math.min(approxCenter - 40, collapsed.length - MAX_EVIDENCE_CHARS));
  const end = Math.min(collapsed.length, start + MAX_EVIDENCE_CHARS);
  return collapsed.slice(start, end).trim();
}

/**
 * @summary Finds the earliest strong, non-US, or weak clearance match in a pre-stripped sentence
 */
function matchSentence(cleaned: string): { kind: 'strong' | 'weak'; index: number } | null {
  for (const re of CLEARANCE_STRONG_PATTERNS) {
    const idx = cleaned.search(re);
    if (idx !== -1) return { kind: 'strong', index: idx };
  }
  for (const re of CLEARANCE_NON_US_PATTERNS) {
    const idx = cleaned.search(re);
    if (idx !== -1) return { kind: 'strong', index: idx };
  }
  for (const re of CLEARANCE_WEAK_PATTERNS) {
    const idx = cleaned.search(re);
    if (idx !== -1) return { kind: 'weak', index: idx };
  }
  return null;
}

/**
 * @summary Detects government security clearance requirements or eligibility from job title and/or description
 */
export function detectClearance(text: string): ClearanceResult {
  if (!text || text.trim().length === 0) {
    return { required: false, evidence: null, ambiguous: false };
  }

  // Split into sentence-like segments so negation and evidence stay sentence-scoped
  const sentences = text.split(/[.;\n]+/);
  let hasNegated = false;
  let firstPositiveEvidence: string | null = null;
  let anyWeak = false;
  let anyPreferred = false;

  for (const origSentence of sentences) {
    if (origSentence.trim().length === 0) continue;
    const cleaned = stripFalseFriends(origSentence);
    const match = matchSentence(cleaned);
    if (!match) continue;

    if (CLEARANCE_NEGATION.test(cleaned)) {
      hasNegated = true;
      continue;
    }

    if (firstPositiveEvidence === null) {
      firstPositiveEvidence = buildSentenceEvidence(origSentence, match.index);
    }
    if (match.kind === 'weak') {
      anyWeak = true;
    }
    if (CLEARANCE_PREFERRED.test(cleaned)) {
      anyPreferred = true;
    }
  }

  if (firstPositiveEvidence === null) {
    return { required: false, evidence: null, ambiguous: false };
  }

  return {
    required: true,
    evidence: firstPositiveEvidence,
    ambiguous: hasNegated || anyWeak || anyPreferred,
  };
}

/**
 * @summary True when the text contains a clearance keyword after removing false friends
 */
export function containsClearanceKeyword(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }
  return matchSentence(stripFalseFriends(text)) !== null;
}
