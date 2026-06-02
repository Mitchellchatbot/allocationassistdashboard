/**
 * Single hook backing the /my-workspace page. Pulls four scoped datasets
 * for the signed-in HI team member:
 *
 *   1. tasks     — active flow runs assigned to me, bucketed by attention type
 *   2. doctors   — doctor lifecycles where I'm the responsible owner
 *   3. vacancies — open vacancies I opened or own via hospital.owner_email
 *   4. events    — last 7 days of automation_flow_events on my runs
 *
 * Admins falling through to /my-workspace see everything (no scope), so the
 * page also works as a "command center" view for ops leads.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { Vacancy } from "@/hooks/use-vacancies";

export interface WorkspaceDoctor {
  doctor_id:        string;
  doctor_name:      string | null;
  current_stage:    string | null;
  last_event_at:    string | null;
  hospital:         string | null;
  flow_key:         string;
}

export interface WorkspaceEvent {
  id:           string;
  run_id:       string;
  stage_key:    string;
  event_type:   string;
  message:      string | null;
  occurred_at:  string;
  doctor_name:  string | null;
  flow_key:     string | null;
}

export function useMyWorkspace() {
  const { user, role } = useAuth();
  const myEmail = (user?.email ?? "").toLowerCase();
  const scoped  = role === "hi_member" && !!myEmail;

  // Tasks: every active run assigned to me (or all active if admin).
  const tasksQ = useQuery({
    queryKey: ["workspace-tasks", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FlowRun[]> => {
      let q = supabase
        .from("automation_flow_runs")
        .select("*")
        .eq("status", "active")
        .order("last_event_at", { ascending: true })
        .limit(200);
      if (scoped) q = q.ilike("assigned_to", myEmail);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
  });

  // Doctors: distinct doctor_id × most-recent active run assigned to me.
  const doctorsQ = useQuery({
    queryKey: ["workspace-doctors", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<WorkspaceDoctor[]> => {
      let q = supabase
        .from("automation_flow_runs")
        .select("doctor_id, doctor_name, current_stage, last_event_at, hospital, flow_key")
        .eq("status", "active")
        .not("doctor_id", "is", null)
        .order("last_event_at", { ascending: false })
        .limit(100);
      if (scoped) q = q.ilike("assigned_to", myEmail);
      const { data, error } = await q;
      if (error) throw error;
      // Dedupe by doctor_id keeping the most recent row.
      const seen = new Set<string>();
      const out: WorkspaceDoctor[] = [];
      for (const r of (data ?? []) as WorkspaceDoctor[]) {
        if (!r.doctor_id || seen.has(r.doctor_id)) continue;
        seen.add(r.doctor_id);
        out.push(r);
      }
      return out.slice(0, 12);
    },
  });

  // Vacancies: open ones I own (opened_by OR hospital.owner_email = me).
  const vacanciesQ = useQuery({
    queryKey: ["workspace-vacancies", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<Vacancy[]> => {
      const baseQ = supabase
        .from("vacancies")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(50);
      if (!scoped) {
        const { data, error } = await baseQ;
        if (error) throw error;
        return (data ?? []) as Vacancy[];
      }

      // Two-pass: opened_by-me + hospitals where I'm the owner.
      const { data: ownedHospitals } = await supabase
        .from("hospitals").select("name").ilike("owner_email", myEmail);
      const hospitalNames = (ownedHospitals ?? []).map((h: { name: string }) => h.name);
      let q = baseQ;
      if (hospitalNames.length > 0) {
        // PostgREST `or` requires a single OR string; build one.
        const hospitalsList = hospitalNames.map(n => `hospital_name.ilike.${n.replace(/,/g, "")}`).join(",");
        q = q.or(`opened_by.ilike.${myEmail},${hospitalsList}`);
      } else {
        q = q.ilike("opened_by", myEmail);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Vacancy[];
    },
  });

  // Recent events on my runs (last 7 days).
  const eventsQ = useQuery({
    queryKey: ["workspace-events", myEmail, scoped],
    enabled:  !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<WorkspaceEvent[]> => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      let runIds: string[] | null = null;
      if (scoped) {
        const { data: myRuns } = await supabase
          .from("automation_flow_runs")
          .select("id")
          .ilike("assigned_to", myEmail)
          .limit(500);
        runIds = (myRuns ?? []).map((r: { id: string }) => r.id);
        if (runIds.length === 0) return [];
      }
      let q = supabase
        .from("automation_flow_events")
        .select("id, run_id, stage_key, event_type, message, occurred_at, automation_flow_runs(doctor_name, flow_key)")
        .gt("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(80);
      if (runIds) q = q.in("run_id", runIds);
      const { data, error } = await q;
      if (error) throw error;
      // Flatten the join shape.
      return (data ?? []).map((e) => {
        const joined = (e as { automation_flow_runs?: { doctor_name?: string; flow_key?: string } | null }).automation_flow_runs ?? {};
        return {
          id: e.id,
          run_id: e.run_id,
          stage_key: e.stage_key,
          event_type: e.event_type,
          message: e.message,
          occurred_at: e.occurred_at,
          doctor_name: joined.doctor_name ?? null,
          flow_key:    joined.flow_key ?? null,
        } as WorkspaceEvent;
      });
    },
  });

  return {
    myEmail,
    scoped,
    isLoading: tasksQ.isLoading || doctorsQ.isLoading || vacanciesQ.isLoading,
    tasks:     tasksQ.data ?? [],
    doctors:   doctorsQ.data ?? [],
    vacancies: vacanciesQ.data ?? [],
    events:    eventsQ.data ?? [],
  };
}
