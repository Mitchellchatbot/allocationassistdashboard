import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Hospital {
  id:                      string;
  name:                    string;
  city:                    string | null;
  country:                 string | null;
  primary_recruiter_email: string | null;
  primary_contact_name:    string | null;
  /** HI team member who owns this hospital. Becomes the From/sender on its
   *  profile-sent emails: the assign_run_from_hospital_owner trigger stamps a
   *  new run's assigned_to from this (falling back to the run's created_by). */
  owner_email:             string | null;
  /** false → greet with the hospital name; true → greet with the chosen contact's name. */
  greet_with_contact_name: boolean;
  /** How a send picks its recipient(s) from the hospital's Zoho contacts.
   *  'primary' → always the Primary contact; 'cycle' → round-robin; 'all' →
   *  every eligible (checked) contact, all in the TO field at once. */
  contact_mode:            "primary" | "cycle" | "all";
  /** Next index in the cycle rotation (advances on each send). */
  cycle_cursor:            number;
  /** Contact emails to skip in the primary/cycle rotation. */
  excluded_contact_emails: string[];
  recruiter_phone:         string | null;
  /** Hospital photo shown in working-opportunity emails (public storage URL). */
  image_url:               string | null;
  /** Template used for the to-hospital "profile sent" email (email_hospital stage). */
  template_key:            string | null;
  /** Template used for the doctor "working opportunity" email about THIS hospital
   *  (email_doctor stage) — carries the {{hospital_image}} slot. */
  doctor_template_key:     string | null;
  notes:                   string | null;
  /** Send state (the color-sheet "state"): false = DON'T send (paused). A send
   *  dialog hides these; null/true = sendable. */
  active:                  boolean | null;
  /** If non-empty, only OFFER this hospital for doctors in these specialties. */
  specialty_only:          string[] | null;
  /** Never offer this hospital for doctors in these specialties. */
  specialty_skip:          string[] | null;
  /** Extra CC recipients automatically added to this hospital's emails. */
  cc_emails:               string[] | null;
  health_score:            number | null;
  created_at:              string;
  updated_at:              string;
}

export type HospitalInput = Partial<Omit<Hospital, "id" | "created_at" | "updated_at">> & { name: string };

/** "Don't send" state: paused only when active is EXPLICITLY false (null/true = send). */
export function isHospitalPaused(h: Pick<Hospital, "active">): boolean {
  return h.active === false;
}

/** Whether a hospital should be OFFERED for a doctor of the given specialty,
 *  honouring specialty_only / specialty_skip. Case-insensitive substring match
 *  (specialty names differ between systems). Unknown doctor specialty → allowed
 *  (never hide a hospital we can't rule out). */
export function hospitalAllowsSpecialty(
  h: Pick<Hospital, "specialty_only" | "specialty_skip">,
  specialty: string | null | undefined,
): boolean {
  const s = (specialty ?? "").trim().toLowerCase();
  const hit = (list: string[] | null | undefined) =>
    (list ?? []).some(x => { const t = x.trim().toLowerCase(); return !!t && !!s && (s.includes(t) || t.includes(s)); });
  if (hit(h.specialty_skip)) return false;
  const only = (h.specialty_only ?? []).filter(x => x.trim());
  if (only.length && s) return hit(h.specialty_only);
  return true;
}

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
    // Optimistic: patch the cached hospital row IMMEDIATELY so routing toggles
    // (contact_mode / greet-with / excluded contacts) and inline edits flip
    // instantly instead of waiting a DB round-trip + refetch. Roll back on
    // error; reconcile on settle. Mirrors useUpdateBatch.
    onMutate: async (input: { id: string } & HospitalInput) => {
      const { id, ...patch } = input;
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<Hospital[]>(KEY);
      if (prev) {
        qc.setQueryData<Hospital[]>(KEY, prev.map(h => h.id === id ? { ...h, ...patch } as Hospital : h));
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      const c = ctx as { prev?: Hospital[] } | undefined;
      if (c?.prev) qc.setQueryData(KEY, c.prev);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: KEY }); },
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
