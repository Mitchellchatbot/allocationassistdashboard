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
      const resp = data as { ok: boolean; error?: string; fetched: number; inserted: number; pages: number; totalReported: number; durationMs: number };
      if (!resp.ok) throw new Error(resp.error ?? "Sync failed");
      return resp;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
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
