/**
 * @file Golden Set Scorer Helpers
 * @summary Precision and recall scorers matching DESIGN §6.6 and research evaluation definitions for unit tests
 * @tags test-helper, enrichment, golden-set, scoring, BF-026
 */

/** Precision and recall confusion-matrix summary. */
export interface Score {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
}

/**
 * @summary Computes precision and recall where wrong non-null years count as both FP and FN
 */
export function scoreYears(pairs: Array<{ gold: number | null; pred: number | null }>): Score {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const { gold, pred } of pairs) {
    if (gold === null && pred === null) {
      tn += 1;
    } else if (gold !== null && pred === null) {
      fn += 1;
    } else if (gold === null && pred !== null) {
      fp += 1;
    } else if (gold === pred) {
      tp += 1;
    } else {
      fp += 1;
      fn += 1;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall };
}

/**
 * @summary Computes binary precision and recall for security clearance predictions
 */
export function scoreClearance(pairs: Array<{ gold: boolean; pred: boolean }>): Score {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const { gold, pred } of pairs) {
    if (gold && pred) {
      tp += 1;
    } else if (!gold && pred) {
      fp += 1;
    } else if (gold && !pred) {
      fn += 1;
    } else {
      tn += 1;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { tp, fp, fn, tn, precision, recall };
}
