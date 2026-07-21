/**
 * Phase 4 — Doctor lifecycle persistence + transitions.
 *
 *   useDoctorLifecycle(doctorId)        — single doctor row (auto-creates a
 *                                         blank row on first write).
 *   useDoctorLifecycleMap()             — bulk fetch keyed by doctor_id, for
 *                                         filtering / table views.
 *   useMarkLifecycle()                  — mutation that does ONE transition
 *                                         at a time and writes the side
 *                                         effects (eligibility flip on signed,
 *                                         second-payment trigger on joined,
 *                                         Slack-archive notification on
 *                                         approved). See README in the
 *                                         function body for the matrix.
 */
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface DoctorLifecycle {
  doctor_id:                 string;
  doctor_name:               string | null;
  // Placement milestones (Ammar 2026-06-03 — replaces Hammad sheet).
  // shortlisted_at / interviewed_at / offered_at / start_date were
  // added on 20260603000005_placements.sql.
  shortlisted_at:            string | null;
  interviewed_at:            string | null;
  offered_at:                string | null;
  signed_at:                 string | null;
  start_date:                string | null;
  joined_at:                 string | null;
  approved_at:               string | null;
  paid_at:                   string | null;
  placement_hospital_id:     string | null;
  placement_hospital_name:   string | null;
  eligible_for_sending:      boolean;
  unavailable:               boolean;
  unavailable_reason:        string | null;
  available_check_in_at:     string | null;
  last_availability_ping_at: string | null;
  notes:                     string | null;
  updated_by:                string | null;
  created_at:                string;
  updated_at:                string;
}

const LIST_KEY  = ["doctor-lifecycles"] as const;
const ONE_KEY   = (id: string) => ["doctor-lifecycle", id] as const;

export function useDoctorLifecycle(doctorId: string | null | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ONE_KEY(doctorId ?? "_"),
    enabled:  !!doctorId,
    queryFn: async (): Promise<DoctorLifecycle | null> => {
      if (!doctorId) return null;
      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .select("*")
        .eq("doctor_id", doctorId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DoctorLifecycle | null;
    },
    staleTime: 30_000,
  });

  // Realtime: lifecycle changes elsewhere (other teammate marks joined,
  // tick-scheduler bumps last_availability_ping_at) should reflect here.
  useEffect(() => {
    if (!doctorId) return;
    // Random suffix on the channel name is intentional — multiple
    // components can call useDoctorLifecycle for the same doctor (e.g.
    // DoctorLifecycleCard + DoctorProgress row + the modal), and
    // supabase-js throws "cannot add postgres_changes callbacks after
    // subscribe()" if you reuse a channel name across mounts. Same
    // pattern as use-contract-activity.ts.
    const channel = supabase
      .channel(`doctor_lifecycle_${doctorId}_${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "doctor_lifecycle", filter: `doctor_id=eq.${doctorId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ONE_KEY(doctorId) });
        qc.invalidateQueries({ queryKey: LIST_KEY });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [doctorId, qc]);

  return q;
}

