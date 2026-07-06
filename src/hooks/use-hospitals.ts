import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Hospital {
  id:                      string;
  name:                    string;
  city:                    string | null;
  country:                 string | null;
  primary_recruiter_email: string | null;
  primary_contact_name:    string | null;
  /** false → greet with the hospital name; true → greet with the chosen contact's name. */
  greet_with_contact_name: boolean;
  /** How a send picks its ONE recipient from the hospital's Zoho contacts.
   *  'primary' → always the Primary contact; 'cycle' → round-robin. */
  contact_mode:            "primary" | "cycle";
  /** Next index in the cycle rotation (advances on each send). */
  cycle_cursor:            number;
  /** Contact emails to skip in the primary/cycle rotation. */
  excluded_contact_emails: string[];
  recruiter_phone:         string | null;
  /** Hospital photo shown in working-opportunity emails (public storage URL). */
  image_url:               string | null;
  template_key:            string | null;
  notes:                   string | null;
  health_score:            number | null;
  created_at:              string;
  updated_at:              string;
}

export type HospitalInput = Partial<Omit<Hospital, "id" | "created_at" | "updated_at">> & { name: string };

const KEY = ["hospitals"] as const;

export function useHospitals() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Hospital[]> => {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .order("name", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Hospital[];
    },
    staleTime: 60_000,
  });
}

export function useCreateHospital() {
  const qc = useQueryClient();
  return useMutation({
    // Returns the new row's id so callers (e.g. logging a vacancy for a brand-new
    // hospital) can immediately link to it.
    mutationFn: async (input: HospitalInput): Promise<string> => {
      const { data, error } = await supabase.from("hospitals").insert(input).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useUpdateHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & HospitalInput) => {
      const { id, ...patch } = input;
      const { error } = await supabase
        .from("hospitals")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useDeleteHospital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hospitals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}
