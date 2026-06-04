/**
 * WordPress candidate mirror.
 *
 * - useWpCandidates() — full list, paginated via Supabase .range() to
 *   bypass the API gateway's 1000-row cap (the table is ~1.2k rows
 *   today and only grows).
 * - useSyncWpCandidates() — invokes the wordpress-candidates-sync
 *   edge function and reports {fetched, inserted, totalReported}.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCallback } from "react";
import { useTableSubscription } from "@/lib/realtime-registry";

export interface WpCandidate {
  id:                  number;
  wp_slug:             string;
  wp_link:             string;
  status:              string | null;
  title:               string | null;
  full_name:           string | null;
  job_title:           string | null;
  email:               string | null;
  phone:               string | null;
  date_of_birth:       string | null;
  nationality:         string | null;
  specialty:           string | null;
  subspecialty:        string | null;
  area_of_interest:    string | null;
  years_experience:    number | null;
  license_status:      string | null;
  license_types:       string[] | null;
  family_status:       string | null;
  has_dependents:      boolean | null;
  country_of_training: string | null;
  current_location:    string | null;
  rank:                string | null;
  languages:           string | null;
  english_level:       string | null;
  current_salary:      string | null;
  expected_salary:     string | null;
  notice_period:       string | null;
  targeted_locations:  string[] | null;
  cv_url:              string | null;
  photo_url:           string | null;

  education_title:        string | null;
  education_academy:      string | null;
  education_start:        string | null;
  education_end:          string | null;
  education_present:      boolean | null;
  education_description:  string | null;

  experience_title:       string | null;
  experience_company:     string | null;
  experience_start:       string | null;
  experience_end:         string | null;
  experience_present:     boolean | null;
  experience_description: string | null;

  doctor_id:           string | null;
  raw_acf:             Record<string, unknown> | null;
  wp_date:             string | null;
  wp_modified:         string | null;
  last_synced_at:      string;
}

const KEY = ["wp-candidates"] as const;

export function useWpCandidates() {
  const qc = useQueryClient();
  const q = useQuery<WpCandidate[]>({
    queryKey: KEY,
    queryFn: async () => {
      // Bypass Supabase's 1000-row cap via .range() pagination.
      const PAGE = 1000;
      const all: WpCandidate[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("wordpress_candidates")
          .select("*")
          .order("wp_date", { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as WpCandidate[];
        all.push(...batch);
        if (batch.length < PAGE) break;
      }
      return all;
    },
    staleTime: 60_000,
  });
  useTableSubscription("wordpress_candidates", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));
  return q;
}

export function useSyncWpCandidates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("wordpress-candidates-sync", { body: {} });
      if (error) throw error;
      const resp = data as {
        ok: boolean; error?: string;
        fetched: number; inserted: number; pages: number; totalReported: number;
        // Sync runs the auto-linker on its way out — these are how many
        // rows got their doctor_id stamped during this run.
        auto_linked?: number; auto_link_email?: number; auto_link_name?: number;
        durationMs: number;
      };
      if (!resp.ok) throw new Error(resp.error ?? "Sync failed");
      return resp;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Auto-match every unlinked WP candidate against the Zoho cache
 *  (lead + DoB) by email + normalised name. Server-side; returns a
 *  breakdown of what got matched. */
export function useAutoLinkWpCandidates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("wordpress-candidates-link", { body: {} });
      if (error) throw error;
      const resp = data as {
        ok: boolean; error?: string;
        scanned: number; proposed: number; updated: number;
        matched_by_email: number; matched_by_name: number;
        skipped_ambiguous: number;
        zoho_leads_indexed: number; zoho_records_total: number;
        durationMs: number;
      };
      if (!resp.ok) throw new Error(resp.error ?? "Auto-link failed");
      return resp;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Edit-fields payload sent to the upsert function. The keys here are
 *  WP-native ACF keys, not our column names — the edge function
 *  translates back into our mirror shape on the way home. */
