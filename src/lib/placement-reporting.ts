/**
 * Reporting math over placement_attempts — the ONE source the Reports page
 * reads.
 *
 * Reports used to be assembled from automation_flow_runs and doctor_lifecycle,
 * i.e. from what the SENDS machinery did: an email went out, so something must
 * have happened. That measures outbound activity, not placement, and it
 * disagreed with the scoreboard sitting directly above it on the same page.
 *
 * Everything here reads placement_attempts instead, which has exactly two
 * writers: the imported sheet, and the Processing page where the team marks a
 * stage by hand. Both record what actually happened, so every panel on the
 * page now reconciles by construction.
 *
 * Counting rule, applied everywhere: DISTINCT DOCTORS, not rows. One doctor
 * shortlisted at four hospitals is one shortlisted doctor — counting rows
 * would let a single popular candidate quadruple the department's numbers.
 * The per-hospital table is the deliberate exception: there, the same doctor
 * SHOULD count once per account, because that's four separate conversations.
 */
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

export interface DateRange { from: Date; to: Date }

/**
 * The day the reporting calendar changes.
 *
 * Before it the team counted Sunday–Saturday weeks and months made of whole
 * weeks; from it they count calendar months and Monday–Sunday weeks clipped to
 * the month. History keeps the old rule so published figures do not move.
 * `report-period.ts` builds both calendars around this date, and the
 * `week_ending` column on placement_events switches on the same day.
 */
export const CALENDAR_FROM_ISO = "2026-09-01";
export const CALENDAR_FROM = new Date(2026, 8, 1);
/** The last day the old rule covers. */
export const LEGACY_END_ISO = "2026-08-31";

export interface ReportingFilters {
  range:      DateRange;
  /** The period immediately before `range`, for the ▲▼ deltas. The caller
   *  knows the real previous period; `priorRangeOf` can only guess an
   *  equal-length span, which is wrong once months differ in length. */
  prior?:     DateRange;
  hospital:   string | null;
  /** Rep email. Resolved to hospitals via the allocation, not via who clicked. */
  teamMember: string | null;
  specialty:  string | null;
  doctorId?:  string | null;
  /** Which half of the team's monthly report to show — it publishes UAE and
   *  KSA separately, with Qatar inside the second. Null shows both together. */
  side?:      "UAE" | "KSA/Qatar" | null;
}

/**
 * The stages a placement moves through, in order.
 *
 * `cols` is a fallback chain, not a set: "relocated" prefers an explicit
 * relocation date and falls back to the confirmed join, because the sheet
 * import fills joined_at while Processing marks relocated_at. Taking the first
 * present value keeps a doctor from being counted twice.
 */
export const STAGES = [
  { key: "shortlisted", label: "Shortlisted", cols: ["shortlisted_at"] },
  { key: "interviewed", label: "Interviewed", cols: ["interviewed_at"] },
  { key: "offered",     label: "Offered",     cols: ["offered_at"] },
  { key: "signed",      label: "Signed",      cols: ["signed_at"] },
  { key: "relocated",   label: "Relocated",   cols: ["relocated_at", "joined_at"] },
  { key: "paid",        label: "Paid",        cols: ["paid_at"] },
] as const satisfies ReadonlyArray<{
  key: string; label: string; cols: ReadonlyArray<keyof PlacementAttempt>;
}>;

export type StageKey = (typeof STAGES)[number]["key"];
export type StageTotals = Record<StageKey, number>;

export interface TrendBucket {
  /** ISO date of the Monday starting the week — the chart's x-axis key. */
  weekStart:   string;
  shortlisted: number;
  interviews:  number;
  signed:      number;
}

export interface HospitalActivityRow {
  hospital:      string;
  counts:        StageTotals;
  openVacancies: number;
  /** ms timestamp of the most recent milestone in range, or null. */
  lastAt:        number | null;
}

