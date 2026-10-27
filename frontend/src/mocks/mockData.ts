import { JobListItem, JobDetail, FacetsData } from '../types/api';

export const MOCK_JOBS: JobListItem[] = [
  {
    id: 'job-1',
    ashbyId: '7fe8abc1-deel-sr-fe',
    source: 'ashby',
    externalId: '7fe8abc1-deel-sr-fe',
    title: 'Senior Frontend Engineer, Design Systems',
    applyUrl: 'https://jobs.ashbyhq.com/deel/7fe8abc1/application',
    companySlug: 'deel',
    companyName: 'Deel',
    companyLogoUrl: 'https://cdn.ashbyhq.com/org/deel/logo.png',
    department: 'Engineering',
    location: 'Remote (Worldwide)',
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    lastUpdatedSource: 'detected',
    salaryMin: 140000,
    salaryMax: 185000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'job-2',
    ashbyId: '992b1a8-1pwd-staff-sec',
    source: 'ashby',
    externalId: '992b1a8-1pwd-staff-sec',
    title: 'Staff Security Engineer, Application Security',
    applyUrl: 'https://jobs.ashbyhq.com/1password/992b1a8/application',
    companySlug: '1password',
    companyName: '1Password',
    companyLogoUrl: 'https://cdn.ashbyhq.com/org/1password/logo.png',
    department: 'Security',
    location: 'Remote (Canada / US)',
    country: 'CA',
    region: 'ON',
    city: 'Toronto',
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    lastUpdatedSource: 'ashby',
    salaryMin: 180000,
    salaryMax: 240000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'job-3',
    ashbyId: 'c1209e4-ramp-prod-eng',
    source: 'ashby',
    externalId: 'c1209e4-ramp-prod-eng',
    title: 'Product Engineer, Core Payments',
    applyUrl: 'https://jobs.ashbyhq.com/ramp/c1209e4/application',
    companySlug: 'ramp',
    companyName: 'Ramp',
    companyLogoUrl: 'https://cdn.ashbyhq.com/org/ramp/logo.png',
    department: 'Engineering',
    location: 'New York, NY',
    country: 'US',
    region: 'NY',
    city: 'New York',
    isRemote: false,
    workplaceType: 'Hybrid',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    lastUpdatedSource: 'published',
    salaryMin: 165000,
    salaryMax: 210000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: 'job-4',
    ashbyId: 'd48291a-notion-infra',
    source: 'ashby',
    externalId: 'd48291a-notion-infra',
    title: 'Site Reliability & Infrastructure Architect',
    applyUrl: 'https://jobs.ashbyhq.com/notion/d48291a/application',
    companySlug: 'notion',
    companyName: 'Notion',
    companyLogoUrl: 'https://cdn.ashbyhq.com/org/notion/logo.png',
    department: 'Infrastructure',
    location: 'San Francisco, CA',
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    isRemote: false,
    workplaceType: 'OnSite',
    employmentType: 'FullTime',
    publishedAt: null,
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    lastUpdatedSource: 'firstSeen',
    salaryMin: 210000,
    salaryMax: 280000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
  },
  {
    id: 'job-5',
    ashbyId: 'e81039f-linear-prod-des',
    source: 'ashby',
    externalId: 'e81039f-linear-prod-des',
    title: 'Senior Product Designer',
    applyUrl: 'https://jobs.ashbyhq.com/linear/e81039f/application',
    companySlug: 'linear',
    companyName: 'Linear',
    companyLogoUrl: 'https://cdn.ashbyhq.com/org/linear/logo.png',
    department: 'Design',
    location: 'Remote (Americas / EMEA)',
    country: 'GB',
    region: 'ENG',
    city: 'London',
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    lastUpdatedSource: 'published',
    salaryMin: 150000,
    salaryMax: 190000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'job-gh-1',
    ashbyId: 'greenhouse:4892104',
    source: 'greenhouse',
    externalId: '4892104',
    title: 'Staff Platform Engineer, Developer Experience',
    applyUrl: 'https://job-boards.greenhouse.io/figma/jobs/4892104',
    companySlug: 'gh--figma',
    companyName: 'Figma',
    companyLogoUrl: null,
    department: 'Infrastructure',
    location: 'San Francisco, CA',
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    isRemote: true,
    workplaceType: 'Remote',
    employmentType: 'FullTime',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    lastUpdatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    lastUpdatedSource: 'published',
    salaryMin: 195000,
    salaryMax: 260000,
    salaryCurrency: 'USD',
    salaryInterval: '1 YEAR',
    isListed: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
];

export const MOCK_JOB_DETAIL: JobDetail = {
  ...MOCK_JOBS[0],
  active: true,
  jobUrl: 'https://jobs.ashbyhq.com/deel/7fe8abc1-deel-sr-fe',
  team: 'Design Systems & Core Experience',
  descriptionPlain: `About Deel:
Deel is the all-in-one payroll and compliance solution for remote teams worldwide.

About the Role:
We are looking for a Senior Frontend Engineer to lead our Design Systems engineering initiatives. You will work across teams to elevate frontend quality, accessibility, performance, and craftsmanship.

Key Responsibilities:
- Architect, build, and maintain our multi-platform component library.
- Partner with Product Designers to refine design tokens and interactive behaviors.
- Ensure strict WCAG 2.1 AA accessibility compliance across our product surface.
- Write thorough documentation, tests, and interactive Storybook examples.

Requirements:
- 5+ years of production experience with TypeScript, React, and modern CSS.
- Proven track record crafting design systems and accessible UI components.
- Passion for user experience, typography, animations, and micro-interactions.`,
  descriptionHtml: `<h3>About Deel</h3>
<p>Deel is the all-in-one payroll and compliance solution for remote teams worldwide.</p>
<h3>About the Role</h3>
<p>We are looking for a <strong>Senior Frontend Engineer</strong> to lead our Design Systems engineering initiatives. You will work across teams to elevate frontend quality, accessibility, performance, and craftsmanship.</p>
<h3>Key Responsibilities</h3>
<ul>
  <li>Architect, build, and maintain our multi-platform component library.</li>
  <li>Partner with Product Designers to refine design tokens and interactive behaviors.</li>
  <li>Ensure strict WCAG 2.1 AA accessibility compliance across our product surface.</li>
  <li>Write thorough documentation, tests, and interactive Storybook examples.</li>
</ul>
<h3>Requirements</h3>
<ul>
  <li>5+ years of production experience with TypeScript, React, and modern CSS.</li>
  <li>Proven track record crafting design systems and accessible UI components.</li>
  <li>Passion for user experience, typography, animations, and micro-interactions.</li>
</ul>`,
  secondaryLocations: ['Remote (Worldwide)'],
  companyJobCount: 42,
  company: {
    slug: 'deel',
    name: 'Deel',
    logoUrl: 'https://cdn.ashbyhq.com/org/deel/logo.png',
    source: 'ashby',
    boardUrl: 'https://jobs.ashbyhq.com/deel',
  }
};

export const MOCK_GREENHOUSE_JOB_DETAIL: JobDetail = {
  ...MOCK_JOBS[5],
  active: true,
  jobUrl: 'https://job-boards.greenhouse.io/figma/jobs/4892104',
  team: 'Core Platform & DX',
  descriptionPlain: `About Figma:
Figma is the leading collaborative design platform.

About the Role:
We are looking for a Staff Platform Engineer to lead developer velocity and platform engineering.`,
  descriptionHtml: `<h3>About Figma</h3>
<p>Figma is the leading collaborative design platform.</p>
<h3>About the Role</h3>
<p>We are looking for a <strong>Staff Platform Engineer</strong> to lead developer velocity and platform engineering.</p>`,
  secondaryLocations: ['New York, NY'],
  companyJobCount: 18,
  company: {
    slug: 'gh--figma',
    name: 'Figma',
    logoUrl: null,
    source: 'greenhouse',
    boardUrl: 'https://job-boards.greenhouse.io/figma',
  },
};

export const MOCK_FACETS: FacetsData = {
  sources: [
    { value: 'ashby', count: 5 },
    { value: 'greenhouse', count: 1 },
  ],
  workplaceTypes: [
    { value: 'Remote', count: 10633 },
    { value: 'OnSite', count: 9917 },
    { value: 'Hybrid', count: 8697 },
  ],
  employmentTypes: [
    { value: 'FullTime', count: 31881 },
    { value: 'Contract', count: 1217 },
    { value: 'PartTime', count: 501 },
    { value: 'Intern', count: 359 },
    { value: 'Temporary', count: 79 },
  ],
  countries: [
    { value: 'US', count: 18450 },
    { value: 'GB', count: 3200 },
    { value: 'CA', count: 2150 },
    { value: 'DE', count: 1800 },
    { value: 'FR', count: 1100 },
  ],
  departments: [
    { value: 'Engineering', count: 14200 },
    { value: 'Product', count: 3400 },
    { value: 'Design', count: 1850 },
    { value: 'Marketing', count: 2100 },
    { value: 'Sales', count: 4800 },
    { value: 'Operations', count: 2600 },
  ],
  hasSalary: { yes: 13686, no: 20351 },
};
