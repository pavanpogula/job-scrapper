/**
 * @file JobAttributesClearance.test.ts
 * @summary Unit regression table, false-friend grouping, evidence invariant, and lexicon tests for clearance rules
 * @tags unit, enrichment, rules, clearance, job-attributes, BF-026
 */

import {
  detectClearance,
  CLEARANCE_FALSE_FRIENDS,
  CLEARANCE_STRONG_PATTERNS,
  CLEARANCE_NON_US_PATTERNS,
  CLEARANCE_WEAK_PATTERNS,
  CLEARANCE_NEGATION,
  CLEARANCE_PREFERRED,
} from '../../src/enrichment/rules/clearance';

type ClearanceCase = [name: string, text: string, required: boolean, ambiguous: boolean | undefined];

const mainCases: ClearanceCase[] = [
  ['active Secret', 'Must have an active Secret clearance', true, false],
  ['obtain and maintain Top Secret', 'Ability to obtain and maintain a Top Secret clearance', true, false],
  ['TS/SCI with polygraph', 'Active TS/SCI with full-scope polygraph', true, false],
  ['eligible for DoD clearance', 'Must be eligible for a DoD security clearance', true, false],
  ['Public Trust', 'Public Trust required', true, false],
  ['polygraph alone', 'Willingness to undergo a polygraph examination', true, false],
  ['DOE Q clearance', 'An active DOE Q clearance is required', true, false],
  ['UK SC', 'You must hold or be able to obtain UK Security Check (SC) clearance', true, false],
  ['UK DV', 'Developed Vetting (DV) clearance required', true, false],
  ['UK BPSS', 'Successful candidates will undergo BPSS checks', true, false],
  ['NATO', 'NATO SECRET clearance required', true, false],
  ['Canadian Reliability', 'Must be able to obtain Government of Canada Reliability Status', true, false],
  ['Canadian Secret', 'Must hold a valid Canadian Secret clearance', true, false],
  ['Australian NV1', 'Must hold a current Australian Government NV1 security clearance', true, false],
  ['Australian Baseline', 'Ability to obtain a Baseline clearance', true, false],
  ['preferred clearance', 'Active Secret clearance preferred', true, true],
  ['negation: no clearance required', 'No security clearance required', false, false],
  ['negation: not required', 'Security clearance not required for this role', false, false],
  ['negation: beneficial but not required', 'A clearance is beneficial but not required', false, false],
  [
    'negation mixed with a requirement',
    'No clearance required to start.\nMust obtain a Secret clearance within 6 months',
    true,
    true,
  ],
  [
    'export control only',
    'This role requires access to export-controlled information (ITAR). Applicants must be U.S. persons.',
    false,
    false,
  ],
  ['no mention', 'We build developer tools.', false, false],
];

const falseFriendCases: ClearanceCase[] = [
  ['false friend: range clearance', 'Experience with range clearance procedures at test sites', false, undefined],
  ['false friend: low-clearance', 'Design low-clearance vehicle undercarriages', false, undefined],
  ['false friend: customs clearance', 'Prepare customs clearance documentation for imports', false, undefined],
  ['false friend: trade secret', 'Protect our trade secrets and IP', false, undefined],
  ['false friend: secret sauce', 'Our secret sauce is our people', false, undefined],
  ['false friend: SCIENCE', 'BS in COMPUTER SCIENCE required', false, undefined],
  ['false friend: polymer', 'Experience with polymer composites', false, undefined],
];

describe('detectClearance', () => {
  it.each(mainCases)('clearance: %s', (_name, text, expectedRequired, expectedAmbiguous) => {
    const result = detectClearance(text);
    expect(result.required).toBe(expectedRequired);
    if (expectedAmbiguous !== undefined) {
      expect(result.ambiguous).toBe(expectedAmbiguous);
    }
  });

  describe('clearance: false friends', () => {
    it.each(falseFriendCases)('clearance: %s', (_name, text, expectedRequired, expectedAmbiguous) => {
      const result = detectClearance(text);
      expect(result.required).toBe(expectedRequired);
      if (expectedAmbiguous !== undefined) {
        expect(result.ambiguous).toBe(expectedAmbiguous);
      }
    });
  });

  it('clearance: evidence is the matching sentence', () => {
    const input = 'Must have an active Secret clearance';
    const result = detectClearance(input);
    expect(result.evidence).not.toBeNull();
    expect(result.evidence).toContain('Secret clearance');
    expect(input.replace(/\s+/g, ' ').trim()).toContain(result.evidence);
    expect((result.evidence ?? '').length).toBeLessThanOrEqual(160);
  });

  it('clearance: lexicon constants are exported, frozen and stateless', () => {
    const arrays = [
      CLEARANCE_FALSE_FRIENDS,
      CLEARANCE_STRONG_PATTERNS,
      CLEARANCE_NON_US_PATTERNS,
      CLEARANCE_WEAK_PATTERNS,
    ];
    for (const arr of arrays) {
      expect(Object.isFrozen(arr)).toBe(true);
      for (const re of arr) {
        expect(re.global).toBe(false);
        expect(re.sticky).toBe(false);
      }
    }

    expect(CLEARANCE_NEGATION.global).toBe(false);
    expect(CLEARANCE_NEGATION.sticky).toBe(false);
    expect(CLEARANCE_PREFERRED.global).toBe(false);
    expect(CLEARANCE_PREFERRED.sticky).toBe(false);

    expect(CLEARANCE_NON_US_PATTERNS.some((r) => r.test('NV1'))).toBe(true);
    expect(CLEARANCE_FALSE_FRIENDS.some((r) => r.test('range clearance'))).toBe(true);
  });
});