export function ts(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** `range.to` is local midnight of the last selected day, so the window runs to
 *  end-of-day (+1d, exclusive) — the convention the rest of the app uses. */
export function inRange(t: number | null, range: DateRange): boolean {
  return t != null && t >= range.from.getTime() && t < range.to.getTime() + 86_400_000;
}

/** First present date in a stage's fallback chain. */
export function stageAt(a: PlacementAttempt, stage: (typeof STAGES)[number]): number | null {
  for (const c of stage.cols) {
    const t = ts(a[c] as string | null);
    if (t != null) return t;
  }
  return null;
}

/**
 * Filters that don't need the hospital allocation. The team-member filter is
 * applied by the hook instead, since resolving a rep to their hospitals needs
 * the hospitals table.
 */
export function passesFilters(a: PlacementAttempt, f: ReportingFilters): boolean {
  if (f.doctorId && a.doctor_id !== f.doctorId) return false;
  if (f.hospital && !(a.hospital_name ?? "").toLowerCase().includes(f.hospital.toLowerCase())) return false;
  if (f.specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(f.specialty.toLowerCase())) return false;
  return true;
}

const emptyTotals = (): StageTotals =>
  Object.fromEntries(STAGES.map(s => [s.key, 0])) as StageTotals;

/** Distinct doctors who hit each stage inside the window. */
export function computeStageTotals(attempts: PlacementAttempt[], f: ReportingFilters): StageTotals {
  const seen = new Map<StageKey, Set<string>>(STAGES.map(s => [s.key, new Set<string>()]));
  for (const a of attempts) {
    if (!passesFilters(a, f)) continue;
    for (const s of STAGES) {
      const t = stageAt(a, s);
      if (inRange(t, f.range)) seen.get(s.key)!.add(a.doctor_id);
    }
  }
  const out = emptyTotals();
  for (const s of STAGES) out[s.key] = seen.get(s.key)!.size;
  return out;
}

/**
 * Weekly buckets for the trend chart.
 *
 * Legacy: these are always Sunday weeks and ignore CALENDAR_FROM. The Reports
 * page builds its own buckets from `report-period.ts`, which knows both
 * calendars; nothing reads the `trend` this produces.
 *
 * Buckets are seeded across the whole range before counting, so a quiet week
 * renders as a zero rather than vanishing — a line that skips empty weeks
 * silently compresses the x-axis and makes a dip look like steady progress.
 */
export function computeTrendBuckets(attempts: PlacementAttempt[], f: ReportingFilters): TrendBucket[] {
  const buckets = new Map<number, TrendBucket & { doctors: Record<string, Set<string>> }>();
  const seed = (weekMs: number) => {
    let b = buckets.get(weekMs);
    if (!b) {
      b = {
        weekStart: new Date(weekMs).toISOString(),
        shortlisted: 0, interviews: 0, signed: 0,
        doctors: { shortlisted: new Set(), interviews: new Set(), signed: new Set() },
      };
      buckets.set(weekMs, b);
    }
    return b;
  };

  const cursor = startOfWeek(f.range.from);
  const end    = f.range.to.getTime();
  // Guard the walk: an "All time" range over a bad date could otherwise spin.
  for (let i = 0; cursor.getTime() <= end && i < 1200; i++) {
    seed(cursor.getTime());
    cursor.setDate(cursor.getDate() + 7);
  }

  const TRACKED = [
    { key: "shortlisted" as const, stage: STAGES[0] },
    { key: "interviews"  as const, stage: STAGES[1] },
    { key: "signed"      as const, stage: STAGES[3] },
  ];
  for (const a of attempts) {
    if (!passesFilters(a, f)) continue;
    for (const { key, stage } of TRACKED) {
      const t = stageAt(a, stage);
      if (!inRange(t, f.range)) continue;
      const b = seed(startOfWeek(new Date(t!)).getTime());
      b.doctors[key].add(a.doctor_id);
    }
  }

  return [...buckets.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, b]) => ({
      weekStart:   b.weekStart,
      shortlisted: b.doctors.shortlisted.size,
      interviews:  b.doctors.interviews.size,
      signed:      b.doctors.signed.size,
    }));
}

/**
 * One row per hospital. Unlike the totals above, a doctor counts once PER
 * HOSPITAL here — four accounts talking to the same candidate is four
 * conversations, and collapsing them would hide three of them.
 */
export function computeHospitalActivity(
  attempts: PlacementAttempt[],
  vacancyByHospital: Map<string, number>,
  f: ReportingFilters,
): HospitalActivityRow[] {
  const by = new Map<string, HospitalActivityRow & { seen: Map<StageKey, Set<string>> }>();
  for (const a of attempts) {
    if (!passesFilters(a, f)) continue;
    const name = a.hospital_name?.trim();
    if (!name) continue;
    let row = by.get(name);
    if (!row) {
      row = {
        hospital: name,
        counts: emptyTotals(),
        openVacancies: vacancyByHospital.get(name) ?? 0,
        lastAt: null,
        seen: new Map(STAGES.map(s => [s.key, new Set<string>()])),
      };
      by.set(name, row);
    }
    for (const s of STAGES) {
      const t = stageAt(a, s);
      if (!inRange(t, f.range)) continue;
      row.seen.get(s.key)!.add(a.doctor_id);
      if (row.lastAt == null || t! > row.lastAt) row.lastAt = t!;
    }
  }
  return [...by.values()].map(({ seen, ...row }) => {
    for (const s of STAGES) row.counts[s.key] = seen.get(s.key)!.size;
    return row;
  });
}

