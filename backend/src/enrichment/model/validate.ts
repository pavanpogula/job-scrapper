/**
 * @file Model answer validation
 * @summary Accepts a model answer only when its evidence, years and clearance claims are confirmed from the job text
 * @tags Enrichment, Model, Validation, BF-027
 */

import { containsClearanceKeyword, detectClearance } from '../rules/clearance';
import type { EnrichmentInput, JobAttributes } from '../types';
import type { ModelAnswer } from './ModelClient';

const MIN_EVIDENCE_CHARS = 6;
const MAX_MATCH_EVIDENCE_CHARS = 300;
const MAX_STORED_EVIDENCE_CHARS = 200;
const MAX_REASONABLE_YEARS = 30;
const YEARS_UNIT_RE = /\b(years?|yrs?)\b/i;

const NUMBER_WORDS_BY_VALUE: Readonly<Record<number, string>> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
  17: 'seventeen',
  18: 'eighteen',
  19: 'nineteen',
  20: 'twenty',
  21: 'twenty[- ]one',
  22: 'twenty[- ]two',
  23: 'twenty[- ]three',
  24: 'twenty[- ]four',
  25: 'twenty[- ]five',
  26: 'twenty[- ]six',
  27: 'twenty[- ]seven',
  28: 'twenty[- ]eight',
  29: 'twenty[- ]nine',
  30: 'thirty',
};

/**
 * @summary Normalizes Unicode compatibility forms, curly quotes, dashes, whitespace, and casing for substring checks
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @summary Checks that non-null evidence is 6-300 normalized chars and appears in normalized title + description
 */
function isValidEvidenceSubstring(haystack: string, rawEvidence: string | null): boolean {
  if (rawEvidence === null) {
    return true;
  }
  const normalized = normalizeForMatch(rawEvidence);
  if (normalized.length < MIN_EVIDENCE_CHARS || normalized.length > MAX_MATCH_EVIDENCE_CHARS) {
    return false;
  }
  return haystack.includes(normalized);
}

/**
 * @summary Checks that yearsEvidence contains a unit cue and either digits or the English word for minYears
 */
function evidenceConfirmsYears(yearsEvidence: string, minYears: number): boolean {
  const norm = normalizeForMatch(yearsEvidence);
  if (!YEARS_UNIT_RE.test(norm)) {
    return false;
  }
  const digitRe = new RegExp(`(?<!\\d)${minYears}(?!\\d)`);
  if (digitRe.test(norm)) {
    return true;
  }
  const wordPattern = NUMBER_WORDS_BY_VALUE[minYears];
  if (!wordPattern) {
    return false;
  }
  const wordRe = new RegExp(`\\b(?:${wordPattern})\\b`, 'i');
  return wordRe.test(norm);
}

/**
 * @summary Validates a raw ModelAnswer against title + descriptionPlain and the E1 clearance lexicon
 */
export function validateModelAnswer(
  input: EnrichmentInput,
  answer: ModelAnswer
): JobAttributes | null {
  const fullText = `${input.title}\n${input.descriptionPlain}`;
  const haystack = normalizeForMatch(fullText);

  if (
    !isValidEvidenceSubstring(haystack, answer.yearsEvidence) ||
    !isValidEvidenceSubstring(haystack, answer.clearanceEvidence)
  ) {
    return null;
  }

  if (answer.minYears !== null) {
    if (
      typeof answer.minYears !== 'number' ||
      !Number.isInteger(answer.minYears) ||
      answer.minYears < 0 ||
      answer.minYears > MAX_REASONABLE_YEARS
    ) {
      return null;
    }
    if (answer.yearsEvidence === null || !evidenceConfirmsYears(answer.yearsEvidence, answer.minYears)) {
      return null;
    }
  }

  if (answer.clearanceRequired === true) {
    if (answer.clearanceEvidence === null || !containsClearanceKeyword(answer.clearanceEvidence)) {
      return null;
    }
  } else if (answer.clearanceRequired === false) {
    const rulesClearance = detectClearance(fullText);
    if (rulesClearance.required && !rulesClearance.ambiguous) {
      return null;
    }
  } else {
    return null;
  }

  const evidence: JobAttributes['evidence'] = {};
  if (answer.yearsEvidence !== null) {
    evidence.years = answer.yearsEvidence.trim().slice(0, MAX_STORED_EVIDENCE_CHARS);
  }
  if (answer.clearanceEvidence !== null) {
    evidence.clearance = answer.clearanceEvidence.trim().slice(0, MAX_STORED_EVIDENCE_CHARS);
  }

  return {
    experienceMinYears: answer.minYears,
    clearanceRequired: answer.clearanceRequired,
    confidence: 'high',
    source: 'model',
    evidence,
  };
}
