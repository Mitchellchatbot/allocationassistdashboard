/**
 * Single hook backing the /my-workspace page. Pulls every scoped dataset
 * for the signed-in HI team member so the page can render "what's on my
 * plate" across the whole pipeline — not just the automation flows:
 *
 *   1. tasks     — active flow runs assigned to me, bucketed by attention type
 *   2. doctors   — doctor lifecycles where I'm the responsible owner
 *   3. vacancies — open vacancies I opened or own via hospital.owner_email
 *   4. events    — last 7 days of automation_flow_events on my runs
 *   5. leads     — form_responses I own (or unowned/new) that need contact:
 *                  overdue follow-ups + uncontacted leads, paid leads first
 *   6. staged    — staged_doctor_profiles I created, awaiting publish
 *   7. cvChase   — pending/failed cv_uploads to chase (resend the link)
 *   8. contracts — contract_sends stuck in sent/viewed or expired/failed
 *   9. placements— placement_attempts I created, stuck mid-funnel
 *
 * Owner-scoping mirrors the queries the feature pages already use (Forms'
 * 'mine' filter, the created_by columns on staging / CV / placements), so
 * a row shows up here exactly when it shows up as "mine" elsewhere.
 *
 * Admins falling through to /my-workspace see everything (no scope), so the
 * page also works as a "command center" view for ops leads.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { FlowRun } from "@/hooks/use-automation-flows";
import type { Vacancy } from "@/hooks/use-vacancies";
import type { FormResponse } from "@/hooks/use-forms";
import type { StagedProfile } from "@/hooks/use-wp-candidates";
import type { CvUpload } from "@/hooks/use-cv-uploads";
import type { ContractSendRow } from "@/hooks/use-contract-activity";
import type { PlacementAttempt } from "@/hooks/use-placement-attempts";

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

/** A form_response that needs contact, enriched with its form's per-lead
 *  value so the page can flag + pin PAID leads ($750 DoctorsFinder). */
export interface WorkspaceLead extends FormResponse {
  /** Per-lead value in cents, copied from the parent form. >0 = paid. */
  lead_value_cents: number;
  /** True when next_followup_at is set and in the past. */
  overdue:          boolean;
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

