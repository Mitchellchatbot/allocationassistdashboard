/**
 * Marketing time trend — leads, qualified and conversions per day / week /
 * month, for the Marketing page's "Weekly Trend" card.
 *
 * Pure (no React, no Supabase) so the bucketing can be tested. Channel
 * attribution is passed in rather than re-implemented here, so the trend and
 * the channel table can never disagree about which channel a lead belongs to.
 */
import { bucketKey, bucketLabel, parseDate, type Granularity } from "@/lib/time-buckets";

// Same definition as the channel table: "Contact in Future" is a defer, not a
// qualification, so it deliberately doesn't count.
export const QUALIFIED_STATUSES = new Set(["Initial Sales Call Completed", "High Priority Follow up"]);

// Zoho only stores a lead's CURRENT status, not when it became qualified, so
// "qualified" here is a cohort figure — leads that arrived in the bucket and
// are qualified today. Recent cohorts haven't been worked yet and read low;
// buckets ending inside this window are flagged so nobody reads that as a drop.
export const QUALIFIED_MATURITY_DAYS = 21;

const DAY_MS = 86_400_000;

export interface TrendLead {
  Created_Time: string | null;
  Lead_Status: string | null;
  channel: string;
}

export interface TrendConversion {
  Created_Time: string | null;
  channel: string;
}

export interface TrendRow {
  key: string;
  label: string;
  /** First day of the bucket (local midnight). */
  start: Date;
  /** Last day of the bucket (local midnight, inclusive). */
  end: Date;
  leads: number;
  qualified: number;
  converted: number;
  /** Leads change vs the previous bucket; null for the first bucket. */
  leadsDelta: number | null;
  /** The bucket is cut by the date range or is still in progress — its counts cover fewer days. */
  partial: boolean;
  /** The bucket ended too recently for its qualified count to have settled. */
  maturing: boolean;
}

export interface TrendInput {
  leads: TrendLead[];
  conversions: TrendConversion[];
  from: Date;
  /** Inclusive end of the range (a day, as the date picker gives it). */
  to: Date;
  granularity: Granularity;
  /** Restrict to one channel; null = every channel. */
  channel?: string | null;
  now?: Date;
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function keyToStart(key: string, g: Granularity): Date {
  const [y, m, d] = key.split("-").map(Number);
  return g === "month" ? new Date(y, m - 1, 1) : new Date(y, m - 1, d);
}

// Built from calendar parts rather than adding milliseconds, so a DST shift in
// the viewer's timezone can't push a bucket boundary onto the wrong day.
function nextStart(start: Date, g: Granularity): Date {
  if (g === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + (g === "week" ? 7 : 1));
}

function lastDay(start: Date, g: Granularity): Date {
  const n = nextStart(start, g);
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
}

export function buildMarketingTrend(input: TrendInput): TrendRow[] {
  const { leads, conversions, from, to, granularity: g, channel = null } = input;
  const now = input.now ?? new Date();
  const fromMs = dayStart(from).getTime();
  const toMs = dayStart(to).getTime() + DAY_MS;      // exclusive, same as the channel table

  const counts = new Map<string, { leads: number; qualified: number; converted: number }>();
  const bump = (k: string) => {
    let c = counts.get(k);
    if (!c) { c = { leads: 0, qualified: 0, converted: 0 }; counts.set(k, c); }
    return c;
  };
  let firstMs = Infinity;
  const inWindow = (s: string | null, ch: string): Date | null => {
    if (channel && ch !== channel) return null;
    const d = parseDate(s);
    if (!d) return null;
    const t = d.getTime();
    if (t < fromMs || t >= toMs) return null;
    if (t < firstMs) firstMs = t;
    return d;
  };

  for (const l of leads) {
    const d = inWindow(l.Created_Time, l.channel);
    if (!d) continue;
    const c = bump(bucketKey(d, g));
    c.leads++;
    if (l.Lead_Status && QUALIFIED_STATUSES.has(l.Lead_Status)) c.qualified++;
  }
  for (const cv of conversions) {
    const d = inWindow(cv.Created_Time, cv.channel);
    if (d) bump(bucketKey(d, g)).converted++;
  }
  if (counts.size === 0) return [];

  // Fill the empty buckets between the first event and the end of the range —
  // a week with zero leads is a finding, and skipping it would make the bars
  // look evenly spaced when they aren't. The fill starts at the first event,
  // not the range start, because "All time" begins in the year 2000.
  const today = dayStart(now);
  const rangeEnd = dayStart(to) < today ? dayStart(to) : today;
  const lastKey = bucketKey(rangeEnd, g);
  const maturityCutoff = today.getTime() - QUALIFIED_MATURITY_DAYS * DAY_MS;

  const rows: TrendRow[] = [];
  let start = keyToStart(bucketKey(new Date(firstMs), g), g);
  let prevLeads: number | null = null;
  // Hard stop so a malformed range can never spin forever.
  for (let guard = 0; guard < 20_000; guard++) {
    const key = bucketKey(start, g);
    if (key > lastKey && !counts.has(key)) break;
    const end = lastDay(start, g);
    const c = counts.get(key) ?? { leads: 0, qualified: 0, converted: 0 };
    rows.push({
      key,
      label: bucketLabel(key, g),
      start,
      end,
      ...c,
      leadsDelta: prevLeads === null ? null : c.leads - prevLeads,
      partial: start.getTime() < fromMs || end.getTime() + DAY_MS > toMs || end.getTime() >= today.getTime(),
      maturing: end.getTime() > maturityCutoff,
    });
    prevLeads = c.leads;
    if (key >= lastKey) break;
    start = nextStart(start, g);
  }
  return rows;
}

export interface TrendSummary {
  totalLeads: number;
  totalQualified: number;
  totalConverted: number;
  /** Mean leads per bucket over complete buckets only — partial ones would drag it down. */
  avgLeads: number | null;
  /** Complete bucket with the most leads. */
  best: TrendRow | null;
}

export function summarizeTrend(rows: TrendRow[]): TrendSummary {
  const complete = rows.filter(r => !r.partial);
  const best = complete.reduce<TrendRow | null>((b, r) => (!b || r.leads > b.leads ? r : b), null);
  return {
    totalLeads: rows.reduce((s, r) => s + r.leads, 0),
    totalQualified: rows.reduce((s, r) => s + r.qualified, 0),
    totalConverted: rows.reduce((s, r) => s + r.converted, 0),
    avgLeads: complete.length ? complete.reduce((s, r) => s + r.leads, 0) / complete.length : null,
    best: best && best.leads > 0 ? best : null,
  };
}
