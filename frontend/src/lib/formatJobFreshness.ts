/**
 * @file formatJobFreshness.ts
 * @summary Helper to compute user-facing job freshness labels, tooltips, and dateTime strings
 * @tags frontend, freshness, formatting, ui, dates
 */

import type { LastUpdatedSource } from '../types/api';

export interface FreshnessInput {
  publishedAt?: string | null;
  lastUpdatedAt?: string | null;
  lastUpdatedSource?: LastUpdatedSource | string | null;
}

export interface JobFreshness {
  label: string;
  tooltip?: string;
  dateTime: string;
}

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * @summary Formats relative duration or short absolute date from elapsed time
 * @param date Target date
 * @param now Reference timestamp (defaults to current time)
 */
function getRelativeDateString(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();

  // Clock skew into future or under 1 minute
  if (diffMs < 60 * 1000) {
    return 'just now';
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 30) {
    return `${days}d ago`;
  }

  return SHORT_DATE_FORMAT.format(date);
}

/**
 * @summary Computes the freshness display label, tooltip, and semantic dateTime for a job
 * @param job Job item or detail with optional publishedAt, lastUpdatedAt, and lastUpdatedSource
 * @param now Fixed reference time (defaults to new Date())
 * @returns Freshness presentation metadata, or null if no valid timestamp exists
 */
export function formatJobFreshness(
  job: FreshnessInput | null | undefined,
  now: Date = new Date()
): JobFreshness | null {
  if (!job) return null;

  const rawTimestamp = job.lastUpdatedAt ?? job.publishedAt;
  if (!rawTimestamp) return null;

  const primaryDate = new Date(rawTimestamp);
  if (isNaN(primaryDate.getTime())) return null;

  const relative = getRelativeDateString(primaryDate, now);
  const source = job.lastUpdatedSource ?? (job.lastUpdatedAt ? 'published' : (job.publishedAt ? 'published' : null));

  let label: string;
  let tooltip: string | undefined;

  if (source === 'detected' || source === 'ashby') {
    label = `Updated ${relative}`;
    if (job.publishedAt) {
      const pubDate = new Date(job.publishedAt);
      if (!isNaN(pubDate.getTime()) && pubDate.getTime() !== primaryDate.getTime()) {
        tooltip = `Posted ${SHORT_DATE_FORMAT.format(pubDate)}`;
      }
    }
  } else if (source === 'firstSeen') {
    label = `First seen ${relative}`;
  } else {
    // 'published' or fallback when source is missing
    label = `Posted ${relative}`;
  }

  return {
    label,
    ...(tooltip ? { tooltip } : {}),
    dateTime: primaryDate.toISOString(),
  };
}

/**
 * @summary Formats freshness string for the job detail header
 * @param job Job item or detail
 * @param now Reference timestamp
 */
export function formatDetailFreshness(
  job: FreshnessInput | null | undefined,
  now: Date = new Date()
): { text: string; dateTime: string } | null {
  const freshness = formatJobFreshness(job, now);
  if (!freshness || !job) return null;

  if (job.publishedAt && job.lastUpdatedAt) {
    const pubDate = new Date(job.publishedAt);
    const updatedDate = new Date(job.lastUpdatedAt);
    if (!isNaN(pubDate.getTime()) && !isNaN(updatedDate.getTime()) && pubDate.getTime() !== updatedDate.getTime()) {
      const pubFormatted = SHORT_DATE_FORMAT.format(pubDate);
      const updatedFormatted = SHORT_DATE_FORMAT.format(updatedDate);
      return {
        text: `Posted ${pubFormatted} · Updated ${updatedFormatted}`,
        dateTime: freshness.dateTime,
      };
    }
  }

  return {
    text: freshness.label,
    dateTime: freshness.dateTime,
  };
}

