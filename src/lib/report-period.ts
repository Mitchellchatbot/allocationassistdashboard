/**
 * Period math for the Reports page.
 *
 * The page used to take a free-form "last N days" range plus three filter
 * dropdowns. It now reads one calendar period at a time — a week, a month, or
 * a rolling 12 months — and steps through them with the side arrows. `offset`
 * is how many periods back from the current one (0 = now, -1 = the one
 * before, …); it is never positive, since there is nothing to report ahead of
 * today.
 *
 * Every range returned here follows the app-wide convention used by
 * `inRange` in placement-reporting: `from` is local midnight of the first day
 * and `to` is local midnight of the LAST day (the window runs to end-of-day).
 */
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";
import { STAGES, stageAt, inRange, startOfWeek, type DateRange, type StageKey } from "@/lib/placement-reporting";

export type Period = "weekly" | "monthly" | "yearly";

export const PERIODS: Period[] = ["weekly", "monthly", "yearly"];

export const PERIOD_WORD: Record<Period, "week" | "month" | "year"> = {
  weekly: "week", monthly: "month", yearly: "year",
};

export function isPeriod(v: unknown): v is Period {
  return v === "weekly" || v === "monthly" || v === "yearly";
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const midnight = (d: Date) => { const o = new Date(d); o.setHours(0, 0, 0, 0); return o; };
const addDays  = (d: Date, n: number) => { const o = new Date(d); o.setDate(o.getDate() + n); return o; };
/**
 * A month is whole weeks, not calendar days.
 *
 * The team works Sunday to Saturday and counts a week in the month its Sunday
 * falls in, so August 2026 opens on Sunday 2 August and closes on Saturday
 * 5 September. The week ending Saturday 1 August began on 26 July and belongs
 * to July — reading it as August is what made August look 34 rows short when
 * it wasn't. Checked across nine months against the team's tracker, this rule
 * brings the year to within 8 rows of 2,024, and August to 209 against 211.
 *
 * monthStart: the first Sunday of the month `n` months from `d`.
 * monthEnd:   the Saturday closing the week that the month's last Sunday opens.
 */
const monthStart = (d: Date, n = 0) => {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  // getDay() 0 = Sunday, so this stays put when the 1st is itself a Sunday.
  first.setDate(first.getDate() + ((7 - first.getDay()) % 7));
  return midnight(first);
};
const monthEnd = (d: Date, n = 0) => {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0);   // last calendar day
  const lastSunday = new Date(last);
  lastSunday.setDate(last.getDate() - last.getDay());                // back to its Sunday
  return midnight(addDays(lastSunday, 6));                           // that week's Saturday
};

export const shortDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
export const monthLabel = (d: Date, long = false) =>
  `${(long ? MONTHS_LONG : MONTHS_SHORT)[d.getMonth()]} ${d.getFullYear()}`;
export { MONTHS_SHORT };

/**
 * The window for `period` stepped `offset` periods back from the one
 * containing `now`.
 *   weekly  — Monday → Sunday
 *   monthly — calendar month
 *   yearly  — rolling 12 calendar months ending with the current month
 */
export function periodRange(period: Period, offset: number, now: Date = new Date()): DateRange {
  if (period === "weekly") {
    const from = addDays(startOfWeek(now), offset * 7);
    return { from, to: addDays(from, 6) };
  }
  if (period === "monthly") {
    return { from: monthStart(now, offset), to: monthEnd(now, offset) };
  }
  const endMonth = offset * 12;
  return { from: monthStart(now, endMonth - 11), to: monthEnd(now, endMonth) };
}

/** Human labels for a period. */
export function periodLabels(period: Period, offset: number, now: Date = new Date()) {
  const r = periodRange(period, offset, now);
  const word = PERIOD_WORD[period];
  const rel =
    offset === 0  ? (period === "yearly" ? "Last 12 months" : `This ${word}`) :
    offset === -1 ? (period === "yearly" ? "The 12 before" : `Last ${word}`) :
    `${-offset} ${word}s ago`;
  let label: string, phrase: string, lead: string;
  if (period === "weekly") {
    label  = `${shortDate(r.from)} – ${shortDate(r.to)} ${r.to.getFullYear()}`;
    phrase = `the week of ${shortDate(r.from)}`;
    lead   = offset === 0 ? "This week" : `In the week of ${shortDate(r.from)}`;
  } else if (period === "monthly") {
    label  = monthLabel(r.from, true);
    phrase = label;
    lead   = offset === 0 ? "This month" : `In ${MONTHS_LONG[r.from.getMonth()]}`;
  } else {
    // A month now closes on a Saturday that can fall in the next month, so the
    // label names the month the window belongs to rather than the day it ends.
    const endMonth = new Date(now.getFullYear(), now.getMonth() + offset * 12, 1);
    label  = `${monthLabel(r.from)} – ${monthLabel(endMonth)}`;
    phrase = `the 12 months to ${monthLabel(endMonth, true)}`;
    lead   = offset === 0 ? "Over the last 12 months" : `In the 12 months to ${monthLabel(endMonth)}`;
  }
  return { range: r, word, rel, label, phrase, lead };
}

