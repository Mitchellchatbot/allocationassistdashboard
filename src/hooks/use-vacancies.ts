/**
 * Phase 3 — Vacancy hooks (CRUD + realtime + matching).
 *
 * Source meeting: Saif Ullah, May 20 2026.
 *
 * Tables touched:
 *   - vacancies            (one row per open hospital vacancy)
 *   - vacancy_lead_links   (which doctor leads are being considered)
 */
import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import { scoreMatch, type MatchScore, type MatchCandidateDoctor, type MatchCandidateHospital } from "@/lib/match-score";
import { useHospitals } from "@/hooks/use-hospitals";
import { useDoctorProfile, useDoctorProfiles, type DoctorProfile } from "@/hooks/use-doctor-profiles";
import { useZohoData } from "@/hooks/use-zoho-data";
import type { ZohoLead, ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
import { useWpCandidates, wpCandidateProfileText, type WpCandidate } from "@/hooks/use-wp-candidates";

export type VacancyStatus   = "open" | "filled" | "closed";
export type VacancyPriority = "high" | "medium" | "low";

export interface Vacancy {
  id:                    string;
  hospital_id:           string | null;
  hospital_name:         string;
  specialty:             string;
  priority:              VacancyPriority;
  target_fill_days:      number | null;
  status:                VacancyStatus;
  filled_by_doctor_id:   string | null;
  filled_by_doctor_name: string | null;
  notes:                 string | null;
  opened_by:             string | null;
  opened_at:             string;
  filled_at:             string | null;
  closed_at:             string | null;
  last_followup_at:      string | null;
  created_at:            string;
  updated_at:            string;
}

export interface VacancyInput {
  hospital_id?:      string | null;
  hospital_name:     string;
  specialty:         string;
  priority?:         VacancyPriority;
  target_fill_days?: number | null;
  notes?:            string | null;
  opened_by?:        string | null;
}

export interface VacancyLeadLink {
  id:                 string;
  vacancy_id:         string;
  doctor_id:          string;
  doctor_name:        string;
  doctor_speciality:  string | null;
  linked_by:          string | null;
  linked_at:          string;
  run_id:             string | null;
}

const VACANCIES_KEY      = ["vacancies"] as const;
const VACANCY_LINKS_KEY  = ["vacancy-lead-links"] as const;

export function useVacancies() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: VACANCIES_KEY,
    queryFn: async (): Promise<Vacancy[]> => {
      const { data, error } = await supabase
        .from("vacancies")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(10_000);
      if (error) throw error;
      return (data ?? []) as Vacancy[];
    },
    staleTime: 30_000,
  });

  useTableSubscription("vacancies", useCallback(() => {
    qc.invalidateQueries({ queryKey: VACANCIES_KEY });
  }, [qc]));

  return query;
}

export interface ScoredVacancy {
  vacancy: Vacancy;
  score:   MatchScore;
}

/** Return every open vacancy ranked by how well it fits this doctor.
 *  Scores specialty + license/region + training + experience + notice ↔ urgency
 *  + notes overlap. Drops anything with zero specialty signal.
 *
 *  doctorId is the prefixed id used everywhere else in the app — `lead:<zoho_id>`
 *  or `dob:<zoho_id>`. */
