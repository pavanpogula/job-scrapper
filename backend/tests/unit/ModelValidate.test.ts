/**
 * @file Unit tests for model answer validation and ModelCallError
 * @summary Verifies deterministic evidence matching, years bounds, clearance lexicon checks, and error semantics (BF-027)
 * @tags test, unit, enrichment, model, validation, BF-027
 */

import { ModelAnswer, ModelCallError } from '../../src/enrichment/model/ModelClient';
import { normalizeForMatch, validateModelAnswer } from '../../src/enrichment/model/validate';
import { containsClearanceKeyword } from '../../src/enrichment/rules/clearance';
import type { EnrichmentInput } from '../../src/enrichment/types';

const BASE_INPUT: EnrichmentInput = {
  id: 'job-1',
  title: 'Software Engineer',
  descriptionPlain:
    'You have 7+ years of software engineering experience.\nMust be able to obtain a Secret clearance.',
};

function makeAnswer(overrides: Partial<ModelAnswer> = {}): ModelAnswer {
  return {
    minYears: 7,
    clearanceRequired: true,
    yearsEvidence: 'You have 7+ years of software engineering experience.',
    clearanceEvidence: 'Must be able to obtain a Secret clearance.',
    ...overrides,
  };
}

describe('validateModelAnswer and model contract', () => {
  it('rejects evidence not in description', () => {
    const ans = makeAnswer({
      minYears: 9,
      yearsEvidence: 'You have 9+ years of experience.',
    });
    expect(validateModelAnswer(BASE_INPUT, ans)).toBeNull();
  });

  it('rejects years out of range', () => {
    const overInput: EnrichmentInput = {
      id: 'job-over',
      title: 'Principal',
      descriptionPlain: 'You have 31 years of experience building aircraft systems.',
    };
    expect(
      validateModelAnswer(
        overInput,
        makeAnswer({
          minYears: 31,
          clearanceRequired: false,
          yearsEvidence: 'You have 31 years of experience building aircraft systems.',
          clearanceEvidence: null,
        })
      )
    ).toBeNull();

    const negInput: EnrichmentInput = {
      id: 'job-neg',
      title: 'Engineer',
      descriptionPlain: 'Experience level: -1 years required in legacy docs.',
    };
    expect(
      validateModelAnswer(
        negInput,
        makeAnswer({
          minYears: -1,
          clearanceRequired: false,
          yearsEvidence: 'Experience level: -1 years required in legacy docs.',
          clearanceEvidence: null,
        })
      )
    ).toBeNull();

    const fracInput: EnrichmentInput = {
      id: 'job-frac',
      title: 'Engineer',
      descriptionPlain: 'At least 2.5 years of relevant work experience.',
    };
    expect(
      validateModelAnswer(
        fracInput,
        makeAnswer({
          minYears: 2.5,
          clearanceRequired: false,
          yearsEvidence: 'At least 2.5 years of relevant work experience.',
          clearanceEvidence: null,
        })
      )
    ).toBeNull();
  });

  it('rejects years whose number is not in the evidence', () => {
    const ans = makeAnswer({
      minYears: 5,
      yearsEvidence: 'You have 7+ years of software engineering experience.',
    });
    expect(validateModelAnswer(BASE_INPUT, ans)).toBeNull();
  });

  it('rejects clearance true without keyword', () => {
    const ans = makeAnswer({
      clearanceRequired: true,
      clearanceEvidence: 'You have 7+ years of software engineering experience.',
    });
    expect(validateModelAnswer(BASE_INPUT, ans)).toBeNull();
  });

  it('rejects clearance false when rules found an unambiguous clearance', () => {
    const ans = makeAnswer({
      clearanceRequired: false,
      clearanceEvidence: null,
    });
    expect(validateModelAnswer(BASE_INPUT, ans)).toBeNull();
  });

  it('accepts evidence with different whitespace and quotes', () => {
    const input: EnrichmentInput = {
      id: 'job-ws-quotes',
      title: 'Staff Engineer',
      descriptionPlain:
        'You have 7+ years of software engineering experience.\nRequires  \u201cactive\u201d\n Secret clearance',
    };
    const ans = makeAnswer({
      clearanceRequired: true,
      clearanceEvidence: 'requires "active" secret clearance',
    });
    const out = validateModelAnswer(input, ans);
    expect(out).not.toBeNull();
    expect(out?.clearanceRequired).toBe(true);
    expect(out?.confidence).toBe('high');
    expect(out?.source).toBe('model');
    expect(normalizeForMatch(out?.evidence.clearance ?? '')).toBe(
      'requires "active" secret clearance'
    );
  });

  it('accepts a number word', () => {
    const input: EnrichmentInput = {
      id: 'job-word',
      title: 'Backend Engineer',
      descriptionPlain: 'Candidates bring at least five years of experience in backend systems.',
    };
    const out = validateModelAnswer(
      input,
      makeAnswer({
        minYears: 5,
        clearanceRequired: false,
        yearsEvidence: 'at least five years of experience in backend systems.',
        clearanceEvidence: null,
      })
    );
    expect(out).not.toBeNull();
    expect(out?.experienceMinYears).toBe(5);
    expect(out?.confidence).toBe('high');
    expect(out?.source).toBe('model');
  });

  it('accepts null years with high confidence and model source', () => {
    const input: EnrichmentInput = {
      id: 'job-null-years',
      title: 'Distributed Systems Engineer',
      descriptionPlain: 'Build distributed systems with our platform engineering team.',
    };
    const out = validateModelAnswer(
      input,
      makeAnswer({
        minYears: null,
        yearsEvidence: null,
        clearanceRequired: false,
        clearanceEvidence: null,
      })
    );
    expect(out).toEqual({
      experienceMinYears: null,
      clearanceRequired: false,
      confidence: 'high',
      source: 'model',
      evidence: {},
    });
  });

  it.each([
    ['TS/SCI', true],
    ['Public Trust', true],
    ['SC clearance', true],
    ['NV1', true],
    ['security clearance', true],
    ['range clearance', false],
    ['customs clearance', false],
    ['low-clearance vehicle', false],
    ['trade secrets', false],
    ['export controlled (ITAR)', false],
    ['U.S. person', false],
  ])('containsClearanceKeyword(%j) -> %s', (phrase, expected) => {
    expect(containsClearanceKeyword(phrase)).toBe(expected);
  });

  it('ModelCallError is fatal for 402 and not for 503, and responded is true only for bad_json and blocked', () => {
    for (const status of [400, 401, 402, 403, 404]) {
      expect(new ModelCallError('http', status, 1).fatal).toBe(true);
    }
    for (const status of [429, 500, 503, undefined]) {
      expect(new ModelCallError(status ? 'http' : 'timeout', status, 4).fatal).toBe(false);
    }

    expect(new ModelCallError('bad_json', 200, 1).responded).toBe(true);
    expect(new ModelCallError('blocked', 200, 1).responded).toBe(true);
    expect(new ModelCallError('http', 503, 4).responded).toBe(false);
    expect(new ModelCallError('timeout', undefined, 4).responded).toBe(false);
    expect(new ModelCallError('network', undefined, 4).responded).toBe(false);

    expect(new ModelCallError('http', 402, 1).message).toBe('Gemini http 402 after 1 attempt(s)');
    expect(new ModelCallError('timeout', undefined, 4).message).toBe(
      'Gemini timeout after 4 attempt(s)'
    );
  });
});
