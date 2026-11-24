/**
 * @file Enrichment Job Picker
 * @summary Keyset-paginated SQL picker and count helper with contentHash change detection (BF-027)
 * @tags enrichment, picker, prisma, sql, job-attributes, BF-027
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { getDescriptionText } from './text';
import { ATTRS_VERSION } from './version';
import type { PickedJob } from './step';
import type { AttrsConfidence } from './types';

export type { PickedJob } from './step';

interface PickedRow {
  id: string;
  title: string;
  contentHash: string;
  attrsConfidence: string | null;
  metadata: unknown;
}

interface CountRow {
  n: number;
}

/**
 * @summary Builds the shared SQL WHERE fragment for pickable active jobs inside function scope
 */
function pickableWhere(modelEnabled: boolean): Prisma.Sql {
  return Prisma.sql`
    j."active" = true
    AND (
      j."attrsVersion" IS NULL
      OR j."attrsVersion" < ${ATTRS_VERSION}
      OR j."attrsDescHash" IS DISTINCT FROM j."contentHash"
      OR (${modelEnabled}::boolean
          AND j."attrsConfidence" = 'low'
          AND (j."attrsModelVersion" IS NULL OR j."attrsModelVersion" < ${ATTRS_VERSION}))
    )
  `;
}

/**
 * @summary Normalizes database attrsConfidence values to the AttrsConfidence union or null
 */
function toAttrsConfidence(raw: string | null): AttrsConfidence | null {
  if (raw === 'high' || raw === 'low') {
    return raw;
  }
  return null;
}

/**
 * @summary Keyset-picks a batch of active jobs needing enrichment, projecting only the description key needed
 */
export async function pickJobsForEnrichment(
  prisma: PrismaClient,
  opts: { limit: number; afterId?: string; modelEnabled: boolean }
): Promise<PickedJob[]> {
  const afterId = opts.afterId ?? '';
  const whereClause = pickableWhere(opts.modelEnabled);

  const rows = await prisma.$queryRaw<PickedRow[]>`
    SELECT j."id", j."title", j."contentHash", j."attrsConfidence",
           CASE WHEN COALESCE(btrim(j."metadata"->>'descriptionPlain'), '') <> ''
                THEN jsonb_build_object('descriptionPlain', j."metadata"->'descriptionPlain')
                ELSE jsonb_build_object('descriptionHtml',  j."metadata"->'descriptionHtml')
           END AS "metadata"
    FROM "Job" j
    WHERE j."id" > ${afterId} AND ${whereClause}
    ORDER BY j."id" ASC
    LIMIT ${opts.limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    descriptionPlain: getDescriptionText(row.metadata),
    attrsConfidence: toAttrsConfidence(row.attrsConfidence),
    descHash: row.contentHash,
  }));
}

/**
 * @summary Counts all active jobs currently matching the picker selection criteria
 */
export async function countPickable(
  prisma: PrismaClient,
  opts: { modelEnabled: boolean }
): Promise<number> {
  const whereClause = pickableWhere(opts.modelEnabled);
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS "n" FROM "Job" j WHERE ${whereClause}
  `;
  return rows[0]?.n ?? 0;
}
