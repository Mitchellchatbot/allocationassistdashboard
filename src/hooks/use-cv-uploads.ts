import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

const PER_DOCTOR_KEY = (doctorId: string) => ["cv-uploads", doctorId] as const;
const PENDING_KEY    = ["cv-uploads", "pending"] as const;

/** Most-recent-first upload history for a single doctor. */
export function useDoctorCvUploads(doctorId: string | null) {
  return useQuery({
    queryKey: doctorId ? PER_DOCTOR_KEY(doctorId) : ["cv-uploads", "none"],
    enabled: !!doctorId,
    queryFn: async (): Promise<CvUpload[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("cv_uploads")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CvUpload[];
    },
    // Mid-extraction we want updates fairly fresh so the editor reflects
    // "extracted" within a poll cycle.
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as CvUpload[];
      const hasActive = rows.some(r => r.status === "extracting" || r.status === "pending_upload");
      return hasActive ? 5_000 : false;
    },
    staleTime: 5_000,
  });
}

/** Org-wide list of upload requests that haven't been completed yet. Drives
 *  the "Pending CV uploads" panel on the Doctor Profiles page so Saif's team
 *  can see which doctors they need to chase, and resend links to. */
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

/** Calls the send-cv-upload-link edge function. The function generates a
 *  token, persists it, and emails the doctor with the upload URL. */
export function useSendCvUploadLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      doctor_id:    string;
      doctor_name:  string;
      doctor_email: string;
      created_by?:  string;
    }) => {
      const { data, error } = await supabase.functions.invoke("send-cv-upload-link", {
        body: { ...input, app_origin: window.location.origin },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; error?: string; upload_url?: string; to?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Send failed");
      return resp;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PER_DOCTOR_KEY(vars.doctor_id) });
      qc.invalidateQueries({ queryKey: PENDING_KEY });
    },
  });
}

/** Direct team upload — Ammar 2026-06-03: HI team often receives a
 *  CV from the doctor via WhatsApp or a direct email, then re-authors
 *  it as AA's profile-sent CV. This bypasses the email-the-doctor-a-
 *  link path: the team picks the file in-app, we mint a fresh
 *  cv_uploads token, POST it to cv-upload-public, and Claude extracts
 *  on the other side. Same plumbing as the doctor-uploads-themselves
 *  flow, just initiated by the team. */
export function useTeamUploadCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      doctor_id:    string;
      doctor_name:  string;
      doctor_email: string | null;
      file:         File;
    }) => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? "team_upload";

      // Mint a fresh token. Reuses the existing cv_uploads table so
      // the per-doctor upload history surfaces both team + doctor
      // uploads in one timeline.
      const token = crypto.randomUUID().replace(/-/g, "");
      const { error: insertErr } = await supabase.from("cv_uploads").insert({
        doctor_id:    input.doctor_id,
        doctor_name:  input.doctor_name,
        doctor_email: input.doctor_email,
        token,
        status:       "pending_upload",
        created_by:   createdBy,
      });
      if (insertErr) throw insertErr;

      // POST file to the public endpoint with the freshly-minted token.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file",  input.file);
      const res = await fetch(`${supabaseUrl}/functions/v1/cv-upload-public`, {
        method: "POST",
        body:   fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `Upload failed (HTTP ${res.status})`);
      }
      return body as { ok: true };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PER_DOCTOR_KEY(vars.doctor_id) });
      qc.invalidateQueries({ queryKey: PENDING_KEY });
      qc.invalidateQueries({ queryKey: ["doctor-profile", vars.doctor_id] });
      qc.invalidateQueries({ queryKey: ["doctor-profiles"] });
    },
  });
}

/** Re-runs the cv-extract edge function for an existing upload. Used for
 *  retries after a transient failure or when Claude misread the CV. */
export function useReExtractCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { upload_id: string; doctor_id: string }) => {
      const { data, error } = await supabase.functions.invoke("cv-extract", {
        body: { upload_id: input.upload_id },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Extraction failed");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: PER_DOCTOR_KEY(vars.doctor_id) });
      qc.invalidateQueries({ queryKey: ["doctor-profile", vars.doctor_id] });
      qc.invalidateQueries({ queryKey: ["doctor-profiles"] });
    },
  });
}
