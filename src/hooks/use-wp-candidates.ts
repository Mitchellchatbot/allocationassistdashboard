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
  /** REQUIRED when omitting `id` (i.e. on create). The edge function
   *  rejects unattributed create calls so a future webhook/cron can't
   *  accidentally post to WordPress without an explicit user action. */
  intent?:    "publish_from_staging" | "manual_create" | "edit";
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

/** Delete a candidate from WordPress + our mirror. Calls the
 *  `wordpress-candidate-delete` edge function which does WP DELETE
 *  (force=true, skips the trash) + a mirror row delete in one shot. */
export function useDeleteWpCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.functions.invoke("wordpress-candidate-delete", { body: { id } });
      if (error) throw error;
      const resp = data as { ok: boolean; error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Delete failed");
      return resp;
    },
    // Optimistic update — pull the row out of every cached
    // wp-candidates list immediately on success so the user sees it
    // gone in the next paint. Just invalidating the query relied on
    // a fresh re-fetch returning the updated list before the next
    // render, which could lag (network slow, realtime channel missed
    // the DELETE event, etc.) and left the deleted row sitting in
    // place — the user's complaint that 'i pressed delete and shes
    // still here'.
    onSuccess: (_resp, deletedId) => {
      qc.setQueriesData<WpCandidate[]>({ queryKey: KEY }, (prev) =>
        (prev ?? []).filter(c => c.id !== deletedId),
      );
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Staged-profile record — a candidate awaiting review before it lands
 *  on WordPress. Same shape the upsert edge function eventually
 *  consumes, plus some flat fields for list rendering. */
export interface StagedProfile {
  id:                  string;
  source:              string;
  source_response_id:  string | null;
  full_name:           string | null;
  email:               string | null;
  phone:               string | null;
  specialty:           string | null;
  subspecialty:        string | null;
  nationality:         string | null;
  job_title:           string | null;
  current_location:    string | null;
  country_of_training: string | null;
  years_experience:    string | null;
  acf:                 Record<string, unknown>;
  extracted_cv_data:   Record<string, unknown> | null;
  cv_upload_id:        string | null;
  /** JotForm picture URL captured from the submission's widget_metadata.
   *  Render via jotform-file-proxy (the raw URL is APIKEY-gated). */
  picture_url:         string | null;
  created_by:          string | null;
  created_at:          string;
  updated_at:          string;
}

const STAGED_KEY = ["staged-profiles"] as const;

/** List every staged profile. Tiny table — single page fetch is fine. */
export function useStagedProfiles() {
  const qc = useQueryClient();
  const q = useQuery<StagedProfile[]>({
    queryKey: STAGED_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_doctor_profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as StagedProfile[];
    },
    staleTime: 30_000,
  });
  useTableSubscription("staged_doctor_profiles", useCallback(() => {
    qc.invalidateQueries({ queryKey: STAGED_KEY });
  }, [qc]));
  return q;
}

export interface StagedProfileInput {
  source?:             string;
  source_response_id?: string | null;
  full_name?:          string | null;
  email?:              string | null;
  phone?:              string | null;
  specialty?:          string | null;
  subspecialty?:       string | null;
  nationality?:        string | null;
  job_title?:          string | null;
  current_location?:   string | null;
  country_of_training?: string | null;
  years_experience?:   string | null;
  acf?:                Record<string, unknown>;
}

/** Insert a new staged profile from the Create-WP-profile dialog. */
export function useCreateStagedProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StagedProfileInput) => {
      const { data, error } = await supabase
        .from("staged_doctor_profiles")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data as StagedProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAGED_KEY }),
  });
}

/** Edit a staged profile's flat fields or its acf payload in-place. */
export function useUpdateStagedProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StagedProfileInput> }) => {
      const { data, error } = await supabase
        .from("staged_doctor_profiles")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as StagedProfile;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAGED_KEY }),
  });
}

/** Drop a staging row without touching WordPress. */
export function useDeleteStagedProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staged_doctor_profiles").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STAGED_KEY }),
  });
}

/** Publish a staged profile to WordPress. Merges the form-derived ACF
 *  with any CV-extracted fields (written by cv-extract back onto the
 *  staged row), calls wordpress-candidate-upsert at the requested
 *  status, then drops the staging row on success. cv_resume is
 *  stripped from the outgoing ACF — WP rejects it as a raw URL. */
