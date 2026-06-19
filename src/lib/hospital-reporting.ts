/**
 * Phase 5 — Hospital Introduction Department reporting.
 *
 * Pure aggregation functions over flow runs + lifecycle + vacancies. Lives
 * outside any hook so the same logic can be reused by exports / tests later
 * without dragging React along.
 *
 * Source: Saif Ullah meeting, May 20 2026 — Phase 5 spec.
 */
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import type { Vacancy } from "@/hooks/use-vacancies";

export interface DateRange {
  from: Date;  // inclusive
  to:   Date;  // inclusive
}

export interface ReportingFilters {
  range:       DateRange;
  hospital?:   string | null;       // hospital name (exact)
  doctorId?:   string | null;       // prefixed lead:/dob: id
  teamMember?: string | null;       // email
  specialty?:  string | null;
}

export interface KpiTotals {
  shortlisted: number;
  interviews:  number;
  offered:     number;
  signed:      number;
  joined:      number;
  paid:        number;
  /** Profile sends in the window — useful for funnel ratios. */
  profilesSent: number;
}

export interface TeamMemberRow {
  email:       string;
  shortlisted: number;
  interviews:  number;
  offered:     number;
  signed:      number;
  profilesSent: number;
  total:       number;
}

export interface HospitalRow {
  hospital:    string;
  shortlisted: number;
  interviews:  number;
  signed:      number;
  joined:      number;
  /** Open vacancies right now (point-in-time, not range-bounded). */
  openVacancies: number;
  /** Days since the most recent interaction (any flow run touched the
   *  hospital). Higher = colder. null when no interaction ever. */
  daysSinceLastInteraction: number | null;
  /** 0..100 — rough relationship health, see scoreRelationship(). */
  health: number;
  /** "warming" | "steady" | "cooling" — derived from prior-period delta. */
  trend: "warming" | "steady" | "cooling";
  /** Signed this period vs prior period for the trend line. */
  signedPrior: number;
}

export interface TrendBucket {
  /** ISO date for the start of the bucket (week start, Monday). */
  weekStart: string;
  shortlisted: number;
  interviews:  number;
  signed:      number;
}

// ── Stage classification ────────────────────────────────────────────────────
// We bucket each flow_run + its current stage into a milestone category. The
// stage_keys come from src/lib/automation-flows.ts and the boldsign-webhook.

function isShortlistRun(r: FlowRun): boolean {
  return r.flow_key === "shortlist";
}
function isInterviewRun(r: FlowRun): boolean {
  return r.flow_key === "interview";
}
function isOfferRun(r: FlowRun): boolean {
  // contract_signing covers the offer → signed transition. We count anything
  // mid-stage as "offered" and lifecycle.signed_at as "signed".
  return r.flow_key === "contract_signing";
}
function isProfileSendRun(r: FlowRun): boolean {
  return r.flow_key === "profile_sent";
}

function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  // range.to is local midnight of the last selected day → treat as end-of-day
  // (+1 day, exclusive) so the final day is included (app-wide convention).
  return t >= range.from.getTime() && t < range.to.getTime() + 86_400_000;
}

