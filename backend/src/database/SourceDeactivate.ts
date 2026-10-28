/**
 * @file Source Deactivation CLI Utility
 * @summary Emergency rollback CLI to deactivate all jobs for an ATS source (e.g. greenhouse) without affecting company status
 * @tags Database, Rollback, Deactivate, Multi-source, ATS, G6
 */

import { PrismaClient } from '@prisma/client';
import { parseAtsSources, toDbAts, AtsSource } from '../lib/ats/source';

export interface DeactivateSourceResult {
  source: AtsSource;
  dryRun: boolean;
  activeJobs: number;
  totalJobs: number;
  deactivatedCount: number;
}

/**
 * @summary Deactivates all active jobs for a specific ATS source while leaving company status unchanged
 */
export async function deactivateSource(options: {
  source: string;
  dryRun?: boolean;
  iKnow?: boolean;
  prismaClient?: PrismaClient;
}): Promise<DeactivateSourceResult> {
  const prisma = options.prismaClient ?? new PrismaClient();
  const shouldDisconnect = !options.prismaClient;

  try {
    let parsedSources: AtsSource[];
    try {
      parsedSources = parseAtsSources(options.source);
    } catch {
      throw new Error(`Invalid ATS source "${options.source}". Supported sources: ashby, greenhouse`);
    }

    if (parsedSources.length !== 1) {
      throw new Error('Exactly one ATS source must be specified for deactivation.');
    }

    const source = parsedSources[0];

    if (source === 'ashby' && !options.iKnow) {
      throw new Error('Refusing to deactivate primary source "ashby" without --i-know flag.');
    }

    const dbSource = toDbAts(source);

    const activeJobs = await prisma.job.count({
      where: { source: dbSource, active: true },
    });
    const totalJobs = await prisma.job.count({
      where: { source: dbSource },
    });

    if (options.dryRun) {
      console.log(
        `🔍 [DRY RUN] Would deactivate ${activeJobs} active jobs for source "${source}" (${totalJobs} total jobs exist). Company status remains unchanged.`
      );
      return {
        source,
        dryRun: true,
        activeJobs,
        totalJobs,
        deactivatedCount: 0,
      };
    }

    const updateRes = await prisma.job.updateMany({
      where: { source: dbSource, active: true },
      data: { active: false },
    });

    console.log(
      `✅ Deactivated ${updateRes.count} active jobs for source "${source}" (${totalJobs} total jobs exist). Company status remains unchanged.`
    );

    return {
      source,
      dryRun: false,
      activeJobs,
      totalJobs,
      deactivatedCount: updateRes.count,
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const iKnow = args.includes('--i-know');
  const sourceArg = args.find((a) => !a.startsWith('--'));

  if (!sourceArg) {
    console.error('❌ Usage: npm run source:deactivate -- <source> [--dry-run] [--i-know]');
    process.exit(1);
  }

  deactivateSource({
    source: sourceArg,
    dryRun,
    iKnow,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}
