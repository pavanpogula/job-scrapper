/**
 * @file Shared ATS Place & Employment Type Heuristics
 * @summary Parses free-text job locations into structured country/region/city and infers employment type from job titles
 * @tags ATS, Location, Place, EmploymentType, Shared, ADR-0021, ADR-0022
 */

import { toIsoCountry } from '../Country';
import { sanitizeText } from '../Sanitizer';
import { NormalizedPostal } from './AtsClient';

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'district of columbia', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
  'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
  'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
  'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming',
];
const US_STATE_NAME_SET = new Set(US_STATE_NAMES);
const CA_PROVINCE_CODE_SET = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);
const US_MARKER_REGEX = /^(?:us|usa|u\.s\.a?\.?|united states)$/i;
const US_STATE_CODE_SET = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);
// Case-sensitive codes so the English word "us" never matches
export const US_TEXT_REGEX = /\b(?:[Uu]nited [Ss]tates|USA|US)\b|\bU\.S\./;

/**
 * @summary True when a place part is a US state: an upper-case 2-letter code ("CA", "IL") or a full state name
 */
function isUsState(part: string, allowName: boolean): boolean {
  if (US_STATE_CODE_SET.has(part)) return true;
  return allowName && US_STATE_NAME_SET.has(part.toLowerCase());
}

/**
 * @summary Parses a "City, Region, Country" style place string from the right into country, region and city.
 * A trailing US state ("Chicago, IL", "Atlanta, Georgia", "Alabama") maps to US — never to Canada, Israel or
 * the country Georgia — and "Remote …" parts are skipped so "US, Remote Zone 1" still resolves to US.
 */
export function parsePlace(text: string | null | undefined): {
  postal: NormalizedPostal | null;
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const empty = { postal: null, country: null, region: null, city: null };
  if (typeof text !== 'string') return empty;

  const parts = text
    .split(',')
    // "Remote - California" / "Remote (U.S.)" -> "California" / "U.S."
    .map((p) =>
      sanitizeText(p)
        .replace(/^remote\s*[-–:(]\s*/i, '')
        .replace(/\)$/, '')
        // US ZIP suffix: "NC - 27410" -> "NC", "TX 78701" -> "TX", a lone "10036" -> ""
        .replace(/\s*[-–]?\s*\b\d{5}(?:-\d{4})?\s*$/, '')
        .replace(/[\s.,–-]+$/, '')
        .trim()
    )
    .filter((p) => p.length > 0 && p.toLowerCase() !== 'n/a')
    // "Atlanta GA" / "Denver CO" / "Toronto ON" -> ["Atlanta", "GA"] so the region code is recognised
    .flatMap((p) => {
      const m = p.match(/^(.+?)\s+([A-Z]{2})$/);
      return m && (US_STATE_CODE_SET.has(m[2]) || CA_PROVINCE_CODE_SET.has(m[2])) ? [m[1], m[2]] : [p];
    });
  if (parts.length === 0) return empty;

  let country: string | null = null;
  let region: string | null = null;
  let countryIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (/\bremote\b/i.test(part) && i > 0) continue;
    // Full state names only count at the end of a short string ("Atlanta, Georgia"), so
    // "Tbilisi, Tbilisi, Georgia" style three-part strings keep their country.
    // "Remote, US, Georgia": a US marker right before it makes Georgia the state, not the country
    const afterUsMarker = i > 0 && US_MARKER_REGEX.test(parts[i - 1]);
    if (isUsState(part, parts.length <= 2 || i < parts.length - 1 || afterUsMarker)) {
      country = 'US';
      region = part;
      countryIdx = i;
      break;
    }
    if (CA_PROVINCE_CODE_SET.has(part)) {
      country = 'CA';
      region = part;
      countryIdx = i;
      break;
    }
    // "United Kingdom - Deliveroo" (company suffix) and "Sao Paulo / SP / Brazil" (slash list) also name a country
    const iso =
      toIsoCountry(part) ?? toIsoCountry(part.split(/\s+[-–]\s+/)[0]) ?? toIsoCountry(part.split(/\s*\/\s*/).pop());
    if (iso) {
      country = iso;
      countryIdx = i;
      break;
    }
    if (/\bremote\b/i.test(part)) continue;
    break;
  }

  if (countryIdx === -1) return empty;

  const before = parts.slice(0, countryIdx).filter((p) => !/^remote\b/i.test(p) && !US_MARKER_REGEX.test(p));
  if (!region && before.length >= 2) {
    region = before.slice(1).join(', ');
  }
  // Address-style parts ("Hawthorne at Friendly - 900 Hobbs Rd - Greensboro") keep only the last " - " segment.
  // With a matched US state the city is the part right before it ("1114 Avenue, NYC, NY" -> NYC).
  const rawCity =
    before.length === 0 ? null : region === parts[countryIdx] ? before[before.length - 1] : before[0];
  const city = rawCity ? (rawCity.split(/\s+[-–]\s+/).pop() ?? rawCity).trim() || null : null;

  const postal: NormalizedPostal = {};
  if (country) postal.addressCountry = country;
  if (region) postal.addressRegion = region;
  if (city) postal.addressLocality = city;
  return { postal, country, region, city };
}

/**
 * @summary Infers employmentType from job title when explicit ATS field is absent
 */
export function inferEmploymentTypeFromTitle(title: string): string | null {
  if (/\bintern(ship)?\b/i.test(title)) return 'Intern';
  if (/\bcontract(or)?\b/i.test(title)) return 'Contract';
  if (/\bpart[- ]time\b/i.test(title)) return 'PartTime';
  return null;
}
