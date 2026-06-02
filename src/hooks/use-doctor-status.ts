/**
 * Phase 4 — Doctor status hooks.
 *
 * `useDoctorStatus(doctorId)`       — derives status for a single doctor.
 * `useDoctorStatusMap(doctorIds[])` — bulk-fetch + derive for a list (used by
 *                                     DoctorProfiles to render a status badge
 *                                     on every card without N+1 queries).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FlowRun } from "@/hooks/use-automation-flows";
import { useDoctorLifecycle, useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { deriveDoctorStatus, type DoctorStatusInfo } from "@/lib/doctor-status";

export function useDoctorStatus(doctorId: string | null | undefined): DoctorStatusInfo | null {
  const { data: runs = [] } = useQuery({
    queryKey: ["doctor-runs", doctorId],
    enabled: !!doctorId,
    queryFn: async (): Promise<FlowRun[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 30_000,
  });
  const { data: lifecycle = null } = useDoctorLifecycle(doctorId);

  return useMemo(
    () => (doctorId ? deriveDoctorStatus(runs, lifecycle) : null),
    [doctorId, runs, lifecycle],
  );
}

export function useDoctorStatusMap(doctorIds: string[]): Record<string, DoctorStatusInfo> {
  // Single fetch, group client-side. Keeps the doctor profile page from
  // firing one query per card.
  const idsKey = useMemo(() => [...new Set(doctorIds)].sort().join(","), [doctorIds]);

  const { data: runs = [] } = useQuery({
    queryKey: ["doctor-status-bulk", idsKey],
    enabled:  doctorIds.length > 0,
    queryFn: async (): Promise<FlowRun[]> => {
      if (doctorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .in("doctor_id", [...new Set(doctorIds)]);
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 30_000,
  });
  const lifecycleMap = useDoctorLifecycleMap();

  return useMemo(() => {
    const byDoctor = new Map<string, FlowRun[]>();
    for (const r of runs) {
      if (!r.doctor_id) continue;
      if (!byDoctor.has(r.doctor_id)) byDoctor.set(r.doctor_id, []);
      byDoctor.get(r.doctor_id)!.push(r);
    }
    const out: Record<string, DoctorStatusInfo> = {};
    for (const id of doctorIds) {
      out[id] = deriveDoctorStatus(byDoctor.get(id) ?? [], lifecycleMap[id] ?? null);
    }
    return out;
  }, [runs, doctorIds, lifecycleMap]);
}
