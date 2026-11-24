/**
 * @file Raw SQL Job Attribute Writer
 * @summary Updates enrichment attribute columns via single-statement unnest SQL without mutating updatedAt (BF-027)
 * @tags enrichment, writer, prisma, sql, job-attributes, BF-027
 */

import { PrismaClient } from '@prisma/client';
import type { JobAttributes } from './types';
import { ATTRS_VERSION } from './version';

export interface AttributeWrite {
  id: string;
  attrs: JobAttributes;
  descHash: string;
  modelTried: boolean;
}

/**
 * @summary Persists a batch of enrichment results via raw UPDATE FROM unnest, guarding active and contentHash
 */
export async function writeAttributes(
  prisma: PrismaClient,
  rows: AttributeWrite[]
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const ids: string[] = [];
  const years: Array<number | null> = [];
  const clearance: boolean[] = [];
  const descHashes: string[] = [];
  const sources: string[] = [];
  const confidences: string[] = [];
  const evidence: string[] = [];
  const modelTried: boolean[] = [];

  for (const row of rows) {
    ids.push(row.id);
    years.push(row.attrs.experienceMinYears);
    clearance.push(row.attrs.clearanceRequired);
    descHashes.push(row.descHash);
    sources.push(row.attrs.source);
    confidences.push(row.attrs.confidence);
    evidence.push(JSON.stringify(row.attrs.evidence));
    modelTried.push(row.modelTried);
  }

  return prisma.$executeRaw`
    UPDATE "Job" AS j SET
      "experienceMinYears" = v.years,
      "clearanceRequired"  = v.clearance,
      "attrsVersion"       = ${ATTRS_VERSION}::int,
      "attrsDescHash"      = v.desc_hash,
      "attrsSource"        = v.source,
      "attrsConfidence"    = v.confidence,
      "attrsEvidence"      = v.evidence::jsonb,
      "attrsModelVersion"  = CASE WHEN v.model_tried THEN ${ATTRS_VERSION}::int ELSE NULL END
    FROM unnest(
      ${ids}::text[], ${years}::int[], ${clearance}::boolean[], ${descHashes}::text[],
      ${sources}::text[], ${confidences}::text[], ${evidence}::text[], ${modelTried}::boolean[]
    ) AS v(id, years, clearance, desc_hash, source, confidence, evidence, model_tried)
    WHERE j."id" = v.id
      AND j."active" = true
      AND j."contentHash" = v.desc_hash
  `;
}
