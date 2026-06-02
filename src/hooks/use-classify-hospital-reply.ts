import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ReplyClassification = "shortlisted" | "declined" | "needs_more_info" | "unclear" | "wrong_doctor";

export interface ClassifyResponse {
  ok:             boolean;
  classification: ReplyClassification;
  confidence:     number;
  summary:        string;
  asked_for:      string | null;
  next_steps:     string;
  action_taken:   string;
  reply_id:       string;
}

/** Sends a pasted hospital reply through the AI classifier. On success, the
 *  Profile Sent run is advanced server-side and (for shortlisted) a Shortlist
 *  run is auto-created + emailed. We invalidate the runs + events queries so
 *  the drawer reflects the new state immediately. */
export function useClassifyHospitalReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      run_id:         string;
      reply_text:     string;
      reply_subject?: string;
      reply_from?:    string;
    }): Promise<ClassifyResponse> => {
      const { data, error } = await supabase.functions.invoke("classify-hospital-reply", {
        body: input,
      });
      if (error) throw error;
      const resp = data as ClassifyResponse & { error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Classification failed");
      return resp;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
      qc.invalidateQueries({ queryKey: ["automation-flow-events", vars.run_id] });
    },
  });
}
