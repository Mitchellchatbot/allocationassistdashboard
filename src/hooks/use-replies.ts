/**
 * Replies inbox — reads `hospital_replies`, the table the inbound-hospital-reply
 * edge function writes when a reply lands on our Resend inbound address
 * (reply-<run_id>@reply.allocationassist.com). Profile sends default to the
 * generic hello@ From, which routes replies here (hello@ has no real mailbox).
 * Powers the /replies page.
 *
 * Built for scale: the list is SERVER-paginated (range + exact count) with
 * server-side search/filter, so the page never loads more than one screen of
 * rows. The sidebar unread badge is a separate head-only count query. Realtime
 * invalidation keeps both live.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

export type ReplyClassification =
  | "shortlisted" | "proposing_interview" | "declined"
  | "needs_more_info" | "unclear" | "wrong_doctor" | string;

export type ReplyFilter = "all" | "unread" | "handled";

export interface HospitalReply {
  id:               string;
  run_id:           string | null;
  doctor_id:        string | null;
  doctor_name:      string | null;
  hospital_name:    string | null;
  reply_from:       string | null;
  reply_subject:    string | null;
  reply_text:       string;
  reply_html:       string | null;
  reply_message_id: string | null;
  in_reply_to:      string | null;
  classification:   ReplyClassification;
  confidence:       number | null;
  ai_summary:       string | null;
  action_taken:     string | null;
  source:           string;
  is_read:          boolean;
  handled_at:       string | null;
  forwarded_at:     string | null;
  created_at:       string;
  created_by:       string | null;
}

const KEY = ["hospital-replies"] as const;

export interface RepliesPage { rows: HospitalReply[]; total: number; }

/** One server-paginated + server-filtered page of replies. */
export function useRepliesPage(params: { page: number; pageSize: number; search: string; filter: ReplyFilter }) {
  const { page, pageSize, search, filter } = params;
  // Postgrest .or() splits on commas and treats %()* specially — strip them so a
  // stray character can't break the filter string.
  const safe = search.trim().replace(/[,%()*]/g, " ").trim();

  return useQuery({
    queryKey: [...KEY, "page", { page, pageSize, safe, filter }] as const,
    queryFn: async (): Promise<RepliesPage> => {
      const from = page * pageSize;
      let query = supabase
        .from("hospital_replies")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (filter === "unread")  query = query.eq("is_read", false);
      if (filter === "handled") query = query.not("handled_at", "is", null);
      if (safe) {
        query = query.or(
          `reply_from.ilike.%${safe}%,reply_subject.ilike.%${safe}%,reply_text.ilike.%${safe}%,doctor_name.ilike.%${safe}%,hospital_name.ilike.%${safe}%`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as HospitalReply[], total: count ?? 0 };
    },
    staleTime: 15_000,
    placeholderData: keepPreviousData,   // keep the current page visible while the next loads
  });
}

/** Global unread count for the sidebar badge — head-only, cheap. */
export function useUnreadReplyCount(): number {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...KEY, "unread-count"] as const,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("hospital_replies")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
  });
  useTableSubscription("hospital_replies", useCallback(() => {
    qc.invalidateQueries({ queryKey: [...KEY, "unread-count"] });
  }, [qc]));
  return q.data ?? 0;
}

/** Subscribe the list to realtime — invalidate every replies query on change. */
export function useRepliesRealtime() {
  const qc = useQueryClient();
  useTableSubscription("hospital_replies", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));
}

/** Mark a reply read (opening it in the inbox). */
export function useMarkReplyRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hospital_replies").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Toggle the "handled/dealt-with" flag (also marks read). */
export function useMarkReplyHandled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, handled }: { id: string; handled: boolean }) => {
      const { error } = await supabase
        .from("hospital_replies")
        .update({ handled_at: handled ? new Date().toISOString() : null, is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