export function usePublishStagedProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profile, status }: { profile: StagedProfile; status: "draft" | "publish" }) => {
      // No-email guard. WP candidate uses email as the dedupe key, so
      // publishing without one comes back as a 400 with a confusing
      // rest_invalid_param error. Surface the real problem instead.
      const candidateEmail = profile.email ?? (profile.acf as Record<string, unknown> | null)?.email as string | undefined;
      if (!candidateEmail || !String(candidateEmail).includes("@")) {
        throw new Error("This submission has no email — add one in the form fields before publishing.");
      }
      // Merge precedence: form ACF (manual edits in the staging row)
      // wins over CV-extracted fields, which fill the gaps.
      const cv = profile.extracted_cv_data ?? {};
      const cvAcf: Record<string, unknown> = {
        job_title:                                              cv.title,
        bio:                                                    cv.bio,
        specific_areas_of_interests_within_the_specialization:  cv.area_of_interest,
        country_of_training:                                    cv.country_training,
        years_of_experience_post_specialization:                cv.years_experience,
        nationality:                                            cv.nationality,
        family_status:                                          cv.family_status,
        dha__haad__moh_license:                                 cv.license,
        expected_salary:                                        cv.salary_expectation,
        notice_period:                                          cv.notice_period,
        languages:                                              cv.languages,
      };
      const mergedAcf: Record<string, unknown> = { ...cvAcf };
      // Form values win — only overwrite where the form has a real value.
      for (const [k, v] of Object.entries(profile.acf ?? {})) {
        if (v !== null && v !== undefined && v !== "") mergedAcf[k] = v;
      }
      // Drop blank/undefined entries so we don't ship "undefined" strings.
      for (const k of Object.keys(mergedAcf)) {
        if (mergedAcf[k] === null || mergedAcf[k] === undefined || mergedAcf[k] === "") delete mergedAcf[k];
      }
      // cv_resume is a File-type ACF on WP — reject as a string. The CV
      // file lives in cv_uploads and is reachable via the proxy.
      delete mergedAcf.cv_resume;

      // NOTE: Picture upload to WP media not wired here yet — would need
      // a server-side step that downloads the JotForm-hosted URL with
      // APIKEY auth + POSTs to wp/v2/media. For now we leave the URL
      // on the staged row (and the "+ photo" badge confirms it was
      // captured); the team can attach the photo manually in WP admin
      // until that pipeline is built.

      const payload: WpCandidateUpsertPayload = {
        status,
        title:  profile.full_name ?? undefined,
        acf:    mergedAcf as WpCandidateUpsertPayload["acf"],
        intent: "publish_from_staging",
      };
      const { data, error } = await supabase.functions.invoke("wordpress-candidate-upsert", { body: payload });
      if (error) throw error;
      const resp = data as { ok: boolean; id?: number; row?: WpCandidate; created?: boolean; error?: string };
      if (!resp.ok) throw new Error(resp.error ?? "Publish failed");

      // ── Photo attach. If the staged row captured a JotForm picture
      //    URL, resolve the form_id (via source_response_id → form_responses)
      //    and hand it to wordpress-candidate-upload-photo, which does the
      //    APIKEY-gated JotForm fetch + WP media upload + ACF attach.
      //    Non-fatal: log + continue on failure so the team can attach
      //    manually if something's off (e.g. JotForm key rotated). The
      //    WP draft is already created; the picture is a nice-to-have.
      if (resp.id && profile.picture_url && profile.source_response_id) {
        try {
          const { data: respRow } = await supabase
            .from("form_responses")
            .select("form_id")
            .eq("id", profile.source_response_id)
            .single();
          const formId = (respRow as { form_id?: string } | null)?.form_id;
          if (formId) {
            const photoRes = await supabase.functions.invoke("wordpress-candidate-upload-photo", {
              body: {
                candidate_id: resp.id,
                jotform_url:  profile.picture_url,
                form_id:      formId,
              },
            });
            if (photoRes.error) {
              console.warn("[publish] photo attach failed:", photoRes.error.message);
            }
          }
        } catch (e) {
          console.warn("[publish] photo attach threw:", e);
        }
      }

      // Drop the staging row only after WP write succeeds — leaves the
      // row in place if WP errors so the user can retry without losing
      // their edits.
      await supabase.from("staged_doctor_profiles").delete().eq("id", profile.id);
      return resp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: STAGED_KEY });
      qc.invalidateQueries({ queryKey: KEY });
    },
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

/** Fetch a single WP candidate by its WordPress id. Used by the detail
 *  dialog as a fast-path when the row isn't in the main paged-list cache
 *  yet (e.g. deep-linked from Slack moments after the upsert). Skips
 *  the 1.2k-row scan entirely — one row, one round trip. */
export function useWpCandidateById(id: number | null) {
  return useQuery<WpCandidate | null>({
    queryKey: ["wp-candidate-by-id", id ?? "none"],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("wordpress_candidates")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WpCandidate | null;
    },
    staleTime: 30_000,
  });
}

