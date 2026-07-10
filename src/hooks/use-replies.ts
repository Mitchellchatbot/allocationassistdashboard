/**
 * Replies inbox — reads `hospital_replies`, the table the inbound-hospital-reply
 * edge function writes when a reply lands on our Resend inbound address
 * (reply-<run_id>@reply.allocationassist.com). Profile sends default to the
 * generic hello@ From, which routes replies here (hello@ has no real mailbox).
 * Powers the /replies page. Mirrors use-notifications (useQuery + realtime).
 */
import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

export type ReplyClassification =
  | "shortlisted" | "proposing_interview" | "declined"
  | "needs_more_info" | "unclear" | "wrong_doctor" | string;

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
const EMPTY: HospitalReply[] = [];

export function useReplies(): { replies: HospitalReply[]; unreadCount: number; isLoading: boolean } {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<HospitalReply[]> => {
      const { data, error } = await supabase
        .from("hospital_replies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as HospitalReply[];
    },
    staleTime: 30_000,
  });

  useTableSubscription("hospital_replies", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));

  return useMemo(() => {
    const replies = q.data ?? EMPTY;
    const unreadCount = replies.filter(r => !r.is_read).length;
    return { replies, unreadCount, isLoading: q.isLoading };
  }, [q.data, q.isLoading]);
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
