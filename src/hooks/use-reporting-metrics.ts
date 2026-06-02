/**
 * Phase 5 — Reporting bundle: fetches every dataset the Reports page needs
 * and computes the four aggregations in one place. Reports.tsx only cares
 * about the outputs.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";
import type { Vacancy } from "@/hooks/use-vacancies";
import {
  computeKpis, computeTeamRows, computeHospitalRows, computeTrendBuckets, computeDoctorsOnTheWay,
  type ReportingFilters, type KpiTotals, type TeamMemberRow, type HospitalRow, type TrendBucket, type DoctorOnTheWay,
} from "@/lib/hospital-reporting";

export interface ReportingBundle {
  isLoading:        boolean;
  kpis:             KpiTotals;
  team:             TeamMemberRow[];
  hospitals:        HospitalRow[];
  trend:            TrendBucket[];
  doctorsOnTheWay:  DoctorOnTheWay[];
  /** Distinct values for the filter dropdowns. */
  options: {
    hospitals:   string[];
    teamMembers: string[];
    specialties: string[];
  };
  /** Raw rows the KPI drilldowns need to render their flip-card backs. */
  rawRuns:       FlowRun[];
  rawLifecycles: DoctorLifecycle[];
  filters:       ReportingFilters;
}

export function useReportingMetrics(filters: ReportingFilters): ReportingBundle {
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["reporting-runs"],
    queryFn: async (): Promise<FlowRun[]> => {
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 60_000,
  });
  const { data: lifecycles = [], isLoading: lifeLoading } = useQuery({
    queryKey: ["reporting-lifecycles"],
    queryFn: async (): Promise<DoctorLifecycle[]> => {
      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .select("*")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as DoctorLifecycle[];
    },
    staleTime: 60_000,
  });
  const { data: vacancies = [], isLoading: vacLoading } = useQuery({
    queryKey: ["reporting-vacancies"],
    queryFn: async (): Promise<Vacancy[]> => {
      const { data, error } = await supabase
        .from("vacancies")
        .select("*")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Vacancy[];
    },
    staleTime: 60_000,
  });

  return useMemo<ReportingBundle>(() => {
    const options = {
      hospitals:   distinct(runs.map(r => r.hospital).filter(Boolean) as string[]).sort(),
      teamMembers: distinct(runs.map(r => r.created_by).filter(Boolean) as string[]).sort(),
      specialties: distinct(
        runs.map(r => (r.metadata as Record<string, unknown> | null)?.doctor_speciality as string | undefined).filter(Boolean) as string[],
      ).sort(),
    };
    return {
      isLoading: runsLoading || lifeLoading || vacLoading,
      kpis:      computeKpis(runs, lifecycles, filters),
      team:      computeTeamRows(runs, filters),
      hospitals: computeHospitalRows(runs, lifecycles, vacancies, filters),
      trend:     computeTrendBuckets(runs, lifecycles, filters),
      doctorsOnTheWay: computeDoctorsOnTheWay(lifecycles),
      options,
      rawRuns:       runs,
      rawLifecycles: lifecycles,
      filters,
    };
  }, [runs, lifecycles, vacancies, filters, runsLoading, lifeLoading, vacLoading]);
}

function distinct<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
