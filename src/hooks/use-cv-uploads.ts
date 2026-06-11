import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type CvUploadStatus = "pending_upload" | "uploaded" | "extracting" | "extracted" | "failed";

export interface CvUpload {
  id:                string;
  doctor_id:         string;
  doctor_name:       string;
  doctor_email:      string | null;
  token:             string;
  file_path:         string | null;
  file_name:         string | null;
  file_size:         number | null;
  file_mime:         string | null;
  uploaded_at:       string | null;
  status:            CvUploadStatus;
  extracted_data:    Record<string, unknown> | null;
  extraction_error:  string | null;
  extracted_at:      string | null;
  expires_at:        string;
  created_at:        string;
  created_by:        string | null;
}

const PENDING_KEY = ["cv-uploads", "pending"] as const;

/** Org-wide list of CV-upload requests that haven't completed yet. Drives the
 *  pending-CV count on the Operations report. (The "email a doctor an upload
 *  link" feature was removed; this just reflects any rows still pending.) */
export function usePendingCvUploads() {
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: async (): Promise<CvUpload[]> => {
      const { data, error } = await supabase
        .from("cv_uploads")
        .select("*")
        .eq("status", "pending_upload")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CvUpload[];
    },
    staleTime: 30_000,
  });
}
