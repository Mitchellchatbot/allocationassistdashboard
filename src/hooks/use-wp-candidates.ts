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
