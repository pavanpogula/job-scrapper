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
 * Formats a salary range with currency and optional interval
 * Example: "$140k – $180k/yr" or "$140,000 / year"
 */
export function formatSalary(
  min?: number | null,
  max?: number | null,
  currency?: string | null,
  interval?: string | null
): string | null {
  if (!min && !max) return null;
  const curr = currency || '$';
  const formatNum = (num: number) => {
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return num.toLocaleString();
  };

  const inter = interval ? `/${interval.toLowerCase().replace('1 ', '').replace('year', 'yr').replace('hour', 'hr').replace('month', 'mo')}` : '';

  if (min && max) {
    if (min === max) return `${curr}${formatNum(min)}${inter}`;
    return `${curr}${formatNum(min)} – ${curr}${formatNum(max)}${inter}`;
  }
  if (min) return `From ${curr}${formatNum(min)}${inter}`;
  if (max) return `Up to ${curr}${formatNum(max)}${inter}`;
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