  // Leads to contact: form_responses I own (or unowned + new) that need a
  // touch — overdue follow-ups + uncontacted leads. Mirrors the Forms
  // page's 'mine' filter (use-forms.ts ~203-213): open lifecycle, owner =
  // me OR null. Each row is enriched with its parent form's
  // lead_value_cents so PAID leads ($750 DoctorsFinder) can be pinned +
  // flagged on top.
  const leadsQ = useQuery({
    queryKey: ["workspace-leads", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<WorkspaceLead[]> => {
      // Per-lead value lives on the parent form, not the response. The
      // forms table is tiny, so one fetch gives us the cents lookup.
      const { data: formsRows } = await supabase
        .from("forms")
        .select("id, lead_value_cents");
      const centsByForm = new Map<string, number>();
      for (const f of (formsRows ?? []) as Array<{ id: string; lead_value_cents: number | null }>) {
        centsByForm.set(f.id, f.lead_value_cents ?? 0);
      }

      let q = supabase
        .from("form_responses")
        .select("*")
        .is("archived_at", null)
        .not("outreach_status", "in", "(closed,declined)")
        .order("submitted_at", { ascending: false })
        .limit(200);
      // Owner scope — owned by me OR still untouched (no owner). Same OR
      // clause the Forms page builds for its 'mine' chip.
      if (scoped) {
        q = q.or(`outreach_owner.eq.${myEmail},outreach_owner.is.null`);
      }
      const { data, error } = await q;
      if (error) throw error;

      const now = Date.now();
      const rows = ((data ?? []) as FormResponse[])
        // Keep only rows that actually need attention: an overdue
        // follow-up, or a brand-new lead nobody has contacted yet.
        .filter(r => {
          const overdue = !!r.next_followup_at && new Date(r.next_followup_at).getTime() < now;
          const uncontacted = r.outreach_status === "new" && !r.last_contacted_at;
          return overdue || uncontacted;
        })
        .map<WorkspaceLead>(r => ({
          ...r,
          lead_value_cents: centsByForm.get(r.form_id) ?? 0,
          overdue: !!r.next_followup_at && new Date(r.next_followup_at).getTime() < now,
        }));

      // Paid leads first, then overdue, then most recent.
      rows.sort((a, b) => {
        if ((b.lead_value_cents > 0 ? 1 : 0) !== (a.lead_value_cents > 0 ? 1 : 0))
          return (b.lead_value_cents > 0 ? 1 : 0) - (a.lead_value_cents > 0 ? 1 : 0);
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      });
      return rows.slice(0, 50);
    },
  });

  // Staged WP profiles I created, awaiting publish to WordPress.
  const stagedQ = useQuery({
    queryKey: ["workspace-staged", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<StagedProfile[]> => {
      let q = supabase
        .from("staged_doctor_profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (scoped) q = q.ilike("created_by", myEmail);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StagedProfile[];
    },
  });

  // CV uploads to chase — pending (link sent, doctor hasn't uploaded) +
  // failed (extraction errored). usePendingCvUploads only covers the
  // pending slice; we widen to failed here so both surface in one card.
  const cvChaseQ = useQuery({
    queryKey: ["workspace-cv-chase", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<CvUpload[]> => {
      let q = supabase
        .from("cv_uploads")
        .select("*")
        .in("status", ["pending_upload", "failed"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (scoped) q = q.ilike("created_by", myEmail);
      const { data, error } = await q;
      if (error) throw error;
      // Drop expired pending requests — a dead link isn't actionable as-is
      // (the resend mints a fresh one). Failed rows always stay.
      const now = Date.now();
      return ((data ?? []) as CvUpload[]).filter(c =>
        c.status === "failed" || new Date(c.expires_at).getTime() > now);
    },
  });

  // Contracts stuck in flight — sent/viewed (awaiting signature) or
  // expired/failed (need a resend). contract_sends has no owner column,
  // so HI members see the whole stuck set (small table) and admins do too.
  const contractsQ = useQuery({
    queryKey: ["workspace-contracts", myEmail],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<ContractSendRow[]> => {
      const { data, error } = await supabase
        .from("contract_sends")
        .select("*")
        .in("status", ["sent", "viewed", "expired", "failed"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ContractSendRow[];
    },
  });

  // Placements I created that are stuck mid-funnel — shortlisted /
  // interviewed / offered / signed but not yet joined. Once joined_at
  // lands the Second-Payment flow takes over, so we stop surfacing them.
  const placementsQ = useQuery({
    queryKey: ["workspace-placements", myEmail, scoped],
    enabled:  !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<PlacementAttempt[]> => {
      let q = supabase
        .from("placement_attempts")
        .select("*")
        .is("joined_at", null)
        .not("shortlisted_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (scoped) q = q.ilike("created_by", myEmail);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlacementAttempt[];
    },
  });

  return {
    myEmail,
    scoped,
    isLoading:
      tasksQ.isLoading || doctorsQ.isLoading || vacanciesQ.isLoading ||
      leadsQ.isLoading || stagedQ.isLoading || cvChaseQ.isLoading ||
      contractsQ.isLoading || placementsQ.isLoading,
    tasks:      tasksQ.data ?? [],
    doctors:    doctorsQ.data ?? [],
    vacancies:  vacanciesQ.data ?? [],
    events:     eventsQ.data ?? [],
    leads:      leadsQ.data ?? [],
    staged:     stagedQ.data ?? [],
    cvChase:    cvChaseQ.data ?? [],
    contracts:  contractsQ.data ?? [],
    placements: placementsQ.data ?? [],
  };
}
