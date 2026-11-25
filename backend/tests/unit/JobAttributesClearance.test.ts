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
  ['must hold an active clearance', 'Must hold an active clearance', true, false],
  ['active clearance required', 'Active clearance required', true, false],
  ['DoD clearance required', 'DoD clearance required', true, false],
  ['government clearance required', 'Government clearance is required', true, false],
  ['federal clearance preferred', 'Federal clearance preferred', true, true],
  ['interim clearance acceptable', 'Interim clearance acceptable', true, false],
  ['ability to obtain a clearance', 'Ability to obtain a clearance', true, false],
  ['obtain and maintain a clearance', 'Must be able to obtain and maintain a clearance', true, false],
  ['bare clearance required (weak/low confidence)', 'Clearance required for this role', true, true],
  ['full scope poly required', 'Full scope poly required', true, false],
  ['CI poly required', 'CI poly required', true, false],
  ['eligible for Public Trust or Secret', 'Must be eligible for Public Trust or Secret eligibility', true, false],
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
  ['false friend: poly-bag', 'Pack finished garments into a clear poly-bag for fulfillment', false, false],
  ['false friend: exact poly-bag', 'poly-bag', false, false],
  ['false friend: poly activité', 'Employé poly activité en magasin et logistique', false, false],
  ['false friend: exact poly activité', 'poly activité', false, false],
  [
    'false friend: bare poly in Cal Poly',
    'Graduated from Cal Poly with a BS in Engineering',
    false,
    false,
  ],
  [
    'false friend: background check clearance',
    'Employment is contingent upon a satisfactory background check clearance',
    false,
    false,
  ],
  [
    'false friend: criminal background check clearance',
    'Criminal background check clearance',
    false,
    false,
  ],
  [
    'false friend: fingerprinting clearance',
    'Must obtain FBI fingerprinting clearance prior to start date',
    false,
    false,
  ],
  [
    'false friend: child abuse register clearance',
    'Candidates must obtain PA Child Abuse Register clearance and state criminal clearances',
    false,
    false,
  ],
  [
    'false friend: customs clearance experience required',
    'Customs clearance experience required',
    false,
    false,
  ],
  [
    'false friend: regulatory clearance for medical devices',
    'Regulatory clearance for medical devices',
    false,
    false,
  ],
  ['false friend: clearance sale associate', 'Clearance sale associate', false, false],
  ['false friend: cleared the backlog verb', 'We cleared the backlog quickly', false, false],
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