function passesFilters(r: FlowRun, f: ReportingFilters): boolean {
  if (f.hospital   && r.hospital   !== f.hospital)   return false;
  if (f.doctorId   && r.doctor_id  !== f.doctorId)   return false;
  if (f.teamMember && r.created_by !== f.teamMember) return false;
  if (f.specialty) {
    const sp = (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined;
    if (!sp || !sp.toLowerCase().includes(f.specialty.toLowerCase())) return false;
  }
  return true;
}

// ── Top-level KPI totals ────────────────────────────────────────────────────
export function computeKpis(
  runs:       FlowRun[],
  lifecycles: DoctorLifecycle[],
  filters:    ReportingFilters,
): KpiTotals {
  const totals: KpiTotals = {
    shortlisted: 0, interviews: 0, offered: 0, signed: 0,
    joined: 0, paid: 0, profilesSent: 0,
  };
  const lifecycleByDoctor = new Map<string, DoctorLifecycle>();
  for (const l of lifecycles) lifecycleByDoctor.set(l.doctor_id, l);

  for (const r of runs) {
    if (!passesFilters(r, filters)) continue;
    // Use started_at for "this run happened in the range" — captures shortlist
    // marks, interview triggers, etc. We don't need stage timestamps for v1.
    if (!inRange(r.started_at, filters.range)) continue;
    if (isShortlistRun(r))    totals.shortlisted++;
    if (isInterviewRun(r))    totals.interviews++;
    if (isOfferRun(r))        totals.offered++;
    if (isProfileSendRun(r))  totals.profilesSent++;
  }

  // Signed / joined / paid come from the lifecycle table where the team
  // explicitly recorded each milestone. Apply doctor + team-member filters
  // by joining via the runs that involve this doctor.
  const eligibleDoctorIds = new Set<string>();
  if (filters.doctorId || filters.hospital || filters.teamMember || filters.specialty) {
    for (const r of runs) {
      if (passesFilters(r, filters) && r.doctor_id) eligibleDoctorIds.add(r.doctor_id);
    }
  }
  const filterByDoctor = filters.doctorId || filters.hospital || filters.teamMember || filters.specialty;

  for (const l of lifecycles) {
    if (filterByDoctor && !eligibleDoctorIds.has(l.doctor_id)) continue;
    if (inRange(l.signed_at,  filters.range)) totals.signed++;
    if (inRange(l.joined_at,  filters.range)) totals.joined++;
    if (inRange(l.paid_at,    filters.range)) totals.paid++;
  }

  return totals;
}

// ── Per-team-member roll-up ─────────────────────────────────────────────────
export function computeTeamRows(runs: FlowRun[], filters: ReportingFilters): TeamMemberRow[] {
  const map = new Map<string, TeamMemberRow>();
  for (const r of runs) {
    if (!r.created_by) continue;
    if (!passesFilters(r, filters)) continue;
    if (!inRange(r.started_at, filters.range)) continue;

    const row = map.get(r.created_by) ?? {
      email: r.created_by, shortlisted: 0, interviews: 0, offered: 0, signed: 0,
      profilesSent: 0, total: 0,
    };
    if (isShortlistRun(r))   row.shortlisted++;
    if (isInterviewRun(r))   row.interviews++;
    if (isOfferRun(r))       row.offered++;
    if (isProfileSendRun(r)) row.profilesSent++;
    row.total++;
    map.set(r.created_by, row);
  }
  // We can't attribute lifecycle signed_at to a specific team member without
  // the data — leave row.signed at 0 for now and surface a note in the UI.
  void Map;

  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ── Per-hospital roll-up + relationship health ──────────────────────────────
export function computeHospitalRows(
  runs:       FlowRun[],
  lifecycles: DoctorLifecycle[],
  vacancies:  Vacancy[],
  filters:    ReportingFilters,
): HospitalRow[] {
  const now = Date.now();
  const priorRange: DateRange = (() => {
    const span = filters.range.to.getTime() - filters.range.from.getTime();
    return {
      from: new Date(filters.range.from.getTime() - span - 86_400_000),
      to:   new Date(filters.range.from.getTime() - 86_400_000),
    };
  })();

  const byHospital = new Map<string, HospitalRow & { lastTouched: number; signedDoctorIds: Set<string>; joinedDoctorIds: Set<string> }>();
  const ensure = (name: string) => {
    let row = byHospital.get(name);
    if (!row) {
      row = {
        hospital: name, shortlisted: 0, interviews: 0, signed: 0, joined: 0,
        openVacancies: 0, daysSinceLastInteraction: null, health: 0, trend: "steady",
        signedPrior: 0, lastTouched: 0, signedDoctorIds: new Set(), joinedDoctorIds: new Set(),
      };
      byHospital.set(name, row);
    }
    return row;
  };

  // Last-interaction time spans ALL runs (not just window) — relationship
  // health depends on absolute freshness.
  for (const r of runs) {
    if (!r.hospital) continue;
    if (filters.specialty) {
      const sp = (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined;
      if (!sp || !sp.toLowerCase().includes(filters.specialty.toLowerCase())) continue;
    }
    if (filters.teamMember && (r.created_by ?? "").toLowerCase() !== filters.teamMember.toLowerCase()) continue;
    if (filters.doctorId   && r.doctor_id  !== filters.doctorId)   continue;

    const row = ensure(r.hospital);
    const ts = new Date(r.last_event_at).getTime();
    if (ts > row.lastTouched) row.lastTouched = ts;

    if (!inRange(r.started_at, filters.range)) {
      if (inRange(r.started_at, priorRange) && isOfferRun(r) && r.status === "completed") {
        row.signedPrior++;
      }
      continue;
    }
    if (isShortlistRun(r)) row.shortlisted++;
    if (isInterviewRun(r)) row.interviews++;
  }

  // Signed + joined per hospital — pull from lifecycle, then attribute to
  // the hospital via the doctor's contract_signing run.
  const hospitalByDoctor = new Map<string, string>();
  for (const r of runs) {
    if (r.doctor_id && r.hospital && isOfferRun(r)) {
      hospitalByDoctor.set(r.doctor_id, r.hospital);
    }
  }
  for (const l of lifecycles) {
    const hospital = hospitalByDoctor.get(l.doctor_id);
    if (!hospital) continue;
    const row = ensure(hospital);
    if (inRange(l.signed_at, filters.range) && !row.signedDoctorIds.has(l.doctor_id)) {
      row.signedDoctorIds.add(l.doctor_id);
      row.signed++;
    }
    if (inRange(l.joined_at, filters.range) && !row.joinedDoctorIds.has(l.doctor_id)) {
      row.joinedDoctorIds.add(l.doctor_id);
      row.joined++;
    }
  }

  // Open vacancies — current state, no date filter.
  for (const v of vacancies) {
    if (v.status !== "open") continue;
    const row = ensure(v.hospital_name);
    row.openVacancies++;
  }

  // Finalise: daysSinceLastInteraction + health + trend.
  const finalRows: HospitalRow[] = [];
  for (const row of byHospital.values()) {
    if (filters.hospital && row.hospital !== filters.hospital) continue;
    row.daysSinceLastInteraction = row.lastTouched
      ? Math.floor((now - row.lastTouched) / 86_400_000)
      : null;
    row.health = scoreRelationship(row);
    row.trend  = row.signed > row.signedPrior * 1.25 ? "warming"
              : row.signed < row.signedPrior * 0.75 ? "cooling"
              : "steady";
    finalRows.push({
      hospital: row.hospital, shortlisted: row.shortlisted, interviews: row.interviews,
      signed: row.signed, joined: row.joined, openVacancies: row.openVacancies,
      daysSinceLastInteraction: row.daysSinceLastInteraction, health: row.health,
      trend: row.trend, signedPrior: row.signedPrior,
    });
  }
  return finalRows.sort((a, b) => b.signed - a.signed || (a.daysSinceLastInteraction ?? 9999) - (b.daysSinceLastInteraction ?? 9999));
}

/** Hospital relationship health 0..100.
 *
 *  Components (each capped, summed):
 *    Recency       — 0d ago = 40, 30d = 20, 60d = 10, 90d+ = 0
 *    Activity      — shortlists + interviews + signs this period, capped at 30
 *    Pipeline      — open vacancies (engagement signal), capped at 15
 *    Conversion    — signed / shortlists ratio, capped at 15
 */
function scoreRelationship(row: { daysSinceLastInteraction: number | null; shortlisted: number; interviews: number; signed: number; openVacancies: number }): number {
  let score = 0;
  const d = row.daysSinceLastInteraction;
  if (d == null)      score += 0;
  else if (d <= 7)    score += 40;
  else if (d <= 30)   score += 30;
  else if (d <= 60)   score += 20;
  else if (d <= 90)   score += 10;
  else                score += 0;

  score += Math.min(30, row.shortlisted + row.interviews * 2 + row.signed * 3);
  score += Math.min(15, row.openVacancies * 5);

  if (row.shortlisted > 0) {
    const conv = row.signed / row.shortlisted;
    score += Math.min(15, Math.round(conv * 30));
  }

  return Math.max(0, Math.min(100, score));
}

// ── Weekly trend buckets ────────────────────────────────────────────────────
export function computeTrendBuckets(
  runs:       FlowRun[],
  lifecycles: DoctorLifecycle[],
  filters:    ReportingFilters,
): TrendBucket[] {
  // Build a week-start map for the range.
  const map = new Map<string, TrendBucket>();
  let cursor = new Date(filters.range.from); cursor = startOfWeek(cursor);
  const end  = startOfWeek(new Date(filters.range.to));
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    map.set(key, { weekStart: key, shortlisted: 0, interviews: 0, signed: 0 });
    cursor = new Date(cursor.getTime() + 7 * 86_400_000);
  }

  const bucket = (iso: string | null | undefined): TrendBucket | null => {
    if (!iso) return null;
    const key = startOfWeek(new Date(iso)).toISOString().slice(0, 10);
    return map.get(key) ?? null;
  };

  for (const r of runs) {
    if (!passesFilters(r, filters)) continue;
    const b = bucket(r.started_at);
    if (!b) continue;
    if (isShortlistRun(r)) b.shortlisted++;
    if (isInterviewRun(r)) b.interviews++;
  }
  const eligible = new Set<string>();
  if (filters.doctorId || filters.hospital || filters.teamMember || filters.specialty) {
    for (const r of runs) {
      if (passesFilters(r, filters) && r.doctor_id) eligible.add(r.doctor_id);
    }
  }
  const filterByDoctor = filters.doctorId || filters.hospital || filters.teamMember || filters.specialty;
  for (const l of lifecycles) {
    if (filterByDoctor && !eligible.has(l.doctor_id)) continue;
    const b = bucket(l.signed_at);
    if (b) b.signed++;
  }

  return [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ── Doctors-on-the-way: signed but not joined ──────────────────────────────
export interface DoctorOnTheWay {
  doctor_id:   string;
  doctor_name: string;
  signed_at:   string;
  daysSinceSigned: number;
}

export function computeDoctorsOnTheWay(lifecycles: DoctorLifecycle[]): DoctorOnTheWay[] {
  const now = Date.now();
  const out: DoctorOnTheWay[] = [];
  for (const l of lifecycles) {
    if (!l.signed_at) continue;
    if (l.joined_at) continue;
    const days = Math.floor((now - new Date(l.signed_at).getTime()) / 86_400_000);
    out.push({
      doctor_id:   l.doctor_id,
      doctor_name: l.doctor_name ?? "(unknown)",
      signed_at:   l.signed_at,
      daysSinceSigned: days,
    });
  }
  return out.sort((a, b) => b.daysSinceSigned - a.daysSinceSigned);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function startOfWeek(d: Date): Date {
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
