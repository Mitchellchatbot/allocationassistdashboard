import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import type { FlowKey } from "@/lib/automation-flows";

export type RunStatus = "active" | "completed" | "paused" | "failed";

export interface FlowRun {
  id:             string;
  flow_key:       FlowKey;
  doctor_id:      string | null;
  doctor_name:    string;
  doctor_email:   string | null;
  doctor_phone:   string | null;
  current_stage:  string;
  status:         RunStatus;
  hospital:       string | null;
  started_at:     string;
  last_event_at:  string;
  completed_at:   string | null;
  metadata:       Record<string, unknown>;
  /** Email of the HI team member who triggered this run. Stamped at
   *  insert time; never moves. Use this for "who started this work" UI. */
  created_by:     string | null;
  /** Email of the HI team member currently responsible. Auto-derived
   *  from the hospital's owner_email by a DB trigger, or set explicitly
   *  via the Reassign button. Use this for "who needs to take the next
   *  action" UI — My Workspace, Approval Queues, scoped notifications. */
  assigned_to:    string | null;
  reassigned_at:  string | null;
  reassigned_by:  string | null;
}

export interface FlowEvent {
  id:           string;
  run_id:       string;
  stage_key:    string;
  event_type:   "entered" | "email_sent" | "email_opened" | "reminder_sent" | "note" | "error" | "completed";
  message:      string | null;
  payload:      Record<string, unknown>;
  occurred_at:  string;
}

export interface StageOverride {
  subject?:    string;
  delayDays?:  number;
  enabled?:    boolean;
  notes?:      string;
}

export interface FlowConfig {
  flow_key:        FlowKey;
  name:            string;
  description:     string | null;
  enabled:         boolean;
  stage_overrides: Record<string, StageOverride>;
  updated_at:      string;
  updated_by:      string | null;
}

const RUNS_KEY    = ["automation-flow-runs"] as const;
const EVENTS_KEY  = (runId: string) => ["automation-flow-events", runId] as const;
const CONFIGS_KEY = ["automation-flow-configs"] as const;

/** All flow runs across all flows. Filtering by flow_key happens client-side
 *  since the volume is small (hundreds, not thousands) and lets the page
 *  switch tabs without refetching. */
export function useAutomationFlowRuns() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: RUNS_KEY,
    queryFn: async (): Promise<FlowRun[]> => {
      const { data, error } = await supabase
        .from("automation_flow_runs")
        .select("*")
        .order("last_event_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as FlowRun[];
    },
    staleTime: 30_000,
  });

  // Realtime: when the sender inserts/updates a run, refresh. Subscription
  // is deduped across the app via the realtime registry.
  useTableSubscription("automation_flow_runs", useCallback(() => {
    qc.invalidateQueries({ queryKey: RUNS_KEY });
  }, [qc]));

  return query;
}

/** Per-run event timeline for the n8n-style detail view. */
export function useFlowRunEvents(runId: string | null) {
  return useQuery({
    queryKey: runId ? EVENTS_KEY(runId) : ["automation-flow-events", "none"],
    enabled: !!runId,
    queryFn: async (): Promise<FlowEvent[]> => {
      if (!runId) return [];
      const { data, error } = await supabase
        .from("automation_flow_events")
        .select("*")
        .eq("run_id", runId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FlowEvent[];
    },
    staleTime: 15_000,
  });
}

/** Editable per-flow default config (subject lines, delays, on/off). */
export function useFlowConfigs() {
  return useQuery({
    queryKey: CONFIGS_KEY,
    queryFn: async (): Promise<FlowConfig[]> => {
      const { data, error } = await supabase
        .from("automation_flow_configs")
        .select("*")
        .order("flow_key");
      if (error) throw error;
      return (data ?? []) as FlowConfig[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateFlowConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { flow_key: FlowKey; enabled?: boolean; stage_overrides?: Record<string, StageOverride> }) => {
      const { error } = await supabase
        .from("automation_flow_configs")
        .update({
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.stage_overrides !== undefined ? { stage_overrides: patch.stage_overrides } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("flow_key", patch.flow_key);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: CONFIGS_KEY }); },
  });
}

/** Append a freeform note event to a run's timeline (used by the side panel
 *  in the run-detail drawer). */
export function useAddRunNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { run_id: string; stage_key: string; message: string }) => {
      const { error } = await supabase
        .from("automation_flow_events")
        .insert({
          run_id:     input.run_id,
          stage_key:  input.stage_key,
          event_type: "note",
          message:    input.message,
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY(vars.run_id) });
      qc.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}

/** Reassign a flow run to a new HI team member. Used by the Reassign
 *  dropdown on RunDetailSheet + Approval Queue rows. Logs the handoff
 *  on the run row (reassigned_at, reassigned_by) and emits a note event
 *  so the timeline shows who moved it and when. */
export function useReassignRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { run_id: string; to_email: string | null; current_user_email: string | null }) => {
      const now = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("automation_flow_runs")
        .update({
          assigned_to:   input.to_email,
          reassigned_at: now,
          reassigned_by: input.current_user_email,
        })
        .eq("id", input.run_id);
      if (updateErr) throw updateErr;

      const message = input.to_email
        ? `Reassigned to ${input.to_email}${input.current_user_email ? ` by ${input.current_user_email}` : ""}`
        : `Unassigned${input.current_user_email ? ` by ${input.current_user_email}` : ""}`;
      await supabase.from("automation_flow_events").insert({
        run_id:     input.run_id,
        stage_key:  "reassign",
        event_type: "note",
        message,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY(vars.run_id) });
      qc.invalidateQueries({ queryKey: RUNS_KEY });
    },
  });
}
