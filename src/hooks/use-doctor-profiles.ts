import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DoctorProfile {
  doctor_id:           string;
  doctor_name:         string | null;
  title:               string | null;
  bio:                 string | null;
  area_of_interest:    string | null;
  country_training:    string | null;
  years_experience:    number | null;
  nationality:         string | null;
  age:                 number | null;
  marital_status:      string | null;
  family_status:       string | null;
  license:             string | null;
  salary_expectation:  string | null;
  notice_period:       string | null;
  languages:           string | null;
  cv_url:              string | null;
  reg_docs_url:        string | null;
  notes:               string | null;
  completed:           boolean;
  created_at:          string;
  updated_at:          string;
  updated_by:          string | null;
}

const LIST_KEY = ["doctor-profiles"] as const;
const ONE_KEY  = (id: string) => ["doctor-profile", id] as const;

/** Fields counted for the completion %. Bumping or removing one affects the
 *  badge on the doctor list. Keep in sync with PROFILE_FIELDS in DoctorProfiles.tsx. */
export const REQUIRED_PROFILE_FIELDS: (keyof DoctorProfile)[] = [
  "title", "bio", "area_of_interest", "country_training",
  "years_experience", "nationality", "marital_status",
  "license", "salary_expectation", "notice_period",
];

export function calcCompletion(p: DoctorProfile | null | undefined): number {
  if (!p) return 0;
  let filled = 0;
  for (const f of REQUIRED_PROFILE_FIELDS) {
    const v = p[f];
    if (v !== null && v !== undefined && v !== "") filled++;
  }
  return Math.round((filled / REQUIRED_PROFILE_FIELDS.length) * 100);
}

/** All saved profiles. Small table (~hundreds to low thousands of rows),
 *  loaded once and joined client-side to the Zoho doctor list. */
export function useDoctorProfiles() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<DoctorProfile[]> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DoctorProfile[];
    },
    staleTime: 60_000,
  });
}

/** Fetch a single profile by doctor_id. Returns null when no profile exists
 *  yet (caller can render a blank editor). */
export function useDoctorProfile(doctorId: string | null) {
  return useQuery({
    queryKey: doctorId ? ONE_KEY(doctorId) : ["doctor-profile", "none"],
    enabled: !!doctorId,
    queryFn: async (): Promise<DoctorProfile | null> => {
      if (!doctorId) return null;
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select("*")
        .eq("doctor_id", doctorId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DoctorProfile | null;
    },
    staleTime: 30_000,
  });
}

export type DoctorProfileInput = Partial<Omit<DoctorProfile, "created_at" | "updated_at" | "updated_by">> & {
  doctor_id: string;
};

/** Upsert keyed by doctor_id so the same mutation handles create + update. */
export function useUpsertDoctorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DoctorProfileInput) => {
      const { error } = await supabase
        .from("doctor_profiles")
        .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "doctor_id" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ONE_KEY(vars.doctor_id) });
    },
  });
}

/** Map a profile row to the email-template token bag the renderer expects.
 *  Centralised so both the frontend (preview pane) and the edge function (real
 *  send, after duplicating this logic in Deno) stay in lockstep. */
export function profileToTokens(profile: DoctorProfile | null): Record<string, string> {
  if (!profile) return {};
  return {
    doctor_title:               profile.title              ?? "",
    doctor_bio:                 profile.bio                ?? "",
    doctor_area_of_interest:    profile.area_of_interest   ?? "",
    doctor_country_training:    profile.country_training   ?? "",
    doctor_years_experience:    profile.years_experience != null ? String(profile.years_experience) : "",
    doctor_nationality:         profile.nationality        ?? "",
    doctor_age:                 profile.age != null        ? String(profile.age) : "",
    doctor_marital_status:      profile.marital_status     ?? "",
    doctor_family_status:       profile.family_status      ?? "",
    doctor_license:             profile.license            ?? "",
    doctor_salary_expectation:  profile.salary_expectation ?? "",
    doctor_notice_period:       profile.notice_period      ?? "",
  };
}
