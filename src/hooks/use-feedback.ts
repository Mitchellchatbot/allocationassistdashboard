import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type FeedbackType   = "bug" | "idea";
export type FeedbackStatus = "new" | "triaged" | "in_progress" | "done" | "wont_fix";

export interface FeedbackRow {
  id:             string;
  created_at:     string;
  type:           FeedbackType;
  message:        string;
  page_label:     string | null;
  route:          string | null;
  section:        string | null;
  status:         FeedbackStatus;
  reporter_email: string | null;
  context:        Record<string, unknown>;
}

export interface NewFeedback {
  type:            FeedbackType;
  message:         string;
  page_label?:     string | null;
  route?:          string | null;
  section?:        string | null;
  reporter_email?: string | null;
  context?:        Record<string, unknown>;
}

const KEY = ["feedback"] as const;

/** File a bug report / feature suggestion. */
export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewFeedback) => {
      const { error } = await supabase.from("feedback").insert({
        type:           input.type,
        message:        input.message,
        page_label:     input.page_label     ?? null,
        route:          input.route          ?? null,
        section:        input.section         ?? null,
        reporter_email: input.reporter_email ?? null,
        context:        input.context        ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

/** Recent reports, newest first — for the in-widget triage view (admins). */
export function useFeedbackList(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<FeedbackRow[]> => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as FeedbackRow[];
    },
    staleTime: 30_000,
  });
}

export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: FeedbackStatus }) => {
      const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}
