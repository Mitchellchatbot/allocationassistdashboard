/**
 * Shared profile-enrichment: given a candidate's email (+ optional
 * doctor_id), pull in EVERY signal we have and merge into one ACF
 * payload ready for the WP candidate.
 *
 * Sources, in increasing priority (later wins):
 *   1. Zoho Lead          — phone/mobile/specialty/license/etc.
 *   2. Zoho Doctors on Board — same fields, more recent precedence.
 *   3. JotForm picture URL — pulled from form_responses widget_metadata.
 *   4. CV-extracted data  — bio / title / years_experience / license / ...
 *   5. Form ACF (caller's `formAcf` arg) — the canonical doctor-typed
 *      answer; wins on every conflict.
 *
 * The webhook calls this at stage time so the staged_doctor_profiles
 * row has the merged data ready. A client-side "Auto-fill from
 * sources" path will eventually hit the same logic via an edge
 * function entry point.
 */
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface ZohoRow {
  Phone?:                          string | null;
  Mobile?:                         string | null;
  Specialty?:                      string | null;
  Specialty_New?:                  string | null;
  Speciality?:                     string | null;
  Country_of_Specialty_training?:  string | null;
  Nationality?:                    string | null;
  License?:                        string | null;
  Has_DHA?:                        string | null;
  Has_DOH?:                        string | null;
  Has_MOH?:                        string | null;
  Age?:                            number | null;
  Owner?:                          { name?: string; email?: string } | null;
}

function nonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "" && v !== "false" && v !== false;
}

/** Picks the first non-empty value from a list, or null. */
function pickFirst<T>(...values: T[]): T | null {
  for (const v of values) if (nonEmpty(v)) return v;
  return null;
}

/** Extract the first JotForm picture URL from a form_responses row's
 *  raw_payload. JotForm stores it as widget_metadata.value[0].url —
 *  the URL itself is APIKEY-gated so consumers should route through
 *  the jotform-file-proxy. We return the raw URL; the caller decides
 *  how to serve it. */
function pictureUrlFromFormResponse(raw: Record<string, unknown> | null): string | null {
  const answers = (raw?.answers as Record<string, unknown> | undefined);
  if (!answers || typeof answers !== "object") return null;
  for (const v of Object.values(answers)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as { text?: string; answer?: unknown };
    const text = String(obj.text ?? "").toLowerCase();
    const looksLikePic = text.includes("picture") || text.includes("photo") || text.includes("image");
    const answerStr = typeof obj.answer === "string" ? obj.answer : JSON.stringify(obj.answer ?? "");
    if (!answerStr.includes("widget_metadata") && !looksLikePic) continue;
    try {
      const parsed = typeof obj.answer === "string" ? JSON.parse(obj.answer) : obj.answer;
      const items  = (parsed as { widget_metadata?: { value?: Array<{ url?: string }> } })?.widget_metadata?.value;
      const url    = items?.find(it => typeof it?.url === "string")?.url;
      if (url) return url;
    } catch { /* try next */ }
  }
  return null;
}

export interface EnrichmentInput {
  supabase:    SupabaseClient;
  email:       string | null;
  formAcf:     Record<string, unknown>;
  /** Optional: latest form_responses row for picture / phone fallback. */
  responseRow?: { raw_payload: Record<string, unknown> | null; answers: Record<string, string> | null } | null;
  /** Optional: cv_uploads.extracted_data already pulled by the caller. */
  cvExtracted?: Record<string, unknown> | null;
}

export interface EnrichmentResult {
  mergedAcf:  Record<string, unknown>;
  pictureUrl: string | null;
  zohoLead:   Record<string, unknown> | null;
  zohoDob:    Record<string, unknown> | null;
}

/** Returns a merged ACF payload + the picture URL (still as a JotForm
 *  /uploads/ path — caller decides whether to proxy or upload to WP).
 *  Pure function aside from the Zoho RPC fetch. */
export async function enrichProfile(input: EnrichmentInput): Promise<EnrichmentResult> {
  const { supabase, email, formAcf, responseRow, cvExtracted } = input;

  let zohoLead: Record<string, unknown> | null = null;
  let zohoDob:  Record<string, unknown> | null = null;
  if (email && email.includes("@")) {
    const { data } = await supabase.rpc("zoho_records_by_email", { p_email: email });
    if (Array.isArray(data) && data[0]) {
      zohoLead = (data[0].lead ?? null) as Record<string, unknown> | null;
      zohoDob  = (data[0].dob  ?? null) as Record<string, unknown> | null;
    }
  }

  const lead = (zohoLead ?? {}) as ZohoRow;
  const dob  = (zohoDob  ?? {}) as ZohoRow;
  const cv   = (cvExtracted ?? {}) as Record<string, unknown>;

  // Per-field merge. Order in pickFirst is "winner first" — formAcf
  // is checked LAST in the call so its value takes precedence ONLY
  // when present. (Realised by listing it first in pickFirst.)
  const acf: Record<string, unknown> = { ...formAcf };

  const fa = (k: string) => formAcf[k];
  const set = (k: string, v: unknown) => { if (nonEmpty(v) && !nonEmpty(fa(k))) acf[k] = v; };

  // Phone — use a clean concatenation. If formAcf already has a phone
  // we leave it alone (the JotForm flattener has already produced
  // "+area phone"); otherwise pull from Zoho.
  set("phone_number", pickFirst(dob.Mobile, dob.Phone, lead.Mobile, lead.Phone));

  // Specialty — Zoho's Speciality (British spelling on DoB) or
  // Specialty_New override.
  set("specialty", pickFirst(dob.Specialty_New, dob.Speciality, dob.Specialty, lead.Specialty_New, lead.Specialty));

  // Country of training.
  set("country_of_training", pickFirst(dob.Country_of_Specialty_training, lead.Country_of_Specialty_training));

  // Nationality.
  set("nationality", pickFirst(dob.Nationality, lead.Nationality, cv.nationality));

  // License — Zoho's free-text License field, or DHA/DOH/MOH tags.
  set("dha__haad__moh_license", pickFirst(dob.License, lead.License, cv.license));

  // Bio / title / years_experience etc. from the CV when available.
  set("job_title",                                              cv.title);
  set("bio",                                                    cv.bio);
  set("specific_areas_of_interests_within_the_specialization",  cv.area_of_interest);
  set("years_of_experience_post_specialization",                cv.years_experience);
  set("family_status",                                          cv.family_status);
  set("expected_salary",                                        cv.salary_expectation);
  set("notice_period",                                          cv.notice_period);
  set("languages",                                              cv.languages);

  // Picture URL — store it as a sidecar (NOT in acf.profile_picture
  // because that's a WP attachment id, not a URL). The caller is
  // responsible for the WP-media upload step if it wants the image
  // bound to the profile.
  const pictureUrl = responseRow ? pictureUrlFromFormResponse(responseRow.raw_payload as Record<string, unknown> | null) : null;

  return { mergedAcf: acf, pictureUrl, zohoLead, zohoDob };
}
