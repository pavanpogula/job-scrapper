/**
 * @file JobAttributesYears.test.ts
 * @summary Unit regression table and evidence invariant tests for extractMinYears rules extractor
 * @tags unit, enrichment, rules, years, job-attributes, BF-026
 */

import { extractMinYears } from '../../src/enrichment/rules/years';

type YearsCase = [name: string, text: string, value: number | null, ambiguous: boolean | undefined];

const cases: YearsCase[] = [
  [
    'sub-requirement: overall beats sub-skill',
    '8+ years of overall experience, including 3+ years in product management',
    8,
    undefined,
  ],
  [
    'separate bullets: largest overall wins',
    'Requirements\n7+ years of software engineering experience\n3+ years leading teams',
    7,
    false,
  ],
  [
    'company blurb number is ignored',
    'For 10 years, Scale has powered the AI industry.\nRequirements\n4+ years of experience with Python',
    4,
    undefined,
  ],
  ['blurb only gives null', 'Founded 12 years ago, we have grown to 500 people.', null, false],
  [
    'salary per year is ignored',
    'Salary: $120,000 - $150,000 per year\n5+ years of experience',
    5,
    undefined,
  ],
  ['money only gives null', 'Pay range $90,000 per year. Up to 10% bonus.', null, false],
  ['date phrase is ignored', 'Named a Best Place to Work four years in a row.', null, false],
  [
    'hyphenated adjective is ignored',
    'Help shape our three-year vision and 5-year roadmap.',
    null,
    false,
  ],
  ['en-dash range gives lower bound', '3–5 years of experience in data engineering', 3, undefined],
  ['hyphen range gives lower bound', '3-5 years experience', 3, undefined],
  ['"to" range gives lower bound', '2 to 4 years of relevant experience', 2, undefined],
  ['number word', 'Five or more years of experience in finance', 5, undefined],
  ['at least + number word', 'At least six years of professional experience', 6, undefined],
  ['number word with digits in brackets', 'five (5) years of experience', 5, undefined],
  [
    'bullet without "experience" under a requirements heading',
    "What you'll bring\n6+ years building distributed systems\nStrong communication",
    6,
    undefined,
  ],
  ['minimum of', 'Minimum of 4 years in a similar role', 4, undefined],
  ['yrs abbreviation', '10+ yrs experience in sales', 10, undefined],
  ['singular year', '1 year of experience in customer support', 1, undefined],
  ['preferred-only gives null', 'Preferred qualifications\n5+ years of experience with Kubernetes', null, true],
  ['preferred inline gives null', '5+ years of experience with Rust is a plus', null, true],
  [
    'required beats preferred',
    'Requirements\n3+ years of experience\nPreferred qualifications\n7+ years of experience',
    3,
    undefined,
  ],
  ['BS/MS paths take the base path', '5+ years with a BS, 3+ years with an MS, or a PhD', 5, undefined],
  [
    'degree sentence takes the base path',
    "Bachelor's degree and 8 years of experience, or Master's degree and 6 years of experience",
    8,
    undefined,
  ],
  ['value above 30 is discarded', '40 years of combined experience on our leadership team', null, undefined],
  [
    'level-labelled requirements are ambiguous',
    'Senior Engineer: 5+ years of experience\nStaff Engineer: 10+ years of experience',
    10,
    true,
  ],
  ['experience without a number is ambiguous', 'Several years of experience in enterprise sales', null, true],
  ['empty text', '', null, false],
];

describe('extractMinYears', () => {
  it.each(cases)('years: %s', (_name, text, expectedValue, expectedAmbiguous) => {
    const result = extractMinYears(text);
    expect(result.value).toBe(expectedValue);
    if (expectedAmbiguous !== undefined) {
      expect(result.ambiguous).toBe(expectedAmbiguous);
    }
  });

  it('years: evidence is a substring of the input line', () => {
    const input = '3–5 years of experience in data engineering';
    const result = extractMinYears(input);
    expect(result.evidence).not.toBeNull();
    expect(result.evidence).toContain('3–5 years');
    const collapsed = input.replace(/\s+/g, ' ').trim();
    expect(collapsed).toContain(result.evidence);
    expect((result.evidence ?? '').length).toBeLessThanOrEqual(160);
  });
});
