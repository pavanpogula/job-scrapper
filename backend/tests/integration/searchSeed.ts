/**
 * @file Search Integration Seed Data
 * @summary Hand-written companies, departments, locations and ~50 jobs covering the BF-020 search edge cases
 * @tags tests, search, seed, BF-020
 */

import type { ReferenceJob } from './searchReference';

export interface SeedCompany {
  slug: string;
  name: string | null;
}

export interface SeedJob extends ReferenceJob {
  companySlug: string;
  workplaceType: 'Remote' | 'Hybrid' | 'OnSite';
  employmentType: 'FullTime' | 'PartTime' | 'Contract' | 'Intern';
  country: string | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: Date | null;
}

export const SEED_COMPANIES: SeedCompany[] = [
  { slug: 'acme', name: 'Acme' },
  { slug: 'globex', name: 'Globex Corporation' },
  { slug: 'initech', name: 'Initech' },
  { slug: 'transferwise-labs', name: 'Transfer Labs' },
  { slug: 'senior-living', name: 'Senior Living Co' },
  { slug: 'nameless', name: null },
];

export const SEED_DEPARTMENTS = ['Engineering', 'Sales', 'Research & Development', 'Finance', 'Data_Platform'];

export const SEED_LOCATIONS = [
  'San Francisco, CA',
  'Remote - SF',
  'London, UK',
  'Zürich, Switzerland',
  'New York (Hybrid)',
  'Remote',
  '100% Remote',
];

type Spec = [title: string, company: string, department: string | null, location: string | null];

/** One row per job: [title, company slug, department, location]. Filters are derived from the index below. */
const SPECS: Spec[] = [
  ['Senior Software Engineer', 'acme', 'Engineering', 'San Francisco, CA'],
  ['Staff Senior Software Engineer', 'globex', 'Engineering', 'London, UK'],
  ['Engineer, Senior Platform', 'initech', 'Engineering', 'Remote'],
  ['Senior Engineer', 'acme', 'Engineering', 'Remote - SF'],
  ['Senior Accountant', 'globex', 'Finance', 'London, UK'],
  ['Software Engineer', 'initech', 'Engineering', 'New York (Hybrid)'],
  ['Engineering Manager', 'acme', 'Engineering', 'San Francisco, CA'],
  ['Senior Engineering Manager', 'globex', 'Engineering', 'Zürich, Switzerland'],
  ['Transfer Pricing Analyst', 'transferwise-labs', 'Finance', 'London, UK'],
  ['Account Executive', 'transferwise-labs', 'Sales', 'New York (Hybrid)'],
  ['Account Executive - SF', 'acme', 'Sales', 'San Francisco, CA'],
  ['C++ Developer', 'initech', 'Engineering', 'Remote'],
  ['C# Engineer', 'globex', 'Engineering', 'London, UK'],
  ['Node.js Engineer', 'acme', 'Engineering', 'Remote'],
  ['R&D Scientist', 'initech', 'Research & Development', 'Zürich, Switzerland'],
  ['Research Scientist', 'globex', 'Research & Development', 'London, UK'],
  ['Product Designer', 'acme', null, 'London, UK'],
  ['Senior Product Designer', 'globex', null, 'London, UK'],
  ['Designer (Contract)', 'initech', null, 'New York (Hybrid)'],
  ['Data Engineer', 'acme', 'Data_Platform', 'Remote'],
  ['data_engineer pipeline role', 'globex', 'Data_Platform', 'Remote'],
  ['Sales Development Representative', 'senior-living', 'Sales', 'New York (Hybrid)'],
  ['Care Coordinator', 'senior-living', null, 'New York (Hybrid)'],
  ['Backend Engineer', 'nameless', 'Engineering', '100% Remote'],
  ['Frontend Engineer', 'nameless', 'Engineering', null],
  ['Machine Learning Engineer', 'acme', 'Engineering', 'San Francisco, CA'],
  ['ML Engineer', 'globex', 'Engineering', 'Remote - SF'],
  ['Platform Engineer/SRE', 'initech', 'Engineering', 'Remote'],
  ['Site Reliability Engineer', 'acme', 'Engineering', 'Remote'],
  ['Senior Site Reliability Engineer', 'globex', 'Engineering', 'Zürich, Switzerland'],
  ['Financial Analyst', 'acme', 'Finance', 'New York (Hybrid)'],
  ['Senior Financial Analyst', 'initech', 'Finance', 'London, UK'],
  ['Engineer', 'transferwise-labs', 'Engineering', 'Remote'],
  ['"Quoted" Title Engineer', 'acme', 'Engineering', 'Remote'],
  ['Senior  Double  Space  Engineer', 'globex', 'Engineering', 'Remote'],
  ['Technical Writer', 'initech', null, 'Remote'],
  ['Customer Success Manager', 'acme', 'Sales', 'London, UK'],
  ['Senior Customer Success Manager', 'globex', 'Sales', 'San Francisco, CA'],
  ['Security Engineer', 'initech', 'Engineering', 'Zürich, Switzerland'],
  ['Engineer (Contract)', 'acme', 'Engineering', 'New York (Hybrid)'],
  ['Intern, Software Engineering', 'globex', 'Engineering', 'San Francisco, CA'],
  ['Senior Software Engineer', 'initech', 'Engineering', 'Remote'],
  // Hidden rows: must never appear in any result.
  ['Senior Software Engineer (inactive)', 'acme', 'Engineering', 'Remote'],
  ['Senior Software Engineer (unlisted)', 'globex', 'Engineering', 'Remote'],
];

const WORKPLACES = ['Remote', 'Hybrid', 'OnSite'] as const;
const EMPLOYMENTS = ['FullTime', 'FullTime', 'Contract', 'PartTime', 'Intern'] as const;
const COUNTRIES = ['US', 'GB', 'CH', null] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = Date.UTC(2026, 0, 1);

/**
 * @summary Builds the deterministic job rows; ids are stable UUIDs so failures name the same rows every run
 */
export function buildSeedJobs(): SeedJob[] {
  const companies = new Map(SEED_COMPANIES.map((c) => [c.slug, c.name]));
  return SPECS.map(([title, companySlug, departmentName, locationName], i) => {
    const workplaceType = WORKPLACES[i % WORKPLACES.length] ?? 'OnSite';
    const hasSalary = i % 3 !== 0;
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      title,
      companySlug,
      companyName: companies.get(companySlug) ?? null,
      departmentName,
      locationName,
      active: !title.includes('(inactive)'),
      isListed: !title.includes('(unlisted)'),
      workplaceType,
      employmentType: EMPLOYMENTS[i % EMPLOYMENTS.length] ?? 'FullTime',
      country: COUNTRIES[i % COUNTRIES.length] ?? null,
      isRemote: workplaceType === 'Remote',
      salaryMin: hasSalary ? 50_000 + (i % 7) * 25_000 : null,
      salaryMax: hasSalary ? 80_000 + (i % 7) * 25_000 : null,
      // Several rows share a timestamp and some have none, to exercise the sort tie-breakers.
      publishedAt: i % 5 === 4 ? null : new Date(BASE_TIME + (i % 6) * DAY_MS),
    };
  });
}
