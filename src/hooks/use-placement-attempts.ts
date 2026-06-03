/**
 * Per-(doctor, hospital) placement journey.
 *
 * Replaces the per-doctor read path that used to come out of
 * doctor_lifecycle. The CSV from Ammar's Hammad sheet shows the same
 * doctor at multiple hospitals (e.g. Anas Saleh shortlisted at four
 * hospitals on the same day) — the per-doctor model couldn't represent
 * that, so a new table was added in 20260603000013_placement_attempts.sql.
 *
 * Mutations: useUpsertPlacementAttempt, useDeletePlacementAttempt.
 * Inserts via this hook trigger the DB sync that updates the parent
 * doctor_lifecycle row (earliest join/sign/paid date wins).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PlacementAttempt {
  id:               string;
  doctor_id:        string;
  doctor_name:      string;
  doctor_specialty: string | null;
  hospital_id:      string | null;
  hospital_name:    string;
  shortlisted_at:   string | null;
  interviewed_at:   string | null;
  offered_at:       string | null;
  signed_at:        string | null;
  start_date:       string | null;
  joined_at:        string | null;
  paid_at:          string | null;
  notes:            string | null;
  source:           string;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

const KEY = ["placement-attempts"] as const;

export function usePlacementAttempts() {
  return useQuery<PlacementAttempt[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("placement_attempts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlacementAttempt[];
    },
    staleTime: 30_000,
  });
}

/** Group attempts by doctor for views that want the per-doctor rollup
 *  (e.g. "this doctor has 4 active attempts"). */
export function groupAttemptsByDoctor(attempts: PlacementAttempt[]): Record<string, PlacementAttempt[]> {
  const m: Record<string, PlacementAttempt[]> = {};
  for (const a of attempts) {
    if (!m[a.doctor_id]) m[a.doctor_id] = [];
    m[a.doctor_id].push(a);
  }
  return m;
}

export interface UpsertAttemptInput {
  id?:              string;
  doctor_id:        string;
  doctor_name:      string;
  doctor_specialty?: string | null;
  hospital_id?:     string | null;
  hospital_name:    string;
  shortlisted_at?:  string | null;
  interviewed_at?:  string | null;
  offered_at?:      string | null;
  signed_at?:       string | null;
  start_date?:      string | null;
  joined_at?:       string | null;
  paid_at?:         string | null;
  notes?:           string | null;
  source?:          string;
}

export function useUpsertPlacementAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertAttemptInput): Promise<PlacementAttempt> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        doctor_id:        input.doctor_id,
        doctor_name:      input.doctor_name,
        doctor_specialty: input.doctor_specialty ?? null,
        hospital_id:      input.hospital_id ?? null,
        hospital_name:    input.hospital_name,
        shortlisted_at:   input.shortlisted_at ?? null,
        interviewed_at:   input.interviewed_at ?? null,
        offered_at:       input.offered_at ?? null,
        signed_at:        input.signed_at ?? null,
        start_date:       input.start_date ?? null,
        joined_at:        input.joined_at ?? null,
        paid_at:          input.paid_at ?? null,
        notes:            input.notes ?? null,
        source:           input.source ?? "manual",
        created_by:       createdBy,
        updated_at:       new Date().toISOString(),
      };
      // Upsert on the (doctor_id, hospital_name) unique key so calling
      // this with the same pair updates the existing row in place.
      const { data, error } = await supabase
        .from("placement_attempts")
        .upsert(payload, { onConflict: input.id ? "id" : "doctor_id,hospital_name" })
        .select("*")
        .single();
      if (error) throw error;
      return data as PlacementAttempt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });           // legacy key from B1
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["search-placements"] });
    },
  });
}

export function useDeletePlacementAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("placement_attempts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["placements"] });
    },
  });
}

/** Bulk-insert path used by the CSV importer. Skips rows that already
 *  exist for the same (doctor_id, hospital_name) pair instead of
 *  overwriting — manual edits should win over a re-import. */
export function useBulkInsertPlacementAttempts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: UpsertAttemptInput[]) => {
      if (rows.length === 0) return { inserted: 0, skipped: 0 };
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = rows.map(r => ({
        doctor_id:        r.doctor_id,
        doctor_name:      r.doctor_name,
        doctor_specialty: r.doctor_specialty ?? null,
        hospital_id:      r.hospital_id ?? null,
        hospital_name:    r.hospital_name,
        shortlisted_at:   r.shortlisted_at ?? null,
        interviewed_at:   r.interviewed_at ?? null,
        offered_at:       r.offered_at ?? null,
        signed_at:        r.signed_at ?? null,
        start_date:       r.start_date ?? null,
        joined_at:        r.joined_at ?? null,
        paid_at:          r.paid_at ?? null,
        notes:            r.notes ?? null,
        source:           r.source ?? "csv_import",
        created_by:       createdBy,
      }));
      // ignoreDuplicates honours the unique (doctor_id, hospital_name)
      // index — re-importing the same CSV is safe.
      const { data, error } = await supabase
        .from("placement_attempts")
        .upsert(payload, { onConflict: "doctor_id,hospital_name", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
    },
  });
}
