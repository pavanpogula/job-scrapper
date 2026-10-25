/**
 * @file ISO-3166 alpha-2 country code resolution and normalization
 * @summary Normalizes country names, aliases, and ISO codes to standard 2-letter uppercase codes
 * @tags Country, ISO-3166, Normalization, Sanitization
 */

const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

const validIsoCodes = new Set<string>();
const countryNameToCode = new Map<string, string>();

/**
 * @summary Cleans and normalizes country string by lowercasing, stripping diacritics, and trimming punctuation
 * @param text Raw country string
 * @returns Cleaned normalized key
 */
function cleanKey(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Strip diacritics (e.g. España -> espana)
        .replace(/[^a-z0-9]/g, ' ')      // Replace punctuation with space
        .replace(/\s+/g, ' ')
        .trim();
}

// Pre-populate all standard ISO-3166 alpha-2 country codes and their standard English names
for (let c1 = 65; c1 <= 90; c1++) {
    for (let c2 = 65; c2 <= 90; c2++) {
        const code = String.fromCharCode(c1, c2);
        try {
            const name = displayNames.of(code);
            if (name && name !== code && !name.toLowerCase().includes('unknown')) {
                validIsoCodes.add(code);
                countryNameToCode.set(cleanKey(name), code);
            }
        } catch {
            // Ignore unsupported codes
        }
    }
}

// Exceptionally reserved non-standard codes that should map to standard alpha-2
validIsoCodes.delete('UK'); // ISO-3166-1 alpha-2 for United Kingdom is GB

// Common aliases, colloquialisms, native names, and common abbreviations
const ALIASES: Record<string, string> = {
    usa: 'US',
    us: 'US',
    'u s': 'US',
    'united states': 'US',
    'united states of america': 'US',
    uk: 'GB',
    'u k': 'GB',
    'united kingdom': 'GB',
    'great britain': 'GB',
    england: 'GB',
    scotland: 'GB',
    wales: 'GB',
    germany: 'DE',
    deutschland: 'DE',
    netherlands: 'NL',
    'the netherlands': 'NL',
    holland: 'NL',
    switzerland: 'CH',
    schweiz: 'CH',
    suisse: 'CH',
    svizzera: 'CH',
    spain: 'ES',
    espana: 'ES',
    japan: 'JP',
    nippon: 'JP',
    nihon: 'JP',
    brazil: 'BR',
    brasil: 'BR',
    sweden: 'SE',
    sverige: 'SE',
    canada: 'CA',
    france: 'FR',
    italy: 'IT',
    italia: 'IT',
    india: 'IN',
    australia: 'AU',
    singapore: 'SG',
    ireland: 'IE',
    israel: 'IL'
};

for (const [alias, code] of Object.entries(ALIASES)) {
    countryNameToCode.set(cleanKey(alias), code);
}

/**
 * @summary Converts raw country name, abbreviation, or ISO code into standard ISO-3166 alpha-2 code
 * @param raw Input string from Ashby posting or database row
 * @returns 2-letter uppercase ISO code or null if unresolvable
 */
export function toIsoCountry(raw: string | undefined | null): string | null {
    if (!raw || typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Fast check for 2-letter code
    const strippedCode = trimmed.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (strippedCode.length === 2 && validIsoCodes.has(strippedCode)) {
        return strippedCode;
    }

    // Check stripped compact alphanumeric (e.g., U.S.A. -> usa, U.K. -> uk)
    const compactKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedCompact = countryNameToCode.get(compactKey);
    if (matchedCompact) return matchedCompact;

    const key = cleanKey(trimmed);
    if (!key) return null;

    const matched = countryNameToCode.get(key);
    if (matched) return matched;

    return null;
}
