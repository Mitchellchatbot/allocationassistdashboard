/**
 * Period math for the Reports page.
 *
 * The page reads one calendar period at a time — a week, a month, or a rolling
 * 12 months — and steps through them with the side arrows. `offset` is how many
 * periods back from the current one (0 = now, -1 = the one before, …).
 *
 * A WEEK ALWAYS RUNS SUNDAY → SATURDAY. What changes on `CALENDAR_FROM`
 * (1 September 2026) is where a month begins and ends, and whether a week is
 * allowed to straddle that boundary.
 *
 *   Before it (how the team used to count, and how every figure they have
 *   already published is bucketed): a month is WHOLE WEEKS — the first Sunday
 *   of the month to the Saturday closing the week its last Sunday opens — so a
 *   week that opens in February carries its March days into February. That
 *   rule was measured against nine months of the team's tracker and beat every
 *   alternative, so history keeps it.
 *
 *   From it (what the client asked for): a month is the calendar month, 1st to
 *   last day, and a week is CUT where the month ends. October 2026 opens on a
 *   Thursday, so its first week is Thu 1 → Sat 3 and the next is the whole
 *   Sun 4 → Sat 10. Weekly numbers therefore add up exactly to the month's.
 *
 * August 2026 is the seam: under the old rule it ran to Saturday 5 September,
 * so it is cut at 31 August and the 1st–5th belong to the new September.
 *
 * Because a clipped week is not always seven days, periods can no longer be
 * found by arithmetic. Instead the whole calendar is ENUMERATED once (cached
 * per day) and `offset` indexes into that list.
 *
 * Every range follows the app-wide convention used by `inRange` in
 * placement-reporting: `from` is local midnight of the first day and `to` is
 * local midnight of the LAST day (the window runs to end-of-day).
 */
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";
import {
  STAGES, stageAt, inRange, startOfWeek, CALENDAR_FROM,
  type DateRange, type StageKey,
} from "@/lib/placement-reporting";

export { CALENDAR_FROM };

export type Period = "weekly" | "monthly" | "yearly";

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

export const shortDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
export const monthLabel = (d: Date, long = false) =>
  `${(long ? MONTHS_LONG : MONTHS_SHORT)[d.getMonth()]} ${d.getFullYear()}`;
export { MONTHS_SHORT };

/* ── Building the calendar ──────────────────────────────────────────────── */

/** One period on the calendar. `year`/`month` name the calendar month it
 *  belongs to — for a year window, the month it ENDS in. */
export interface PeriodWindow extends DateRange {
  year:   number;
  month:  number;
  /** Built under the pre-September rule. */
  legacy: boolean;
}

/** The last day the old rule covers — 31 August 2026. */
const LEGACY_END = addDays(CALENDAR_FROM, -1);

const isCalendarMonth = (y: number, m: number) =>
  y > CALENDAR_FROM.getFullYear() ||
  (y === CALENDAR_FROM.getFullYear() && m >= CALENDAR_FROM.getMonth());

/** The first Sunday of a month — where the old rule starts it. */
const legacyMonthStart = (y: number, m: number) => {
  const first = new Date(y, m, 1);
  // getDay() 0 = Sunday, so this stays put when the 1st is itself a Sunday.
  first.setDate(first.getDate() + ((7 - first.getDay()) % 7));
  return midnight(first);
};
/** The Saturday closing the week that the month's last Sunday opens. */
const legacyMonthEnd = (y: number, m: number) => {
  const last = new Date(y, m + 1, 0);                  // last calendar day
  const lastSunday = new Date(last);
  lastSunday.setDate(last.getDate() - last.getDay());  // back to its Sunday
  return midnight(addDays(lastSunday, 6));
};

/** How far back the calendar runs. Six years covers the six rolling-year
 *  windows the picker can offer, with the oldest data well inside. */
const YEARS_BACK = 6;

function buildMonths(now: Date): PeriodWindow[] {
  const out: PeriodWindow[] = [];
  // Run to the END of the current year, not to today: the picker shows the
  // months still to come and needs a real offset for each to disable it.
  for (let y = now.getFullYear() - YEARS_BACK; y <= now.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      if (isCalendarMonth(y, m)) {
        out.push({ from: midnight(new Date(y, m, 1)), to: midnight(new Date(y, m + 1, 0)), year: y, month: m, legacy: false });
      } else {
        const end = legacyMonthEnd(y, m);
        out.push({
          from: legacyMonthStart(y, m),
          to:   end.getTime() > LEGACY_END.getTime() ? LEGACY_END : end,
          year: y, month: m, legacy: true,
        });
      }
    }
  }
  return out;
}