export function useMatchingVacancies(doctorId: string | null | undefined): ScoredVacancy[] {
  const vacanciesQ = useVacancies();
  const { data: profile = null } = useDoctorProfile(doctorId ?? null);
  const { data: hospitals = [] } = useHospitals();
  const { data: wpCandidates = [] } = useWpCandidates();
  const zoho = useZohoData();

  // Find the underlying Zoho row (lead or DOB) for this prefixed doctorId.
  const zohoRow = useMemo<{ lead?: ZohoLead | null; dob?: ZohoDoctorOnBoard | null }>(() => {
    if (!doctorId) return {};
    const z = zoho.data as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    if (doctorId.startsWith("lead:")) {
      const id = doctorId.slice(5);
      return { lead: (z?.rawLeads ?? []).find(l => l.id === id) ?? null };
    }
    if (doctorId.startsWith("dob:")) {
      const id = doctorId.slice(4);
      return { dob:  (z?.rawDoctorsOnBoard ?? []).find(d => d.id === id) ?? null };
    }
    // Unprefixed — try both for backward compat.
    return {
      lead: (z?.rawLeads ?? []).find(l => l.id === doctorId) ?? null,
      dob:  (z?.rawDoctorsOnBoard ?? []).find(d => d.id === doctorId) ?? null,
    };
  }, [doctorId, zoho.data]);

  return useMemo<ScoredVacancy[]>(() => {
    if (!doctorId) return [];
    // Find the linked WP candidate (richest profile source) by doctor_id
    // first, then by email if the linkage hasn't been wired.
    const candidateEmail = zohoRow.lead?.Email ?? zohoRow.dob?.Email ?? null;
    const wp = wpCandidates.find(c => c.doctor_id === doctorId)
            ?? (candidateEmail ? wpCandidates.find(c => c.email && c.email.toLowerCase().trim() === candidateEmail.toLowerCase().trim()) : undefined)
            ?? null;
    const candidate = buildDoctorCandidate(doctorId, zohoRow.lead ?? null, zohoRow.dob ?? null, profile, wp);
    if (!candidate) return [];
    const hospMap = new Map<string, MatchCandidateHospital>();
    for (const h of hospitals) {
      hospMap.set(h.id, { id: h.id, name: h.name, city: h.city ?? null, country: h.country ?? null });
    }
    const out: ScoredVacancy[] = [];
    for (const v of (vacanciesQ.data ?? [])) {
      if (v.status !== "open") continue;
      const h = v.hospital_id ? hospMap.get(v.hospital_id) ?? null : { id: null, name: v.hospital_name, city: null, country: null };
      const score = scoreMatch(candidate, v, h);
      if (score.tier === "none") continue;
      out.push({ vacancy: v, score });
    }
    out.sort((a, b) => b.score.score - a.score.score);
    return out;
  }, [doctorId, zohoRow, profile, hospitals, vacanciesQ.data]);
}

/** Doctor → MatchCandidate adapter. Pulls signal from BOTH the Zoho lead
 *  (license flags, country of training, etc.) and the doctor_profile
 *  (CV-extracted fields). */
