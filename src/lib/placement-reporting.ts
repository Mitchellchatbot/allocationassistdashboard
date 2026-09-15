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

export interface ReportingFilters {
  range:      DateRange;
  hospital:   string | null;
  /** Rep email. Resolved to hospitals via the allocation, not via who clicked. */
  teamMember: string | null;
  specialty:  string | null;
  doctorId?:  string | null;
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

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay();             // 0 Sun .. 6 Sat
  const shift = (dow + 6) % 7;          // distance back to Monday
  out.setDate(out.getDate() - shift);
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
