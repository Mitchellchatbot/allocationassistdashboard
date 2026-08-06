import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import type { FlowKey } from "@/lib/automation-flows";
import {
  HANDOFF_STAGE_KEY, handoffReasonLabel,
  type HandoffMeta, type HandoffReason, type HandoffType,
} from "@/lib/handoff";

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

export interface BulkHandoffInput {
  /** Explicit ids from the dialog's checklist — NOT a blanket
   *  "everything assigned to X". The user deselects what stays behind. */
  run_ids:      string[];
  from_email:   string | null;
  to_email:     string;
  reason:       HandoffReason;
  reason_note?: string | null;
  type:         HandoffType;
  /** Temporary handoffs only. `ends_at` drives the auto-return sweep. */
  starts_at?:   string | null;
  ends_at?:     string | null;
  actor_email:  string | null;
}

export interface BulkHandoffResult {
  moved:    number;
  batch_id: string;
}

/**
 * Bulk handoff — move a set of runs from one HI member to another, with a
 * reason, a type (temporary/permanent) and an audit trail.
 *
 * Why this isn't just `useReassignRun` in a loop:
 *   - one shared `batch_id` so the timeline reads as ONE act, not N coincidences;
 *   - a structured `payload` (reason/type/dates) instead of a prose message,
 *     so handoffs are reportable;
 *   - temporary handoffs stash `metadata.handoff` for tick-scheduler's
 *     runHandoffReturnSweep to revert on the end date.
 *
 * Metadata is merged PER RUN rather than bulk-set: `metadata` also carries the
 * relocation city, interview times and invoice details, so a blanket
 * `.update({ metadata })` across the selection would clobber them.
 */
export function useBulkHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BulkHandoffInput): Promise<BulkHandoffResult> => {
      const ids = [...new Set(input.run_ids)].filter(Boolean);
      if (ids.length === 0) throw new Error("No runs selected.");
      if (input.type === "temporary" && !input.ends_at) {
        throw new Error("A temporary handoff needs an end date.");
      }

      const batchId = crypto.randomUUID();
      const now     = new Date().toISOString();

      // Read current owner + metadata so we can (a) record who a temporary
      // handoff must return to and (b) merge rather than overwrite metadata.
      // Re-asserting status='active' guards against a run completing between
      // the dialog listing it and the user confirming.
      const { data: rows, error: readErr } = await supabase
        .from("automation_flow_runs")
        .select("id, assigned_to, metadata, doctor_name")
        .in("id", ids)
        .eq("status", "active");
      if (readErr) throw readErr;
      const runs = (rows ?? []) as Array<{
        id: string; assigned_to: string | null;
        metadata: Record<string, unknown> | null; doctor_name: string;
      }>;
      if (runs.length === 0) throw new Error("Those runs are no longer active.");

      const patch = {
        assigned_to:   input.to_email,
        reassigned_at: now,
        reassigned_by: input.actor_email,
      };

      if (input.type === "permanent") {
        // Full ownership transfer — nothing to revert, so metadata is left
        // alone and the whole selection moves in one statement.
        const { error } = await supabase
          .from("automation_flow_runs")
          .update(patch)
          .in("id", runs.map(r => r.id))
          .eq("status", "active");
        if (error) throw error;

        // Clear leftover temporary-handoff state so the return sweep doesn't
        // later drag a permanently-transferred run back to its old owner.
        for (const r of runs.filter(r => r.metadata && "handoff" in r.metadata)) {
          const next = { ...(r.metadata ?? {}) };
          delete (next as Record<string, unknown>).handoff;
          await supabase.from("automation_flow_runs")
            .update({ metadata: next }).eq("id", r.id);
        }
      } else {
        // Temporary — per-run merge so the return sweep knows where each run
        // came from without touching the rest of the metadata blob.
        const failures: string[] = [];
        for (const r of runs) {
          const meta: HandoffMeta = {
            batch_id:       batchId,
            original_owner: r.assigned_to ?? input.from_email,
            covering:       input.to_email,
            reason:         input.reason,
            reason_note:    input.reason_note ?? null,
            starts_at:      input.starts_at ?? null,
            ends_at:        input.ends_at as string,
          };
          const { error } = await supabase
            .from("automation_flow_runs")
            .update({ ...patch, metadata: { ...(r.metadata ?? {}), handoff: meta } })
            .eq("id", r.id)
            .eq("status", "active");
          if (error) failures.push(r.doctor_name);
        }
        if (failures.length === runs.length) {
          throw new Error("The handoff failed — no runs were moved.");
        }
        if (failures.length > 0) {
          throw new Error(
            `Moved ${runs.length - failures.length} of ${runs.length}. Failed: ${failures.join(", ")}.`,
          );
        }
      }

      // One structured audit event per run, all sharing the batch id.
      const label = input.type === "temporary"
        ? `Temporary handoff${input.ends_at ? ` until ${input.ends_at}` : ""}`
        : "Permanent handoff";
      const { error: evErr } = await supabase.from("automation_flow_events").insert(
        runs.map(r => ({
          run_id:     r.id,
          stage_key:  HANDOFF_STAGE_KEY,
          event_type: "note",
          message:
            `${label}: ${r.assigned_to ?? "unassigned"} → ${input.to_email}` +
            ` · ${handoffReasonLabel(input.reason)}` +
            (input.reason_note ? ` (${input.reason_note})` : "") +
            (input.actor_email ? ` · by ${input.actor_email}` : ""),
          payload: {
            kind:        "handoff",
            batch_id:    batchId,
            from:        r.assigned_to ?? input.from_email,
            to:          input.to_email,
            reason:      input.reason,
            reason_note: input.reason_note ?? null,
            type:        input.type,
            starts_at:   input.starts_at ?? null,
            ends_at:     input.ends_at ?? null,
            actor:       input.actor_email,
          },
        })),
      );
      // A failed audit write shouldn't hide a successful move — the runs have
      // already changed hands. Surface it in the console and carry on.
      if (evErr) console.error("[handoff] audit events failed to write:", evErr);

      return { moved: runs.length, batch_id: batchId };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: RUNS_KEY });
      for (const id of vars.run_ids) qc.invalidateQueries({ queryKey: EVENTS_KEY(id) });
    },
  });
}
