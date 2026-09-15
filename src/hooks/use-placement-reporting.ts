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
import {
  computeStageTotals, computeTrendBuckets, computeHospitalActivity, priorRangeOf,
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
  /** Attempts after the team-member filter, for panels that do their own math. */
  attempts: PlacementAttempt[];
  filters:  ReportingFilters;
}

export function usePlacementReporting(filters: ReportingFilters): PlacementReportingBundle {
  const { data: attempts = [],  isLoading: al } = usePlacementAttempts();
  const { data: hospitals = [], isLoading: hl } = useHospitals();
  const { data: vacancies = [], isLoading: vl } = useVacancies();

  const repFor = useMemo(() => buildRepLookup(hospitals), [hospitals]);

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

  return useMemo<PlacementReportingBundle>(() => ({
    isLoading:   al || hl || vl,
    totals:      computeStageTotals(scoped, filters),
    totalsPrior: computeStageTotals(scoped, { ...filters, range: priorRangeOf(filters.range) }),
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
  }), [scoped, attempts, hospitals, vacancyByHospital, filters, al, hl, vl]);
}

function distinct<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
