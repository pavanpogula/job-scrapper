/**
 * @file labels.ts
 * @summary Human-readable labels and formatting for ATS enums, workplace types, employment types, salary, and countries
 */

/**
 * Maps raw workplace type enum to a clean, human-readable label
 */
export function formatWorkplace(type?: string | null): string {
  if (!type) return '';
  switch (type) {
    case 'Remote':
      return 'Remote';
    case 'OnSite':
    case 'On-site':
    case 'Onsite':
      return 'On-site';
    case 'Hybrid':
      return 'Hybrid';
    default:
      return type;
  }
}

/**
 * Maps raw employment type enum to a clean, human-readable label
 */
export function formatEmployment(type?: string | null): string {
  if (!type) return '';
  switch (type) {
    case 'FullTime':
    case 'Full-time':
    case 'Full time':
      return 'Full-time';
    case 'PartTime':
    case 'Part-time':
    case 'Part time':
      return 'Part-time';
    case 'Contract':
      return 'Contract';
    case 'Intern':
    case 'Internship':
      return 'Internship';
    case 'Temporary':
    case 'Temp':
      return 'Temporary';
    default:
      return type;
  }
}

/**
 * Formats a salary amount with its currency symbol, compact: 140000 USD -> "$140K", 95000 EUR -> "€95K"
 */
const SYMBOL_TO_CODE: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };

function formatMoney(amount: number, currency: string | null | undefined): string {
  const raw = (currency || 'USD').trim();
  const code = SYMBOL_TO_CODE[raw] ?? raw.toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      notation: amount >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: amount >= 1000 ? 1 : 2,
    }).format(amount);
  } catch {
    // Not an ISO 4217 code (e.g. a symbol or free text from the source): keep it as a prefix
    return `${currency ?? ''}${amount.toLocaleString('en-US')}`;
  }
}

/**
 * Formats a salary range with currency symbol and optional interval
 * Example: "$140K–$180K/yr", "From €95K/yr", "$45/hr"
 */
export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  interval?: string | null
): string | null {
  if (!min && !max) return null;
  const inter = interval ? `/${interval.toLowerCase().replace('1 ', '').replace('year', 'yr').replace('hour', 'hr').replace('month', 'mo')}` : '';

  if (min && max) {
    if (min === max) return `${formatMoney(min, currency)}${inter}`;
    return `${formatMoney(min, currency)}–${formatMoney(max, currency)}${inter}`;
  }
  if (min) return `From ${formatMoney(min, currency)}${inter}`;
  if (max) return `Up to ${formatMoney(max, currency)}${inter}`;
  return null;
}

/**
 * Formats an ISO country code to localized full country name using Intl.DisplayNames
 */
export function formatCountryOption(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Maximum entries the API returns in CompanyProfile.locations (ADR-0019). */
export const PROFILE_TOP_N = 10;

/**
 * Labels a company's location count. The API returns only the top 10 locations, so a full list means "10+",
 * never an exact total. Example: 3 -> "3 locations", 10 -> "10+ locations"; with bare: 10 -> "10+".
 */
export function formatLocationCount(listed: number, options: { bare?: boolean } = {}): string {
  const value = listed >= PROFILE_TOP_N ? `${PROFILE_TOP_N}+` : String(listed);
  if (options.bare) return value;
  return listed === 1 ? '1 location' : `${value} locations`;
}