/**
 * How many periods back from `now` the period containing `date` is — the
 * inverse of `periodRange`. Used to find how far back the data goes.
 */
export function offsetOf(period: Period, date: Date, now: Date = new Date()): number {
  if (period === "weekly") {
    const diff = startOfWeek(date).getTime() - startOfWeek(now).getTime();
    return Math.round(diff / (7 * 86_400_000)) || 0;
  }
  // A month is whole weeks, so which month a date belongs to is decided by the
  // Sunday that opens its week — 1 September 2026 is a Tuesday in the week
  // opening Sunday 30 August, and so counts in August.
  const a = startOfWeek(date), b = startOfWeek(now);
  const months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (period === "monthly") return months;
  // Rolling years: months 0..-11 are the current window, -12..-23 the one before, …
  // (`|| 0` folds the -0 that negating a zero quotient produces.)
  return months >= 0 ? 0 : -Math.floor(-months / 12) || 0;
}

/**
 * The trend chart's buckets: 12 weeks (weekly) or 12 months (monthly/yearly),
 * ending with the current bucket — or with the selected one, when the
 * selection has been stepped further back than the window reaches. For
 * yearly, the buckets are that year's own 12 months.
 */
export interface TrendWindow {
  unit:     "week" | "month";
  buckets:  DateRange[];
  labels:   string[];
  /** Long label per bucket, for tooltips. */
  titles:   string[];
  /** Index of the selected period's bucket inside `buckets`, or null (yearly). */
  selected: number | null;
}

export function trendWindow(period: Period, offset: number, now: Date = new Date(), size = 12): TrendWindow {
  const unit = period === "weekly" ? "week" : "month";
  const selOffset = period === "yearly" ? offset * 12 : offset;
  const endOffset = period === "yearly" || selOffset <= -size ? selOffset : 0;
  const buckets: DateRange[] = [], labels: string[] = [], titles: string[] = [];
  for (let i = size - 1; i >= 0; i--) {
    const r = periodRange(unit === "week" ? "weekly" : "monthly", endOffset - i, now);
    buckets.push(r);
    if (unit === "week") {
      labels.push(shortDate(r.from));
      titles.push(`Week of ${shortDate(r.from)} ${r.from.getFullYear()}`);
    } else {
      labels.push(MONTHS_SHORT[r.from.getMonth()]);
      titles.push(monthLabel(r.from, true));
    }
  }
  const selected = period === "yearly" ? null : size - 1 - (endOffset - selOffset);
  return { unit, buckets, labels, titles, selected };
}

/** The same buckets one year earlier (52 weeks / 12 months), for the dashed comparison line. */
export function yearEarlier(buckets: DateRange[], unit: "week" | "month"): DateRange[] {
  return buckets.map(b => unit === "week"
    ? { from: addDays(b.from, -364), to: addDays(b.to, -364) }
    : { from: monthStart(b.from, -12), to: monthEnd(b.from, -12) });
}

/** The four stages the summary and trend track. "Relocated" falls back to the join date. */
export const TRACKED = ["shortlisted", "interviewed", "signed", "relocated"] as const satisfies ReadonlyArray<StageKey>;
export type TrackedKey = (typeof TRACKED)[number];

/**
 * Distinct doctors per stage per bucket. One pass over the attempts; buckets
 * never overlap, so each milestone lands in at most one.
 */
export function countByBuckets(
  attempts: PlacementAttempt[],
  buckets: DateRange[],
  keys: ReadonlyArray<StageKey> = TRACKED,
): Record<StageKey, number[]> {
  const out = {} as Record<StageKey, number[]>;
  if (buckets.length === 0) { for (const k of keys) out[k] = []; return out; }
  const sets = new Map<StageKey, Set<string>[]>(keys.map(k => [k, buckets.map(() => new Set<string>())]));
  const lo = buckets[0].from.getTime(), hi = buckets[buckets.length - 1].to.getTime() + 86_400_000;
  const stages = STAGES.filter(s => keys.includes(s.key));
  for (const a of attempts) {
    for (const s of stages) {
      const t = stageAt(a, s);
      if (t == null || t < lo || t >= hi) continue;
      const i = buckets.findIndex(b => inRange(t, b));
      if (i >= 0) sets.get(s.key)![i].add(a.doctor_id);
    }
  }
  for (const k of keys) out[k] = sets.get(k)!.map(s => s.size);
  return out;
}

/** Distinct doctors per stage inside one range — the bucket math for a single window. */
export function countInRange(attempts: PlacementAttempt[], range: DateRange, keys: ReadonlyArray<StageKey> = TRACKED) {
  const c = countByBuckets(attempts, [range], keys);
  return Object.fromEntries(keys.map(k => [k, c[k][0] ?? 0])) as Record<StageKey, number>;
}

/** Earliest milestone across all attempts — the oldest period worth offering. */
export function earliestMilestone(attempts: PlacementAttempt[]): Date | null {
  let min: number | null = null;
  for (const a of attempts) {
    for (const s of STAGES) {
      const t = stageAt(a, s);
      if (t != null && (min == null || t < min)) min = t;
    }
  }
  return min == null ? null : midnight(new Date(min));
}

/** Whole days from `a` to `b`; never negative. */
export function daysBetween(a: number, b: number): number {
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}
