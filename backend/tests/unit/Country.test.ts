/**
 * @file Country Normalization Unit Tests
 * @summary Tests ISO-3166 alpha-2 country code resolution, aliases, punctuation stripping, case-insensitivity, and unknown handling
 * @tags Unit Test, Country, ISO-3166, Normalization
 */

import { toIsoCountry } from '../../src/lib/Country';

describe('Country Normalization Unit Tests (P1-T15 / SCR-23)', () => {
    const testCases: Array<[string | undefined | null, string | null]> = [
        // Already valid ISO alpha-2 codes (upper and lower case)
        ['US', 'US'],
        ['us', 'US'],
        ['GB', 'GB'],
        ['gb', 'GB'],
        ['CA', 'CA'],
        ['ca', 'CA'],
        ['DE', 'DE'],
        ['de', 'DE'],
        ['FR', 'FR'],
        ['fr', 'FR'],
        ['IN', 'IN'],
        ['in', 'IN'],
        ['AU', 'AU'],
        ['au', 'AU'],
        ['JP', 'JP'],
        ['jp', 'JP'],
        ['ES', 'ES'],
        ['es', 'ES'],
        ['IT', 'IT'],
        ['it', 'IT'],
        ['NL', 'NL'],
        ['nl', 'NL'],
        ['CH', 'CH'],
        ['ch', 'CH'],
        ['SE', 'SE'],
        ['se', 'SE'],
        ['BR', 'BR'],
        ['br', 'BR'],
        ['SG', 'SG'],
        ['sg', 'SG'],
        ['IE', 'IE'],
        ['ie', 'IE'],
        ['IL', 'IL'],
        ['il', 'IL'],

        // US aliases & punctuation
        ['USA', 'US'],
        ['usa', 'US'],
        ['U.S.', 'US'],
        ['u.s.', 'US'],
        ['U.S.A.', 'US'],
        ['u.s.a.', 'US'],
        ['United States', 'US'],
        ['united states', 'US'],
        ['United States of America', 'US'],

        // UK aliases
        ['UK', 'GB'],
        ['uk', 'GB'],
        ['U.K.', 'GB'],
        ['United Kingdom', 'GB'],
        ['Great Britain', 'GB'],
        ['England', 'GB'],
        ['Scotland', 'GB'],
        ['Wales', 'GB'],

        // Germany & native names
        ['Germany', 'DE'],
        ['germany', 'DE'],
        ['Deutschland', 'DE'],
        ['deutschland', 'DE'],

        // Netherlands
        ['Netherlands', 'NL'],
        ['The Netherlands', 'NL'],
        ['Holland', 'NL'],

        // Switzerland
        ['Switzerland', 'CH'],
        ['Schweiz', 'CH'],

        // Spain & native names
        ['Spain', 'ES'],
        ['España', 'ES'],

        // Japan & native names
        ['Japan', 'JP'],
        ['Nippon', 'JP'],

        // Brazil
        ['Brazil', 'BR'],
        ['Brasil', 'BR'],

        // Sweden
        ['Sweden', 'SE'],
        ['Sverige', 'SE'],

        // Canada
        ['Canada', 'CA'],
        ['canada', 'CA'],

        // Invalid / unknown / empty
        ['', null],
        ['   ', null],
        [undefined, null],
        [null, null],
        ['UnknownLand', null],
        ['Remote', null],
        ['Worldwide', null],
        ['12345', null],
        ['XYZ', null]
    ];

    test(`satisfies all ${testCases.length} country normalization test cases (≥ 30 required)`, () => {
        expect(testCases.length).toBeGreaterThanOrEqual(30);

        for (const [input, expected] of testCases) {
            const result = toIsoCountry(input as string);
            expect(result).toBe(expected);
        }
    });
});