/** Fetch the WP candidate linked to an AA doctor_id (lead:/dob:),
 *  if any. Used by SendProfileDialog and other email-rendering surfaces
 *  to populate template tokens from the canonical profile record. */
export function useWpCandidateByDoctorId(doctorId: string | null) {
  return useQuery<WpCandidate | null>({
    queryKey: ["wp-candidate-by-doctor", doctorId ?? "none"],
    enabled: !!doctorId,
    queryFn: async () => {
      if (!doctorId) return null;
      const { data, error } = await supabase
        .from("wordpress_candidates")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("wp_modified", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as WpCandidate | null;
    },
    staleTime: 60_000,
  });
}

/** Normalise a phone to its last 9 digits so country-code / spacing /
 *  punctuation variants collapse onto the same key. JotForm hands us
 *  '+44 7900 123 456'; WP often has '07900123456' or '447900123456';
 *  taking the last-9 ('900123456') matches both without false-positives
 *  on short strings (returns null for anything under 8 digits). */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length < 8) return null;
  return digits.slice(-9);
}

/** Contact-set used by the Forms page's "in WordPress / not in WP"
 *  filter chip + the per-row badge: any candidate matched on email OR
 *  phone counts. Pre-fetching the full set once is cheaper than per
 *  row lookups, and the table is ~1.2k rows. Refreshes on the shared
 *  realtime channel so newly-created candidates flip badges live. */
export function useWpContactSet() {
  const qc = useQueryClient();
  const q = useQuery<{ emails: Set<string>; phones: Set<string> }>({
    queryKey: ["wp-candidate-contact-set"],
    queryFn: async () => {
      const emails = new Set<string>();
      const phones = new Set<string>();
      const PAGE = 1000;
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("wordpress_candidates")
          .select("email, phone")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as Array<{ email: string | null; phone: string | null }>;
        for (const r of batch) {
          const e = (r.email ?? "").toLowerCase().trim();
          if (e) emails.add(e);
          const p = normalizePhone(r.phone);
          if (p) phones.add(p);
        }
        if (batch.length < PAGE) break;
      }
      return { emails, phones };
    },
    staleTime: 60_000,
  });
  useTableSubscription("wordpress_candidates", useCallback(() => {
    qc.invalidateQueries({ queryKey: ["wp-candidate-contact-set"] });
  }, [qc]));
  return q;
}

/** Map of doctor_id → JotForm picture proxy URL for every form_response
 *  that (a) is linked to a doctor and (b) has a 'picture' widget answer
 *  in its raw_payload. Used as a fallback source on the Doctors page so
 *  a doctor who submitted a picture via JotForm but isn't in WordPress
 *  yet still gets a face on their pipeline row.
 *
 *  The proxy URL is constructed against the `jotform-file-proxy` edge
 *  function — same convention as the Forms page. */