export function buildDoctorCandidate(
  doctorId: string,
  lead: ZohoLead | null,
  dob:  ZohoDoctorOnBoard | null,
  profile: DoctorProfile | null,
  wp:   WpCandidate | null = null,
): MatchCandidateDoctor | null {
  if (!lead && !dob && !profile && !wp) return null;

  // Zoho's DoctorsOnBoard JSON often carries fields that aren't in our
  // strict TS interface (Has_DHA/DOH/MOH, License, Nationality,
  // Years_of_Experience, Notice_Period, Family_Status, Age, Bio,
  // Area_of_Interest, Marital_Status). Cast through Record so we can
  // read them. Same applies to leads for the handful that don't.
  const dobRich  = (dob  ?? {}) as Record<string, unknown>;
  const leadRich = (lead ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  // Source priority for every field: WP candidate (canonical, hand-edited)
  // → Zoho DoB (placed-before doctor) → Zoho Lead → doctor_profiles
  // (legacy). First non-null wins.
  const pickStr = (...candidates: Array<string | null | undefined>): string | null => {
    for (const v of candidates) if (v) return v;
    return null;
  };
  const pickNum = (...candidates: Array<number | null | undefined>): number | null => {
    for (const v of candidates) if (v != null) return v;
    return null;
  };

  const speciality = pickStr(
    wp?.specialty,
    lead?.Specialty_New, lead?.Specialty,
    dob?.Specialty_New, dob?.Speciality,
    profile?.title,
  );
  const licenseText = pickStr(
    wp?.license_status,
    profile?.license,
    lead?.License,
    str(dobRich.License),
  );
  return {
    id:               doctorId,
    name:             pickStr(wp?.full_name, lead?.Full_Name, dob?.Full_Name, profile?.doctor_name) ?? "",
    speciality,
    license:          licenseText,
    has_dha:          truthyFlag(lead?.Has_DHA) || truthyFlag(dobRich.Has_DHA) || /dha/i.test(licenseText ?? ""),
    has_doh:          truthyFlag(lead?.Has_DOH) || truthyFlag(dobRich.Has_DOH) || /doh/i.test(licenseText ?? ""),
    has_moh:          truthyFlag(lead?.Has_MOH) || truthyFlag(dobRich.Has_MOH) || /moh/i.test(licenseText ?? ""),
    country_training: pickStr(
      wp?.country_of_training,
      lead?.Country_of_Specialty_training,
      dob?.Country_of_Specialty_training,
      str(dobRich.Country_of_Specialty_training),
      profile?.country_training,
    ),
    nationality:      pickStr(
      wp?.nationality,
      str(leadRich.Nationality),
      str(dobRich.Nationality),
      profile?.nationality,
    ),
    years_experience: pickNum(
      wp?.years_experience,
      num(leadRich.Years_of_Experience),
      num(dobRich.Years_of_Experience),
      profile?.years_experience,
    ),
    notice_period:    pickStr(
      wp?.notice_period,
      str(leadRich.Notice_Period),
      str(dobRich.Notice_Period),
      profile?.notice_period,
    ),
    area_of_interest: pickStr(
      wp?.area_of_interest,
      str(leadRich.Area_of_Interest),
      str(dobRich.Area_of_Interest),
      profile?.area_of_interest,
    ),
    bio:              pickStr(
      str(leadRich.Bio),
      str(dobRich.Bio),
      profile?.bio,
    ),
    // Full WP profile blob so the scorer can spot a sub-specialty named
    // anywhere in the doctor's education/experience/job-title text.
    profile_text:     wpCandidateProfileText(wp),
  };
}

function truthyFlag(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

/** Reverse direction: which Doctor-on-Board fits THIS vacancy best?
 *
 *  Only scores `dob:` (onboarded) doctors — leads no longer surface
 *  here automatically per Ammar's 2026-06-03 spec ("we should have
 *  [the leads tab] empty; the sales team can fill it"). The Leads
 *  side of vacancy matches now comes from manual vacancy_lead_links
 *  rows, surfaced separately via useVacancyLinks(vacancyId).
 *
 *  Joins onto doctor_profiles by the prefixed id (`dob:<id>`), scores
 *  in-memory, returns top 50. Volume is small (~1k) so this is
 *  <50ms on the client.
 */
export function useMatchingDoctors(vacancy: Vacancy | null | undefined): ScoredMatchingDoctor[] {
  const { data: profiles = [] } = useDoctorProfiles();
  const { data: hospitals = [] } = useHospitals();
  const { data: wpCandidates = [] } = useWpCandidates();
  const zoho = useZohoData();

  return useMemo<ScoredMatchingDoctor[]>(() => {
    if (!vacancy) return [];
    const z = zoho.data as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const dobs  = z?.rawDoctorsOnBoard ?? [];

    const profileById = new Map<string, typeof profiles[number]>();
    for (const p of profiles) profileById.set(p.doctor_id, p);
    // WP candidates carry the richest profile data (manually edited
    // post-publish: bio, country of training, nationality, years
    // experience, family/marital status, license). Index by both the
    // linked doctor_id (when set) AND by email lowercase so we can
    // still surface a match when the linkage hasn't been wired.
    const wpByDoctorId = new Map<string, WpCandidate>();
    const wpByEmail    = new Map<string, WpCandidate>();
    for (const c of wpCandidates) {
      if (c.doctor_id) wpByDoctorId.set(c.doctor_id, c);
      if (c.email)     wpByEmail.set(c.email.toLowerCase().trim(), c);
    }

    const hospital = vacancy.hospital_id
      ? (hospitals.find(h => h.id === vacancy.hospital_id) ?? null)
      : null;
    const h: MatchCandidateHospital = hospital
      ? { id: hospital.id, name: hospital.name, city: hospital.city ?? null, country: hospital.country ?? null }
      : { id: null, name: vacancy.hospital_name, city: null, country: null };

    const out: ScoredMatchingDoctor[] = [];
    for (const dob of dobs) {
      const name = dob.Full_Name || `${dob.First_Name ?? ""} ${dob.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const prefixedId = `dob:${dob.id}`;
      const profile = profileById.get(prefixedId) ?? null;
      const wp = wpByDoctorId.get(prefixedId) ?? (dob.Email ? wpByEmail.get(dob.Email.toLowerCase().trim()) : undefined) ?? null;
      // Website-only pool (Ammar 2026-06-09): vacancy matches should only
      // surface doctors who are live on the AA website (have a matching WP
      // candidate) — the site is the source of truth for who hospitals can
      // be shown, and matching keys off the same canonical specialty list
      // (specialty-groups.ts) the website filter + rotation use.
      if (!wp) continue;
      const candidate = buildDoctorCandidate(prefixedId, null, dob, profile, wp);
      if (!candidate) continue;
      const score = scoreMatch(candidate, vacancy, h);
      if (score.tier === "none") continue;
      out.push({
        doctor_id:        prefixedId,
        doctor_name:      name,
        doctor_email:     wp?.email ?? dob.Email,
        doctor_phone:     wp?.phone ?? dob.Phone ?? dob.Mobile ?? null,
        speciality:       candidate.speciality,
        score,
        has_dha:          candidate.has_dha,
        has_doh:          candidate.has_doh,
        has_moh:          candidate.has_moh,
        license_text:     candidate.license,
        country_training: candidate.country_training,
        nationality:      candidate.nationality,
        years_experience: candidate.years_experience,
        notice_period:    candidate.notice_period,
      });
    }

    out.sort((a, b) => b.score.score - a.score.score);
    return out.slice(0, 50);
  }, [vacancy, profiles, hospitals, wpCandidates, zoho.data]);
}

export interface ScoredMatchingDoctor {
  doctor_id:    string;
  doctor_name:  string;
  doctor_email: string | null;
  doctor_phone: string | null;
  speciality:   string | null;
  score:        MatchScore;
  // License signals — surfaced so the match drawer can render DHA / DOH / MOH
  // pills inline, the team can tell at a glance whether the doctor is cleared
  // for this hospital's region.
  has_dha:      boolean;
  has_doh:      boolean;
  has_moh:      boolean;
  license_text: string | null;
  // Rich-detail fields used by the click-to-expand row panel.
  country_training: string | null;
  nationality:      string | null;
  years_experience: number | null;
  notice_period:    string | null;
}

export function useCreateVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VacancyInput): Promise<Vacancy> => {
      const { data, error } = await supabase
        .from("vacancies")
        .insert({
          hospital_id:      input.hospital_id ?? null,
          hospital_name:    input.hospital_name,
          specialty:        input.specialty,
          priority:         input.priority ?? "medium",
          target_fill_days: input.target_fill_days ?? null,
          notes:            input.notes ?? null,
          opened_by:        input.opened_by ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Vacancy;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VACANCIES_KEY }),
  });
}

export function useUpdateVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Vacancy> }): Promise<Vacancy> => {
      const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
      // Set timestamps when status flips, so the dashboard doesn't have to
      // backfill them client-side.
      if (patch.status === "filled" && !patch.filled_at) update.filled_at = new Date().toISOString();
      if (patch.status === "closed" && !patch.closed_at) update.closed_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("vacancies")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Vacancy;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VACANCIES_KEY }),
  });
}

export function useDeleteVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("vacancies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: VACANCIES_KEY }),
  });
}

/** Per-vacancy lead links — which doctors the team is considering for this
 *  vacancy. */
export function useVacancyLinks(vacancyId: string | null) {
  return useQuery({
    queryKey: [...VACANCY_LINKS_KEY, vacancyId],
    enabled:  !!vacancyId,
    queryFn: async (): Promise<VacancyLeadLink[]> => {
      if (!vacancyId) return [];
      const { data, error } = await supabase
        .from("vacancy_lead_links")
        .select("*")
        .eq("vacancy_id", vacancyId)
        .order("linked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VacancyLeadLink[];
    },
    staleTime: 30_000,
  });
}

export function useLinkLeadToVacancy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      vacancy_id:        string;
      doctor_id:         string;
      doctor_name:       string;
      doctor_speciality?: string | null;
      linked_by?:        string | null;
    }): Promise<VacancyLeadLink> => {
      const { data, error } = await supabase
        .from("vacancy_lead_links")
        .insert({
          vacancy_id:        input.vacancy_id,
          doctor_id:         input.doctor_id,
          doctor_name:       input.doctor_name,
          doctor_speciality: input.doctor_speciality ?? null,
          linked_by:         input.linked_by ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as VacancyLeadLink;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...VACANCY_LINKS_KEY, vars.vacancy_id] });
      qc.invalidateQueries({ queryKey: ["vacancy-links-by-doctor", vars.doctor_id] });
    },
  });
}

export function useUnlinkLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string): Promise<void> => {
      const { error } = await supabase.from("vacancy_lead_links").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VACANCY_LINKS_KEY });
    },
  });
}

/** Every vacancy a doctor is linked to — surfaced on the doctor profile page
 *  so the team can see "this doctor is being considered for X, Y, Z". */
export function useVacancyLinksByDoctor(doctorId: string | null | undefined) {
  return useQuery({
    queryKey: ["vacancy-links-by-doctor", doctorId],
    enabled:  !!doctorId,
    queryFn: async () => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("vacancy_lead_links")
        .select("*, vacancy:vacancies(*)")
        .eq("doctor_id", doctorId)
        .order("linked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (VacancyLeadLink & { vacancy: Vacancy | null })[];
    },
    staleTime: 30_000,
  });
}
