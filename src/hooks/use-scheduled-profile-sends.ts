import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import type { BatchRecurrence } from "@/hooks/use-scheduled-batches";

/**
 * use-scheduled-profile-sends — Amir #5. CRUD for scheduled Send-Profile
 * campaigns (scheduled_profile_sends). Mirrors use-scheduled-batches. The
 * actual firing is server-side (deploy-gated); the UI fully manages the queue
 * (create on schedule, reschedule, cancel) and is testable in npm run dev.
 */
export interface ScheduledProfileSend {
  id:                 string;
  doctor_id:          string;
  doctor_name:        string;
  doctor_email:       string | null;
  doctor_speciality:  string | null;
  hospital_ids:       string[];
  custom_message:     string | null;
  bcc_override:       string[] | null;
  cc_override:        string[] | null;
  stage_overrides:    Record<string, unknown> | null;
  template_overrides: Record<string, string> | null;
  attachments:        Array<{ filename: string; path: string }>;
  attachments_doctor: Array<{ filename: string; path: string }>;
  scheduled_for:      string;
  scheduled_at_time:  string | null;
  timezone:           string | null;
  recurrence:         BatchRecurrence | null;
  status:             "draft" | "scheduled" | "sent" | "cancelled" | "failed";
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface ScheduleProfileSendInput {
  doctor_id:          string;
  doctor_name:        string;
  doctor_email?:      string | null;
  doctor_phone?:      string | null;
  doctor_speciality?: string | null;
  hospital_ids:       string[];
  custom_message?:    string | null;
  bcc_override?:      string[] | null;
  cc_override?:       string[] | null;
  stage_overrides?:   Record<string, unknown> | null;
  template_overrides?: Record<string, string> | null;
  attachments?:       Array<{ filename: string; path: string }>;
  attachments_doctor?: Array<{ filename: string; path: string }>;
  scheduled_for:      string;
  scheduled_at_time?: string | null;
  timezone?:          string | null;
  recurrence?:        BatchRecurrence | null;
}

const KEY = ["scheduled-profile-sends"] as const;

export function useScheduledProfileSends() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ScheduledProfileSend[]> => {
      const { data, error } = await supabase
        .from("scheduled_profile_sends")
        .select("*")
        .neq("status", "cancelled")
        .order("scheduled_for", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ScheduledProfileSend[];
    },
    staleTime: 30_000,
  });
  useTableSubscription("scheduled_profile_sends", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));
  return q;
}

export function useScheduleProfileSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleProfileSendInput): Promise<ScheduledProfileSend> => {
      const { data: sess } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("scheduled_profile_sends")
        .insert({
          ...input,
          attachments:        input.attachments ?? [],
          attachments_doctor: input.attachments_doctor ?? [],
          recurrence:  input.recurrence ?? { freq: "none" },
          timezone:    input.timezone ?? "Asia/Dubai",
          status:      "draft",
          created_by:  sess.session?.user.email ?? null,
          updated_at:  new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message || "Could not schedule the send");
      return data as ScheduledProfileSend;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelScheduledProfileSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scheduled_profile_sends").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