function buildWeeks(now: Date): PeriodWindow[] {
  const months = windows("monthly", now);
  const out: PeriodWindow[] = [];

  // The old half: Sunday weeks, the last of them cut at 31 August 2026. Legacy
  // months are themselves whole Sunday weeks, so every week sits in exactly one.
  let cur = startOfWeek(months[0].from);
  let mi  = 0;
  while (cur.getTime() < CALENDAR_FROM.getTime()) {
    const end = addDays(cur, 6);
    while (mi + 1 < months.length && cur.getTime() > months[mi].to.getTime()) mi++;
    out.push({
      from: cur,
      to:   end.getTime() > LEGACY_END.getTime() ? LEGACY_END : end,
      year: months[mi].year, month: months[mi].month, legacy: true,
    });
    cur = addDays(end, 1);
  }

  // The new half: still Sunday → Saturday, but cut where the month ends. A
  // month opening on a Thursday therefore starts with a three-day week
  // (Thu 1 – Sat 3 October), and the one after it is whole again.
  for (const m of months) {
    if (m.legacy) continue;
    let c = m.from;
    while (c.getTime() <= m.to.getTime()) {
      // Days from `c` to the Saturday closing its week (0 when c IS a Saturday).
      const end = addDays(c, 6 - c.getDay());
      const to  = end.getTime() > m.to.getTime() ? m.to : end;
      out.push({ from: c, to, year: m.year, month: m.month, legacy: false });
      c = addDays(to, 1);
    }
  }
  return out;
}

function buildYears(now: Date): PeriodWindow[] {
  const months = windows("monthly", now);
  const cur = indexAt(months, now);
  const out: PeriodWindow[] = [];
  for (let k = Math.floor((cur - 11) / 12); k >= 0; k--) {
    const end = cur - 12 * k, start = end - 11;
    if (start < 0) continue;
    const a = months[start], b = months[end];
    out.push({ from: a.from, to: b.to, year: b.year, month: b.month, legacy: a.legacy });
  }
  return out;
}

// One calendar per period per day. Rebuilding is cheap (a few hundred windows)
// but it would otherwise happen on every render.
const CACHE = new Map<string, PeriodWindow[]>();

