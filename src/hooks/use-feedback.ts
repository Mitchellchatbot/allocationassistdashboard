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
  screenshots:    string[];
}

export interface NewFeedback {
  type:            FeedbackType;
  message:         string;
  page_label?:     string | null;
  route?:          string | null;
  section?:        string | null;
  reporter_email?: string | null;
  context?:        Record<string, unknown>;
  screenshots?:    string[];
}

const KEY = ["feedback"] as const;

/** Upload one screenshot (paste/drop/pick) to the public `feedback` bucket and
 *  return its public URL. Throws on failure so the caller can surface it. */
export async function uploadFeedbackScreenshot(file: Blob, ext = "png"): Promise<string> {
  const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const path = `${new Date().toISOString().slice(0, 10)}/${rand}.${ext}`;
  const { error } = await supabase.storage.from("feedback").upload(path, file, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("feedback").getPublicUrl(path).data.publicUrl;
}

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
        screenshots:    input.screenshots    ?? [],
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
