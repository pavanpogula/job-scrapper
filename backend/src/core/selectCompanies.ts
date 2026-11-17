/**
 * @file Shared Company Selection & Lever Board Cap Helper
 * @summary Selects active companies per ATS source for both ClusterScraper coordinator and Scraper.runAll, applying the --lever-max-boards cap (oldest lastCheckedAt first)
 * @tags Core, Selection, Lever, Cap, Prisma, ADR-0022
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { AtsSource, toDbAts } from '../lib/ats/source';

export const DEFAULT_LEVER_MAX_BOARDS = 600;

/**
 * @summary Parses --lever-max-boards=N from CLI arguments, defaulting to 600
 */
export function parseLeverMaxBoards(argv: string[] = process.argv): number {
  const flag = argv.find((arg) => arg.startsWith('--lever-max-boards='));
  if (!flag) return DEFAULT_LEVER_MAX_BOARDS;
  const raw = flag.split('=')[1] ?? '';
  const parsed = parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    return parsed;
  }
  return DEFAULT_LEVER_MAX_BOARDS;
}

export interface SelectCompaniesOptions<S extends Prisma.CompanySelect> {
  sources: AtsSource[];
  statusFilter: Prisma.CompanyWhereInput['status'];
  explicitSlugs?: string[];
  leverMaxBoards?: number;
  select: S;
}

export interface SelectCompaniesResult<S extends Prisma.CompanySelect> {
  companies: Prisma.CompanyGetPayload<{ select: S }>[];
  leverAvailable: number;
  leverCap: number;
}

/**
 * @summary Selects companies to scrape for enabled ATS sources, capping Lever boards by oldest lastCheckedAt unless explicitSlugs are provided
 */
export async function selectCompanies<S extends Prisma.CompanySelect>(
  db: Pick<PrismaClient, 'company'>,
  options: SelectCompaniesOptions<S>
): Promise<SelectCompaniesResult<S>> {
  const leverCap = Math.max(1, options.leverMaxBoards ?? DEFAULT_LEVER_MAX_BOARDS);
  const enabledDbSources = options.sources.map(toDbAts);

  if (options.explicitSlugs) {
    const companies = (await db.company.findMany({
      where: {
        status: options.statusFilter,
        source: { in: enabledDbSources },
        slug: { in: options.explicitSlugs },
      },
      select: options.select,
    })) as Prisma.CompanyGetPayload<{ select: S }>[];

    const leverCount = companies.filter((c) => {
      const rec = c as Record<string, unknown>;
      return rec.source === 'LEVER';
    }).length;

    return {
      companies,
      leverAvailable: leverCount,
      leverCap,
    };
  }

  const nonLeverSources = options.sources.filter((s) => s !== 'lever');
  const includesLever = options.sources.includes('lever');

  let nonLeverCompanies: Prisma.CompanyGetPayload<{ select: S }>[] = [];
  if (nonLeverSources.length > 0) {
    nonLeverCompanies = (await db.company.findMany({
      where: {
        status: options.statusFilter,
        source: { in: nonLeverSources.map(toDbAts) },
      },
      select: options.select,
    })) as Prisma.CompanyGetPayload<{ select: S }>[];
  }

  let leverCompanies: Prisma.CompanyGetPayload<{ select: S }>[] = [];
  let leverAvailable = 0;

  if (includesLever) {
    const leverWhere: Prisma.CompanyWhereInput = {
      status: options.statusFilter,
      source: 'LEVER',
    };

    leverCompanies = (await db.company.findMany({
      where: leverWhere,
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      take: leverCap,
      select: options.select,
    })) as Prisma.CompanyGetPayload<{ select: S }>[];

    const countFn = (db.company as { count?: typeof db.company.count }).count;
    leverAvailable =
      typeof countFn === 'function'
        ? await countFn({ where: leverWhere })
        : leverCompanies.length;

    console.log(
      `📌 Lever: scraping ${leverCompanies.length} of ${leverAvailable} boards (cap ${leverCap})`
    );
  }

  return {
    companies: [...nonLeverCompanies, ...leverCompanies],
    leverAvailable,
    leverCap,
  };
}