function windows(period: Period, now: Date): PeriodWindow[] {
  const key = `${period}|${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  let list = CACHE.get(key);
  if (!list) {
    if (CACHE.size > 12) CACHE.clear();
    list = period === "weekly" ? buildWeeks(now) : period === "monthly" ? buildMonths(now) : buildYears(now);
    CACHE.set(key, list);
  }
  return list;
}

/** Index of the window holding `d`, clamped to the ends of the calendar. */
function indexAt(list: PeriodWindow[], d: Date): number {
  const t = midnight(d).getTime();
  if (t < list[0].from.getTime()) return 0;
  for (let i = 0; i < list.length; i++) {
    if (t >= list[i].from.getTime() && t <= list[i].to.getTime()) return i;
  }
  return list.length - 1;
}

/* ── The public API ─────────────────────────────────────────────────────── */

/** The window for `period` stepped `offset` periods back from the one holding `now`. */
export function periodWindow(period: Period, offset: number, now: Date = new Date()): PeriodWindow {
  const list = windows(period, now);
  const i = indexAt(list, now) + offset;
  return list[Math.max(0, Math.min(list.length - 1, i))];
}

export function periodRange(period: Period, offset: number, now: Date = new Date()): DateRange {
  const w = periodWindow(period, offset, now);
  return { from: w.from, to: w.to };
}

/** Human labels for a period. */
export function periodLabels(period: Period, offset: number, now: Date = new Date()) {
  const w = periodWindow(period, offset, now);
  const range: DateRange = { from: w.from, to: w.to };
  const word = PERIOD_WORD[period];
  const rel =
    offset === 0  ? (period === "yearly" ? "Last 12 months" : `This ${word}`) :
    offset === -1 ? (period === "yearly" ? "The 12 before" : `Last ${word}`) :
    `${-offset} ${word}s ago`;
  let label: string, phrase: string, lead: string;
  if (period === "weekly") {
    // A clipped week can be a single day — "30 Sep – 30 Sep" reads like a bug.
    label  = w.from.getTime() === w.to.getTime()
      ? `${shortDate(w.from)} ${w.to.getFullYear()}`
      : `${shortDate(w.from)} – ${shortDate(w.to)} ${w.to.getFullYear()}`;
    phrase = `the week of ${shortDate(w.from)}`;
    lead   = offset === 0 ? "This week" : `In the week of ${shortDate(w.from)}`;
  } else if (period === "monthly") {
    label  = `${MONTHS_LONG[w.month]} ${w.year}`;
    phrase = label;
    lead   = offset === 0 ? "This month" : `In ${MONTHS_LONG[w.month]}`;
  } else {
    // `w.month`/`w.year` name the month the rolling year ENDS in; a legacy
    // window can close on a Saturday in the following month, so never read the
    // end month off the date.
    label  = `${monthLabel(w.from)} – ${MONTHS_SHORT[w.month]} ${w.year}`;
    phrase = `the 12 months to ${MONTHS_LONG[w.month]} ${w.year}`;
    lead   = offset === 0 ? "Over the last 12 months" : `In the 12 months to ${MONTHS_SHORT[w.month]} ${w.year}`;
  }
  return { range, word, rel, label, phrase, lead };
}

/**
 * How many periods back from `now` the period containing `date` is — the
 * inverse of `periodRange`. Used to find how far back the data goes, and to
 * turn a month the user clicked in the picker into an offset.
 */
export function offsetOf(period: Period, date: Date, now: Date = new Date()): number {
  const list = windows(period, now);
  return indexAt(list, date) - indexAt(list, now);
}

/** The months of the calendar, oldest first — the picker builds its grid from
 *  these so a cell's label and its range can never name different months. */
export function monthWindows(now: Date = new Date()): PeriodWindow[] {
  return windows("monthly", now);
}

/**
 * The trend chart's buckets: 12 weeks (weekly) or 12 months (monthly/yearly),
 * ending with the current bucket — or with the selected one, when the
 * selection has been stepped further back than the window reaches. For
 * yearly, the buckets are that year's own 12 months.
 */
export interface TrendWindow {
  unit:     "week" | "month";
  buckets:  PeriodWindow[];
  labels:   string[];
  /** Long label per bucket, for tooltips. */
  titles:   string[];
  /** Index of the selected period's bucket inside `buckets`, or null (yearly). */
  selected: number | null;
}

const bucketLabel = (w: PeriodWindow, unit: "week" | "month") =>
  unit === "week" ? shortDate(w.from) : MONTHS_SHORT[w.month];
const bucketTitle = (w: PeriodWindow, unit: "week" | "month") =>
  unit === "week" ? `Week of ${shortDate(w.from)} ${w.from.getFullYear()}` : `${MONTHS_LONG[w.month]} ${w.year}`;

export function trendWindow(period: Period, offset: number, now: Date = new Date(), size = 12): TrendWindow {
  if (period === "yearly") {
    const yw = periodWindow("yearly", offset, now);
    const months = windows("monthly", now);
    const start = indexAt(months, yw.from);
    const buckets = months.slice(start, start + size);
    return {
      unit: "month", buckets,
      labels: buckets.map(b => bucketLabel(b, "month")),
      titles: buckets.map(b => bucketTitle(b, "month")),
      selected: null,
    };
  }
  const unit = period === "weekly" ? "week" : "month";
  const list = windows(period, now);
  const curI = indexAt(list, now);
  const selI = Math.max(0, curI + offset);
  const endI = selI <= curI - size ? selI : curI;
  const startI = Math.max(0, endI - size + 1);
  const buckets = list.slice(startI, endI + 1);
  return {
    unit, buckets,
    labels: buckets.map(b => bucketLabel(b, unit)),
    titles: buckets.map(b => bucketTitle(b, unit)),
    selected: Math.max(0, Math.min(buckets.length - 1, selI - startI)),
  };
}

/** The same buckets a year earlier, for the dashed comparison line. Clipped
 *  weeks are no longer a fixed seven days apart, so this looks the window up
 *  on the calendar instead of subtracting a fixed shift. */
export function yearEarlier(buckets: PeriodWindow[], unit: "week" | "month", now: Date = new Date()): DateRange[] {
  const list = windows(unit === "week" ? "weekly" : "monthly", now);
  return buckets.map(b => {
    if (unit === "month") {
      const w = list.find(x => x.year === b.year - 1 && x.month === b.month);
      if (w) return { from: w.from, to: w.to };
      return { from: addDays(b.from, -365), to: addDays(b.to, -365) };
    }
    const w = list[indexAt(list, addDays(b.from, -364))];
    return { from: w.from, to: w.to };
  });
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