/** The Sunday opening the week that holds `d`.
 *
 *  The team's week runs Sunday to Saturday, not Monday to Sunday, and every
 *  number they publish is bucketed that way. Reading it the other way moves
 *  rows across both week and month boundaries: 32 of the 33 rows in the week
 *  ending 1 August are dated 26-31 July, so a Monday week files them under
 *  July and August loses them. Checked against the tracker over nine months,
 *  Sunday-Saturday scored a total error of 149 where every alternative
 *  scored 240-264. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());   // getDay(): 0 Sun .. 6 Sat
  return out;
}

/**
 * The last day of the week that holds `iso` — the name the team gives that
 * week. Mirrors the generated week_ending column on placement_events, so the
 * two must change together.
 *
 * Before CALENDAR_FROM that is the Saturday closing a Sunday–Saturday week.
 * From it, weeks run Monday–Sunday and stop at the month end, so it is the
 * following Sunday or the last day of the month, whichever comes first.
 */
export function weekEndingOf(iso: string): string {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  if (day < CALENDAR_FROM_ISO) {
    d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
    // The seam week is cut short: the week opening Sunday 30 August 2026 used
    // to close on Saturday 5 September, but those days now belong to the new
    // September, so the last legacy week ends on the 31st.
    const iso = d.toISOString().slice(0, 10);
    return iso < CALENDAR_FROM_ISO ? iso : LEGACY_END_ISO;
  }
  const sunday = new Date(d);
  // getUTCDay(): 0 Sun .. 6 Sat, so a Sunday stays where it is.
  sunday.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return (sunday < monthEnd ? sunday : monthEnd).toISOString().slice(0, 10);
}

/** The stages placement_events records. The sheet has no "relocated" or
 *  "paid" column, so those two reporting stages have no event of their own. */
export type EventStageKey = "shortlisted" | "interviewed" | "offered" | "signed" | "joined";

/** The sheet's "Joined" column is the same milestone the reports call
 *  relocated — STAGES already reads relocated_at or joined_at, whichever the
 *  journey has. */
const EVENT_TO_STAGE: Record<EventStageKey, StageKey> = {
  shortlisted: "shortlisted",
  interviewed: "interviewed",
  offered:     "offered",
  signed:      "signed",
  joined:      "relocated",
};

/** A Date as the calendar day it is locally, yyyy-mm-dd. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A logged line, as placement_events stores it. */
export interface EventRow {
  stage:       EventStageKey;
  occurred_at: string;
  week_ending: string;
  rep:         string | null;
  country:     string | null;
}

/**
 * Stage totals the way the team counts them: every logged line.
 *
 * Not distinct doctors, and not distinct doctor+hospital pairs either — a
 * doctor put forward at the same hospital twice is two lines and counts twice,
 * and the same pair logged by two reps counts twice as well. Deduplicating
 * measurably moves the numbers away from the tracker rather than towards it
 * (total error 149 counting lines, 150 per week, 161 per month).
 *
 * `country` narrows to one side of the report — "UAE" or "KSA/Qatar".
 */
export function computeEventTotals(
  events: EventRow[],
  range: DateRange,
  opts: { country?: string; rep?: string } = {},
): StageTotals {
  const out = emptyTotals();
  // Compared as calendar days, not as instants. An event holds a day
  // ("2026-09-05") while a DateRange ends at local midnight, so reading the
  // day as UTC puts it AFTER the range's end anywhere east of UTC — and the
  // last day of every period dropped out without a trace.
  const from = localDay(range.from);
  const to   = localDay(range.to);
  for (const e of events) {
    if (opts.country && e.country !== opts.country) continue;
    if (opts.rep && e.rep !== opts.rep) continue;
    const day = e.occurred_at?.slice(0, 10);
    if (!day || day < from || day > to) continue;
    const key = EVENT_TO_STAGE[e.stage];
    if (key) out[key]++;
  }
  return out;
}

export function defaultRange(days = 30): DateRange {
  const to   = new Date();   to.setHours(23, 59, 59, 999);
  const from = new Date(to); from.setDate(from.getDate() - (days - 1)); from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** The equal-length window immediately BEFORE `range`, for the ▲▼ deltas. */
export function priorRangeOf(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span - 86_400_000),
    to:   new Date(range.from.getTime() - 86_400_000),
  };
}

/** Percent change cur vs prior. `null` = "new" (no prior baseline). */
export function pctChange(cur: number, prior: number): number | null {
  if (prior === 0) return cur > 0 ? null : 0;
  return ((cur - prior) / prior) * 100;
}
