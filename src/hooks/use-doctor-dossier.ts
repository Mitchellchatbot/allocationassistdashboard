/**
 * Per-doctor "dossier" lookups for the Doctors → Overview tab. Each is keyed by
 * the AA prefixed doctor_id (`dob:<zohoId>`), the same key form_responses /
 * cv_uploads carry (stamped via the lookup_doctor_id_by_email RPC). Queries are
 * `enabled` only when a doctorId is passed, so they fire lazily — the Overview
 * mounts a detail component (and thus these hooks) only when a row is expanded.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FormResponse } from "@/hooks/use-forms";
import type { CvUpload } from "@/hooks/use-cv-uploads";

/** All form responses linked to a doctor, newest first. */
export function useDoctorFormResponses(doctorId: string | null) {
  return useQuery({
    queryKey: ["doctor-dossier", "forms", doctorId ?? "_"],
    enabled: !!doctorId,
    queryFn: async (): Promise<FormResponse[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("form_responses")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as FormResponse[];
    },
    staleTime: 60_000,
  });
}

/** All CV-upload rows for a doctor, newest first. The latest with
 *  status="extracted" carries the parsed CV fields in `extracted_data`. */
export function useDoctorCvUploads(doctorId: string | null) {
  return useQuery({
    queryKey: ["doctor-dossier", "cv", doctorId ?? "_"],
    enabled: !!doctorId,
    queryFn: async (): Promise<CvUpload[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("cv_uploads")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CvUpload[];
    },
    staleTime: 60_000,
  });
}