export function useDoctorLifecycleMap(): Record<string, DoctorLifecycle> {
  const { data = [] } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<DoctorLifecycle[]> => {
      // Supabase API gateway caps responses at 1000 rows server-side
      // regardless of .limit(). Paginate via .range() to get them all.
      const PAGE = 1000;
      const all: DoctorLifecycle[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("doctor_lifecycle")
          .select("*")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as DoctorLifecycle[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
    staleTime: 30_000,
  });

  // Memoize on `data` — WITHOUT this the map was a brand-new object every
  // render, which invalidated every downstream memo that keys on it
  // (useMemoDoctors, the batch specialty-rotation scoring, candidatePool…),
  // recomputing the whole doctor pool + scores on every render. That was the
  // main reason the Batches page felt slow.
  return useMemo(() => {
    const map: Record<string, DoctorLifecycle> = {};
    for (const row of data) map[row.doctor_id] = row;
    return map;
  }, [data]);
}

export type LifecycleAction =
  // Placement milestones (Ammar 2026-06-03 — replaces Hammad sheet).
  // Each takes the date the team is logging, so backdated entries work
  // (the team often logs days after the event by phone).
  | { kind: "mark_shortlisted"; date: string }
  | { kind: "mark_interviewed"; date: string }
  | { kind: "mark_offered";     date: string }
  | { kind: "mark_signed"; date?: string }
  | { kind: "mark_start_date";  date: string }
  | { kind: "mark_joined";      joiningDate: string }      // ISO date
  | { kind: "mark_approved"   }
  | { kind: "mark_paid"; date?: string }
  | { kind: "set_placement_hospital"; hospitalId: string | null; hospitalName: string | null }
  | { kind: "mark_unavailable"; reason: string; checkInAt: string }   // ISO datetime
  | { kind: "mark_available"  }
  | { kind: "push_checkin";   newCheckInAt: string }
  | { kind: "set_eligibility"; eligible: boolean };

/** Single mutation that handles every lifecycle transition + its side effects.
 *  Keeping it in one place stops the page code from re-implementing the
 *  matrix (e.g. "signed flips eligibility off; joined fires second-payment
 *  flow; approved writes a Slack-archive notification"). */
export function useMarkLifecycle() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ doctorId, doctorName, action }: {
      doctorId:   string;
      doctorName: string;
      action:     LifecycleAction;
    }) => {
      const now = new Date().toISOString();
      const updatedBy = user?.email ?? null;
      const patch: Partial<DoctorLifecycle> & { doctor_id: string; doctor_name: string; updated_at: string; updated_by: string | null } = {
        doctor_id:   doctorId,
        doctor_name: doctorName,
        updated_at:  now,
        updated_by:  updatedBy,
      };

      switch (action.kind) {
        case "mark_shortlisted":
          patch.shortlisted_at = action.date;
          break;
        case "mark_interviewed":
          patch.interviewed_at = action.date;
          break;
        case "mark_offered":
          patch.offered_at = action.date;
          break;
        case "mark_signed":
          patch.signed_at = action.date ?? now;
          patch.eligible_for_sending = false;       // spec: signed doctors stop appearing in send batches
          break;
        case "mark_start_date":
          patch.start_date = action.date;
          break;
        case "mark_joined":
          patch.joined_at = action.joiningDate;
          break;
        case "mark_approved":
          patch.approved_at = now;
          break;
        case "mark_paid":
          patch.paid_at = action.date ?? now;
          break;
        case "set_placement_hospital":
          patch.placement_hospital_id = action.hospitalId;
          patch.placement_hospital_name = action.hospitalName;
          break;
        case "mark_unavailable":
          patch.unavailable = true;
          patch.unavailable_reason = action.reason;
          patch.available_check_in_at = action.checkInAt;
          patch.eligible_for_sending  = false;       // pause sending too while paused
          break;
        case "mark_available":
          patch.unavailable = false;
          patch.unavailable_reason = null;
          patch.available_check_in_at = null;
          // Re-enable sending only if not already signed.
          patch.eligible_for_sending = true;
          break;
        case "push_checkin":
          patch.available_check_in_at = action.newCheckInAt;
          patch.last_availability_ping_at = null;    // reset so a fresh nudge fires
          break;
        case "set_eligibility":
          patch.eligible_for_sending = action.eligible;
          break;
      }

      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .upsert(patch, { onConflict: "doctor_id" })
        .select("*")
        .single();
      if (error) throw error;

      // Side effects ─────────────────────────────────────────────────────
      if (action.kind === "mark_joined") {
        // Kick off Second Payment flow at trigger_15_days. The tick-scheduler
        // will advance to send_invoice 15 days from joiningDate.
        await ensureSecondPaymentRun(doctorId, doctorName, action.joiningDate);
      }
      if (action.kind === "mark_approved") {
        // We don't have a Slack API yet — write a notification so the team
        // remembers to archive the channel manually.
        // Inserted client-side (we can't call the edge notify() helper from
        // the browser), so we set severity + CTA explicitly here to match
        // the kind catalog — otherwise it silently defaults to 'info' and
        // hides in the bell's quiet tier despite being actionable.
        await supabase.from("notifications").insert({
          kind:                "slack_archive_due",
          title:               `Archive Slack channel — ${doctorName}`,
          body:                `${doctorName} is joined + approved. Per Saif's spec, archive the dedicated Slack channel to stop the per-doctor subscription cost.`,
          link_path:           `/doctor-profiles`,
          related_doctor_id:   doctorId,
          for_user:            updatedBy,
          severity:            "action",
          cta_label:           "Archive channel",
          cta_kind:            "open_doctor",
        });
      }

      return data as DoctorLifecycle;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ONE_KEY(vars.doctorId) });
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** When a doctor is marked Joined, queue up the Second Payment flow at the
 *  trigger_15_days stage. The tick-scheduler reads metadata.joining_date and
 *  fires the invoice 15 calendar days later. Idempotent — won't double-create
 *  if a run already exists. Exported so the placement_attempts editor
 *  can fire it directly when a join date lands without going through
 *  useMarkLifecycle (the DB trigger already syncs lifecycle.joined_at). */
export async function ensureSecondPaymentRun(doctorId: string, doctorName: string, joiningDate: string): Promise<void> {
  // Already a run for this doctor?
  const { data: existing } = await supabase
    .from("automation_flow_runs")
    .select("id, status, current_stage")
    .eq("doctor_id", doctorId)
    .eq("flow_key",  "second_payment")
    .order("started_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const r = existing[0];
    // Re-anchor the joining_date timer if the team corrected it. Merge
    // into the existing metadata blob so other fields (e.g. triggered_via,
    // hospital_id, anything tick-scheduler stamps in) don't get wiped.
    const { data: prev } = await supabase
      .from("automation_flow_runs")
      .select("metadata")
      .eq("id", r.id)
      .maybeSingle();
    const merged = { ...((prev?.metadata as Record<string, unknown>) ?? {}), joining_date: joiningDate };
    await supabase.from("automation_flow_runs")
      .update({ metadata: merged, last_event_at: new Date().toISOString() })
      .eq("id", r.id);
    return;
  }

  // Pull the email of whoever's logged in — best-effort attribution for
  // Reports. The auth session is in localStorage so we read it lazily
  // rather than threading user state through every caller.
  const { data: sess } = await supabase.auth.getSession();
  const createdBy = sess.session?.user.email ?? null;
  await supabase.from("automation_flow_runs").insert({
    flow_key:      "second_payment",
    doctor_id:     doctorId,
    doctor_name:   doctorName,
    current_stage: "trigger_15_days",
    status:        "active",
    created_by:    createdBy,
    metadata:      { joining_date: joiningDate, triggered_via: "lifecycle_mark_joined" },
  });
}
