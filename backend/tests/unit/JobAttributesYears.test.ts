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
    'spelled-out parenthetical range gives lower bound',
    'Four (4) years to seven (7) years of experience in systems engineering',
    4,
    false,
  ],
  [
    'spelled-out range repeating years gives lower bound',
    'Three years to five years of relevant professional experience',
    3,
    false,
  ],
  [
    'digit range repeating years gives lower bound',
    '4 years to 7 years of software development experience',
    4,
    false,
  ],
  [
    'between spelled-out range gives lower bound',
    'Between four (4) years and seven (7) years of experience',
    4,
    false,
  ],
  [
    'minimum age "years of age" is ignored',
    'Requirements\nMust be at least 16 years of age and authorized to work in the US',
    null,
    false,
  ],
  [
    '"years old" and "years or older" are ignored',
    'Minimum qualifications\nApplicants must be 18 years old (or 21 years or older for commercial driving roles)',
    null,
    false,
  ],
  [
    'age prefix "minimum age of 18 years" is ignored',
    'Requirements\nMinimum age of 18 years required for night-shift warehouse operations',
    null,
    false,
  ],
  [
    'all levels heading makes years low confidence',
    'Software Engineer - All Levels\nRequirements\n3+ years of backend engineering experience',
    3,
    true,
  ],
  [
    'hiring across multiple levels makes years low confidence',
    'We are hiring across all levels (Mid, Senior, Staff).\nRequirements\n4+ years of production Go or Rust experience',
    4,
    true,
  ],
  [
    'separate level qualification headings make years low confidence',
    'Qualifications for Engineer I\n2+ years of software experience\nQualifications for Senior Engineer\n7+ years of software experience',
    7,
    true,
  ],
  [
    'communicating with all levels of stakeholders stays high confidence',
    'Requirements\n5+ years of product management experience\nComfortable communicating with all levels of stakeholders and leadership',
    5,
    false,
  ],
  [
    'salary per year depending on experience stays high confidence with null years',
    'Base salary range: $120,000 - $150,000 per year, depending on experience.',
    null,
    false,
  ],
  [
    'company blurb years near experience stays high confidence with null years',
    'Founded 10 years ago to transform the developer experience.',
    null,
    false,
  ],
  [
    'hyphenated N-year near experience stays high confidence with null years',
    'Help shape our 5-year customer experience strategy.',
    null,
    false,
  ],
  [
    'age years near experience stays high confidence with null years',
    'Must be at least 18 years of age. Prior customer service experience welcome.',
    null,
    false,
  ],
  [
    'cross-line per year before Experience heading stays high confidence',
    'Benefits: 20 days paid time off per year.\nExperience\nStrong TypeScript and React skills',
    null,
    false,
  ],
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
