/**
 * Day-of-week breakdown for the Marketing page — which weekday brings the
 * most leads, qualified leads and conversions.
 *
 * Pure (no React, no Supabase) so it can be tested. Channel attribution is
 * passed in rather than re-implemented here, so the channel filter counts
 * exactly the leads the channel table does.
 */
import { parseDate } from "@/lib/time-buckets";

// Same definition as the channel table: "Contact in Future" is a defer, not a
// qualification, so it deliberately doesn't count.
export const QUALIFIED_STATUSES = new Set(["Initial Sales Call Completed", "High Priority Follow up"]);

const DAY_MS = 86_400_000;
// Monday first — the UAE working week.
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface TrendLead {
  Created_Time: string | null;
  Lead_Status: string | null;
  channel: string;
}

export interface TrendConversion {
  Created_Time: string | null;
  channel: string;
}

export interface WeekdayRow {
  /** 0 = Monday … 6 = Sunday. */
  index: number;
  day: string;
  /** How many of this weekday fall in the range — the divisor for the averages. */
  occurrences: number;
  leads: number;
  qualified: number;
  converted: number;
  avgLeads: number;
  avgQualified: number;
  avgConverted: number;
}

export interface WeekdayInput {
  leads: TrendLead[];
  conversions: TrendConversion[];
  from: Date;
  /** Inclusive end of the range (a day, as the date picker gives it). */
  to: Date;
  /** Restrict to one channel; null = every channel. */
  channel?: string | null;
  now?: Date;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface DayCounts { leads: number; qualified: number; converted: number }

interface DailyTally {
  byDay: Map<string, DayCounts>;
  /** First and last day that count — see the comment in tallyByDay. */
  first: Date;
  last: Date;
}

// One per-day tally feeds both the weekday averages and the calendar, so the
// calendar's Average row can never disagree with the "best day" tiles.
function tallyByDay(input: WeekdayInput): DailyTally | null {
  const { leads, conversions, from, to, channel = null } = input;
  const fromMs = dayStart(from).getTime();
  const toMs = dayStart(to).getTime() + DAY_MS;      // exclusive, same as the channel table

  const byDay = new Map<string, DayCounts>();
  const bump = (d: Date) => {
    const k = dayKey(d);
    let c = byDay.get(k);
    if (!c) { c = { leads: 0, qualified: 0, converted: 0 }; byDay.set(k, c); }
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
    const c = bump(d);
    c.leads++;
    if (l.Lead_Status && QUALIFIED_STATUSES.has(l.Lead_Status)) c.qualified++;
  }
  for (const cv of conversions) {
    const d = inWindow(cv.Created_Time, cv.channel);
    if (d) bump(d).converted++;
  }
  if (firstMs === Infinity) return null;

  // Days count from the first event rather than the range start, because
  // "All time" begins in the year 2000, and stop at today.
  const today = dayStart(input.now ?? new Date());
  return { byDay, first: dayStart(new Date(firstMs)), last: dayStart(to) < today ? dayStart(to) : today };
}

export function buildWeekdayStats(input: WeekdayInput): WeekdayRow[] {
  const tally = tallyByDay(input);
  if (!tally) return [];
  const rows: WeekdayRow[] = WEEKDAYS.map((day, index) => ({
    index, day, occurrences: 0, leads: 0, qualified: 0, converted: 0, avgLeads: 0, avgQualified: 0, avgConverted: 0,
  }));
  // Averages, not totals: a 30-day range holds five of two weekdays and four
  // of the rest, which would hand those two a 25% head start on raw counts.
  // Calendar-part stepping, so a DST change can't skip or repeat a day.
  for (let d = tally.first; d <= tally.last; d = addDays(d, 1)) {
    const r = rows[weekdayIndex(d)];
    r.occurrences++;
    const c = tally.byDay.get(dayKey(d));
    if (c) { r.leads += c.leads; r.qualified += c.qualified; r.converted += c.converted; }
  }
  for (const r of rows) {
    const n = r.occurrences || 1;
    r.avgLeads = r.leads / n;
    r.avgQualified = r.qualified / n;
    r.avgConverted = r.converted / n;
  }
  return rows;
}

export interface CalendarDay extends DayCounts {
  date: Date;
  /** False for days outside the counted span — shown blank, not as zero. */
  inRange: boolean;
}

export interface CalendarWeek extends DayCounts {
  /** Monday of the week. */
  start: Date;
  /** Monday … Sunday. */
  days: CalendarDay[];
  /** Some of the week's days fall outside the counted span, so its total covers fewer than 7 days. */
  partial: boolean;
}

/** Monday-start weeks with each day's counts, newest week first. */
export function buildCalendarWeeks(input: WeekdayInput): CalendarWeek[] {
  const tally = tallyByDay(input);
  if (!tally) return [];
  const weeks: CalendarWeek[] = [];
  for (let start = addDays(tally.first, -weekdayIndex(tally.first)); start <= tally.last; start = addDays(start, 7)) {
    const week: CalendarWeek = { start, days: [], partial: false, leads: 0, qualified: 0, converted: 0 };
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const inRange = date >= tally.first && date <= tally.last;
      const c = (inRange && tally.byDay.get(dayKey(date))) || { leads: 0, qualified: 0, converted: 0 };
      week.days.push({ date, inRange, ...c });
      if (!inRange) week.partial = true;
      week.leads += c.leads; week.qualified += c.qualified; week.converted += c.converted;
    }
    weeks.push(week);
  }
  return weeks.reverse();
}

export type WeekdayMetric = "avgLeads" | "avgQualified" | "avgConverted";

/** Weekday with the highest average for a metric, or null when it's zero everywhere. */
export function bestWeekday(rows: WeekdayRow[], metric: WeekdayMetric): WeekdayRow | null {
  const best = rows.reduce<WeekdayRow | null>((b, r) => (!b || r[metric] > b[metric] ? r : b), null);
  return best && best[metric] > 0 ? best : null;
}
