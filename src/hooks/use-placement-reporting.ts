/**
 * The Reports page's data bundle, sourced ONLY from placement_attempts.
 *
 * Replaces use-reporting-metrics, which fetched automation_flow_runs and
 * doctor_lifecycle — both artefacts of the sends machinery. Reports now
 * measures placement, and placement is recorded in exactly two places: the
 * imported sheet and the Processing page's stage marking. Both land in
 * placement_attempts.
 *
 * Two supporting tables come along, neither of them sends-derived:
 *   - hospitals  → who represents an account (drives the team-member filter)
 *   - vacancies  → open roles per account, so a hospital that's hiring but
 *                  idle stands out next to its activity
 */
import { useMemo } from "react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useHospitals } from "@/hooks/use-hospitals";
import { useVacancies } from "@/hooks/use-vacancies";
import { buildRepLookup } from "@/lib/hospital-rep";
import { usePlacementEvents } from "@/hooks/use-placement-events";
import {
  computeEventTotals, computeTrendBuckets, computeHospitalActivity, priorRangeOf,
  type ReportingFilters, type StageTotals, type TrendBucket, type HospitalActivityRow,
} from "@/lib/placement-reporting";

export interface PlacementReportingBundle {
  isLoading:  boolean;
  totals:     StageTotals;
  /** Same totals over the immediately-preceding equal window, for the ▲▼ deltas. */
  totalsPrior: StageTotals;
  trend:      TrendBucket[];
  hospitals:  HospitalActivityRow[];
  /** hospital name → open vacancies. */
  vacancyByHospital: Map<string, number>;
  options: {
    hospitals:   string[];
    specialties: string[];
  };
  /** Whether any logged lines exist yet. False before a sheet has been
   *  imported through the events-aware importer, when the headline totals
   *  would otherwise read zero. */
  eventsLoaded: boolean;
  /** Attempts after the team-member filter, for panels that do their own math. */
  attempts: PlacementAttempt[];
  filters:  ReportingFilters;
}

export function usePlacementReporting(filters: ReportingFilters): PlacementReportingBundle {
  const { data: attempts = [],  isLoading: al } = usePlacementAttempts();
  const { data: hospitals = [], isLoading: hl } = useHospitals();
  const { data: vacancies = [], isLoading: vl } = useVacancies();
  const { data: events = [],    isLoading: el } = usePlacementEvents();

  const repFor = useMemo(() => buildRepLookup(hospitals), [hospitals]);

  /** An event knows its journey, not its hospital, so the hospital and
   *  team-member filters resolve through this. */
  const byAttempt = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attempts) m.set(a.id, a.hospital_name);
    return m;
  }, [attempts]);

  const vacancyByHospital = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vacancies) {
      if (v.status !== "open") continue;
      const name = v.hospital_name?.trim();
      if (!name) continue;
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    return m;
  }, [vacancies]);

  // The team-member filter means "accounts this person represents", not "rows
  // this person touched". Credit follows the hospital allocation, so it's
  // resolved here (where the hospitals table lives) rather than in the pure
  // filter helpers.
  const scoped = useMemo(() => {
    if (!filters.teamMember) return attempts;
    const want = filters.teamMember.toLowerCase();
    return attempts.filter(a => (repFor(a.hospital_name)?.email ?? "").toLowerCase() === want);
  }, [attempts, repFor, filters.teamMember]);

  // The headline figures count logged lines, not distinct doctors: the team's
  // report counts a doctor put forward at the same hospital twice as two, and
  // the same pair logged by two reps as two. The journey rows cannot express
  // that, so these come from placement_events — which is also where the
  // UAE / KSA-Qatar split and the Sunday-Saturday week live.
  //
  // The other panels still read journeys, because "which hospitals are busy"
  // and "where is this doctor up to" are questions about journeys.
  const countable = useMemo(() => {
    let out = events;
    if (filters.hospital)   out = out.filter(e => byAttempt.get(e.attempt_id) === filters.hospital);
    if (filters.teamMember) {
      const want = filters.teamMember.toLowerCase();
      out = out.filter(e => {
        const h = byAttempt.get(e.attempt_id);
        return !!h && (repFor(h)?.email ?? "").toLowerCase() === want;
      });
    }
    return out;
  }, [events, byAttempt, repFor, filters.hospital, filters.teamMember]);

  return useMemo<PlacementReportingBundle>(() => ({
    isLoading:   al || hl || vl || el,
    eventsLoaded: events.length > 0,
    totals:      computeEventTotals(countable, filters.range, { country: filters.side ?? undefined }),
    // The caller passes the real previous period; priorRangeOf only guesses an
    // equal-length span, which stops being the month before once months differ
    // in length (September is 30 days, August 31).
    totalsPrior: computeEventTotals(countable, filters.prior ?? priorRangeOf(filters.range), { country: filters.side ?? undefined }),
    trend:       computeTrendBuckets(scoped, filters),
    hospitals:   computeHospitalActivity(scoped, vacancyByHospital, filters),
    vacancyByHospital,
    options: {
      // Every hospital on file, not just the ones with activity — picking a
      // silent account and seeing nothing IS the useful answer.
      hospitals:   distinct([...hospitals.map(h => h.name), ...attempts.map(a => a.hospital_name)]).filter(Boolean).sort(),
      specialties: distinct(attempts.map(a => a.doctor_specialty).filter(Boolean) as string[]).sort(),
    },
    attempts: scoped,
    filters,
  }), [scoped, countable, events.length, attempts, hospitals, vacancyByHospital, filters, al, hl, vl, el]);
}

function distinct<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