export function useJotformPhotoMap() {
  const qc = useQueryClient();
  const q = useQuery<Map<string, string>>({
    queryKey: ["jotform-doctor-photos"],
    queryFn: async () => {
      const out = new Map<string, string>();
      const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, "") ?? "";
      const PAGE = 1000;
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("form_responses")
          .select("doctor_id, form_id, raw_payload")
          .not("doctor_id", "is", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as Array<{
          doctor_id:   string;
          form_id:     string;
          raw_payload: Record<string, unknown>;
        }>;
        for (const r of batch) {
          if (out.has(r.doctor_id)) continue;
          const ans = (r.raw_payload?.answers as Record<string, unknown> | undefined);
          if (!ans || typeof ans !== "object") continue;
          let url: string | null = null;
          for (const v of Object.values(ans)) {
            if (!v || typeof v !== "object") continue;
            const obj = v as { text?: string; answer?: unknown };
            const text = String(obj.text ?? "").toLowerCase();
            const looksLikePic = text.includes("picture") || text.includes("photo") || text.includes("image");
            const answerStr = typeof obj.answer === "string" ? obj.answer : JSON.stringify(obj.answer ?? "");
            if (!answerStr.includes("widget_metadata") && !looksLikePic) continue;
            try {
              const parsed = typeof obj.answer === "string" ? JSON.parse(obj.answer) : obj.answer;
              const items  = (parsed as { widget_metadata?: { value?: Array<{ url?: string }> } })?.widget_metadata?.value;
              const path   = items?.find(it => typeof it?.url === "string")?.url;
              if (path) {
                url = `${projectUrl}/functions/v1/jotform-file-proxy?form_id=${encodeURIComponent(r.form_id)}&path=${encodeURIComponent(path)}`;
                break;
              }
            } catch { /* try next answer */ }
          }
          if (url) out.set(r.doctor_id, url);
        }
        if (batch.length < PAGE) break;
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
  useTableSubscription("form_responses", useCallback(() => {
    qc.invalidateQueries({ queryKey: ["jotform-doctor-photos"] });
  }, [qc]));
  return q;
}

/** Look up a WP candidate by email OR phone. Used by the Forms page to
 *  decide whether to surface a "Create WP profile" button — a row with
 *  no email but a matching phone shouldn't get the create prompt.
 *  Returns null if neither contact matches. Email matched first (the
 *  cheaper exact-string lookup); phone is fall-back, normalised to
 *  last-9-digits and matched via ILIKE suffix so country-code variants
 *  collapse onto the same record. */
export function useWpCandidateByContact(email: string | null | undefined, phone: string | null | undefined) {
  const normEmail = (email ?? "").toLowerCase().trim();
  const normPhone = normalizePhone(phone);
  return useQuery<WpCandidate | null>({
    queryKey: ["wp-candidate-by-contact", normEmail, normPhone ?? ""],
    enabled:  !!normEmail || !!normPhone,
    queryFn: async () => {
      if (normEmail) {
        const { data, error } = await supabase
          .from("wordpress_candidates")
          .select("*")
          .ilike("email", normEmail)
          .order("wp_modified", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as WpCandidate;
      }
      if (normPhone) {
        // Suffix-match — WP phones can have country codes or not; we
        // already collapsed to the last 9 digits client-side.
        const { data, error } = await supabase
          .from("wordpress_candidates")
          .select("*")
          .ilike("phone", `%${normPhone}`)
          .order("wp_modified", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as WpCandidate;
      }
      return null;
    },
    staleTime: 60_000,
  });
}

/** Back-compat shim — the old hook took only an email. Keep the name
 *  pointing at the new email-or-phone implementation so existing call
 *  sites continue to work, and remove on the next sweep. */
export function useWpCandidateByEmail(email: string | null | undefined) {
  return useWpCandidateByContact(email, null);
}

/** Compute age in years from the WP date_of_birth field. WP accepts
 *  several formats ("YYYYMMDD", "YYYY-MM-DD", "4 September 1987"); we
 *  parse all three. Returns null if anything's off. */
function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  let d: Date | null = null;
  if (/^\d{8}$/.test(dob))                 d = new Date(`${dob.slice(0,4)}-${dob.slice(4,6)}-${dob.slice(6,8)}`);
  else if (/^\d{4}-\d{2}-\d{2}/.test(dob)) d = new Date(dob);
  else                                     { const p = new Date(dob); if (!isNaN(p.valueOf())) d = p; }
  if (!d || isNaN(d.valueOf())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

/** Map a WP candidate to the email-template token bag the renderer
 *  expects. Same shape as profileToTokens() from use-doctor-profiles
 *  so existing templates keep working without changes. Both client and
 *  server (send-flow-email edge function) duplicate this mapping —
 *  keep them in lockstep when adding tokens. */
export function wpCandidateToTokens(c: WpCandidate | null): Record<string, string> {
  if (!c) return {};
  const age = computeAge(c.date_of_birth);
  return {
    // Canonical template tokens — kept aligned with the old
    // profileToTokens() so templates that hard-code "Dr. {{doctor_title}}…"
    // continue to render correctly.
    doctor_title:               c.job_title              ?? "",
    doctor_bio:                 c.area_of_interest       ?? "",  // closest analogue; WP has no bio field
    doctor_area_of_interest:    c.area_of_interest       ?? "",
    doctor_country_training:    c.country_of_training    ?? "",
    doctor_years_experience:    c.years_experience != null ? String(c.years_experience) : "",
    doctor_nationality:         c.nationality            ?? "",
    doctor_age:                 age != null ? String(age) : "",
    doctor_marital_status:      c.family_status          ?? "",  // WP doesn't separate marital vs family
    doctor_family_status:       c.family_status          ?? "",
    doctor_license:             c.license_status         ?? "",
    doctor_salary_expectation:  c.expected_salary        ?? "",
    doctor_notice_period:       c.notice_period          ?? "",
    // Extras that the new richer WP record exposes — templates can
    // pick these up too as we iterate the email copy.
    doctor_photo_url:           c.photo_url              ?? "",
    doctor_specialty:           c.specialty              ?? "",
    doctor_subspecialty:        c.subspecialty           ?? "",
    doctor_rank:                c.rank                   ?? "",  // Specialist / Consultant
    doctor_languages:           c.languages              ?? "",
    doctor_english_level:       c.english_level          ?? "",
    doctor_current_location:    c.current_location       ?? "",
    doctor_targeted_locations:  (c.targeted_locations ?? []).join(", "),
    doctor_license_types:       (c.license_types ?? []).join(", "),
    doctor_cv_url:              c.cv_url                 ?? "",
    doctor_wp_link:             c.wp_link                ?? "",
  };
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
