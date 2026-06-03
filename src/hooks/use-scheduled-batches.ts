/**
 * Phase 6 — Recurring batch sends + specialty rotation hooks.
 *
 *   useScheduledBatches()       — every batch row, with realtime updates
 *   useSpecialtyRotation()      — singleton queue + cursor for specialty_of_day
 *   useUpsertBatch / useUpdateBatch / useCancelBatch
 *   useSendBatchNow             — invokes the send-batch edge function
 *   useUpdateSpecialtyRotation  — edits the queue
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

export type BatchKind   = "daily_duo" | "tuesday_top_15" | "specialty_of_day";
export type BatchStatus = "draft" | "sent" | "cancelled" | "failed";

export interface ScheduledBatch {
  id:               string;
  kind:             BatchKind;
  scheduled_for:    string;             // ISO date
  specialty:        string | null;
  // ISO-or-display country name (UAE / Saudi Arabia / Qatar / Oman / etc).
  // When set, send-batch filters hospitals to those whose country matches.
  // Null = all hospitals (legacy / broadcast). Ammar 2026-06-03 spec is
  // that going forward every batch picks a country at create time.
  country:          string | null;
  status:           BatchStatus;
  doctor_ids:       string[];
  hospital_count:   number | null;
  sent_at:          string | null;
  sent_message_id:  string | null;
  error:            string | null;
  notes:            string | null;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

export interface SpecialtyRotation {
  id:                  number;
  queue:               string[];
  cursor_index:        number;
  last_sent_specialty: string | null;
  last_sent_at:        string | null;
  updated_at:          string;
}

const BATCHES_KEY  = ["scheduled-batches"] as const;
const ROTATION_KEY = ["specialty-rotation"] as const;

export function useScheduledBatches() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: BATCHES_KEY,
    queryFn: async (): Promise<ScheduledBatch[]> => {
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .select("*")
        .order("scheduled_for", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ScheduledBatch[];
    },
    staleTime: 30_000,
  });

  useTableSubscription("scheduled_batch_sends", useCallback(() => {
    qc.invalidateQueries({ queryKey: BATCHES_KEY });
  }, [qc]));

  return q;
}

export function useSpecialtyRotation() {
  return useQuery({
    queryKey: ROTATION_KEY,
    queryFn: async (): Promise<SpecialtyRotation> => {
      const { data, error } = await supabase
        .from("specialty_rotation_state")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as SpecialtyRotation;
    },
    staleTime: 30_000,
  });
}

export interface UpsertBatchInput {
  id?:            string;
  kind:           BatchKind;
  scheduled_for:  string;
  specialty?:     string | null;
  country?:       string | null;
  doctor_ids?:    string[];
  notes?:         string | null;
}

export function useUpsertBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBatchInput): Promise<ScheduledBatch> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        kind:          input.kind,
        scheduled_for: input.scheduled_for,
        specialty:     input.specialty ?? null,
        country:       input.country   ?? null,
        doctor_ids:    input.doctor_ids ?? [],
        notes:         input.notes ?? null,
        created_by:    createdBy,
        updated_at:    new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScheduledBatch;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useUpdateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ScheduledBatch> }): Promise<ScheduledBatch> => {
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ScheduledBatch;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useCancelBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> => {
      // Cancel = delete. A cancelled draft was never sent, so there's no
      // audit value in keeping the row around — and leaving it in "Past
      // sends" was the source of "I cancelled but it's still there" confusion.
      // The send-batch + tick-scheduler functions already reject non-draft
      // status, so there's no race window where a deleted batch can still
      // fire. .select().single() forces Supabase to throw if 0 rows match.
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .delete()
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Cancel touched 0 rows — does the batch still exist?");
      return data;
    },
    // Optimistic removal — row disappears from the list instantly.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: BATCHES_KEY });
      const prev = qc.getQueryData<ScheduledBatch[]>(BATCHES_KEY);
      if (prev) {
        qc.setQueryData<ScheduledBatch[]>(BATCHES_KEY, prev.filter(b => b.id !== id));
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(BATCHES_KEY, ctx.prev);  // rollback
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useSendBatchNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { batchId: string; force?: boolean }): Promise<{ ok: boolean; bcc_count?: number; doctor_count?: number; message_id?: string; error?: string }> => {
      // Accept either a bare id (legacy callers) or an object with a force
      // flag (used by the Resend button to re-fire an already-sent batch).
      const batchId = typeof input === "string" ? input : input.batchId;
      const force   = typeof input === "string" ? false  : !!input.force;
      const { data, error } = await supabase.functions.invoke("send-batch", { body: { batch_id: batchId, force } });
      if (error) throw error;
      const res = data as { ok: boolean; bcc_count?: number; doctor_count?: number; message_id?: string; error?: string };
      if (!res.ok) throw new Error(res.error ?? "send-batch failed");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BATCHES_KEY });
      qc.invalidateQueries({ queryKey: ROTATION_KEY });
    },
  });
}

export function useUpdateSpecialtyRotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { queue?: string[]; cursor_index?: number }): Promise<SpecialtyRotation> => {
      const { data, error } = await supabase
        .from("specialty_rotation_state")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return data as SpecialtyRotation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROTATION_KEY }),
  });
}