export interface WpCandidateUpsertPayload {
  id?:        number;                              // omit to create
  status?:    "publish" | "private" | "draft";
  title?:     string;                              // post title
  doctor_id?: string | null;                       // our linkage field
  acf?: {
    full_name?:                                              string;
    job_title?:                                              string;
    phone_number?:                                           string;
    email?:                                                  string;
    date_of_birth?:                                          string;
    nationality?:                                            string;
    specialty?:                                              string;
    subspecialty?:                                           string;
    specific_areas_of_interests_within_the_specialization?:  string;
    years_of_experience_post_specialization?:                string | number;
    license_type?:                                           string[];
    dha__haad__moh_license?:                                 string;
    family_status?:                                          string;
    have_children_or_any_dependent?:                         boolean | "Yes" | "No";
    country_of_training?:                                    string;
    current_location?:                                       string;
    specialist__consultant?:                                 string;
    languages?:                                              string;
    english_level?:                                          string;
    current_salary?:                                         string;
    expected_salary?:                                        string;
    notice_period?:                                          string;
    targeted_locations?:                                     string[];
    profile_picture?:                                        number;   // attachment id from upload-photo
    // Single education slot
    academy1?:     string; title1?:    string;
    start_date1?:  string; end_date1?: string;
    present1?:     "Yes" | "No";
    description1?: string;
    // Single experience slot
    company2?:     string; title2?:    string;
    start_date_2?: string; end_date2?: string;
    present2?:     "Yes" | "No";
    description2?: string;
  };
}

/** Create-or-edit a candidate. Writes to WordPress, then refreshes our
 *  mirror so the new row appears in the list immediately. */
export function useUpsertWpCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: WpCandidateUpsertPayload) => {
      const { data, error } = await supabase.functions.invoke("wordpress-candidate-upsert", { body: payload });
      if (error) throw error;
      const resp = data as { ok: boolean; id?: number; row?: WpCandidate; created?: boolean; error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Upsert failed");
      return resp;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Upload a profile photo to WP Media. If candidateId is set, the
 *  upload also attaches it to that candidate's profile_picture field
 *  in one round-trip. Returns the media id + the public URL. */
export function useUploadWpPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, candidateId }: { file: File; candidateId?: number }) => {
      const form = new FormData();
      form.append("file", file);
      if (candidateId) form.append("candidate_id", String(candidateId));
      // supabase.functions.invoke serialises bodies; we need raw FormData
      // so call fetch directly to the function URL.
      const { data: { session } } = await supabase.auth.getSession();
      const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
      const anonKey    = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? "";
      const res = await fetch(`${projectUrl}/functions/v1/wordpress-candidate-upload-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? anonKey}`, apikey: anonKey },
        body: form,
      });
      const json = await res.json().catch(() => null) as { ok: boolean; media_id?: number; source_url?: string; attached_to?: number; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Photo map keyed by the prefixed AA doctor_id (`lead:<zoho>` /
 *  `dob:<zoho>`). Used to render avatars next to any doctor row that
 *  links back to a WP candidate. Tiny payload + 5-min cache, so cheap
 *  to call from anywhere. */
export function useDoctorPhotoMap() {
  return useQuery<Map<string, string>>({
    queryKey: ["wp-doctor-photos"],
    queryFn: async () => {
      const all = new Map<string, string>();
      const PAGE = 1000;
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("wordpress_candidates")
          .select("doctor_id, photo_url")
          .not("doctor_id", "is", null)
          .not("photo_url", "is", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as Array<{ doctor_id: string; photo_url: string }>;
        for (const r of batch) all.set(r.doctor_id, r.photo_url);
        if (batch.length < PAGE) break;
      }
      return all;
    },
    staleTime: 5 * 60_000,
  });
}

/** Update the doctor_id on a WP candidate row (manual linkage). */
export function useLinkWpCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doctorId }: { id: number; doctorId: string | null }) => {
      const { error } = await supabase.from("wordpress_candidates")
        .update({ doctor_id: doctorId, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
