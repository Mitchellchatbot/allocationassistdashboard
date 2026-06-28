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
import { mapToProfile } from "./jotform-extract.ts";

interface ZohoRow {
  Phone?:                          string | null;
  Mobile?:                         string | null;
  Full_Name?:                      string | null;
  First_Name?:                     string | null;
  Last_Name?:                      string | null;
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
  Recruiter?:                      string | null;
  Lead_Source?:                    string | null;
  Owner?:                          { name?: string; email?: string } | null;
}

interface CvEducation { institution?: string; degree?: string; start?: string | number; end?: string | number; description?: string }
interface CvExperience { company?: string; title?: string; start?: string | number; end?: string | number; description?: string }

function nonEmpty(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "" && v !== "false" && v !== false;
}

/** Picks the first non-empty value from a list, or null. */
function pickFirst<T>(...values: T[]): T | null {
  for (const v of values) if (nonEmpty(v)) return v;
  return null;
}

/** Extract the first JotForm picture URL from any of the three shapes
 *  we've seen on form_responses rows:
 *    1. raw_payload.answers — API shape, { qid: { text, answer } }.
 *    2. raw_payload.rawRequest — JSON string of the submission body.
 *    3. flat answers dict — { "Label name": "<json string>" } where
 *       the answer for a widget question is the stringified
 *       { widget_metadata: { value: [{ url }] } } object.
 *  The webhook hits #1 on JSON submissions, #2 on multipart, and
 *  the stage-from-response path hits #3 because the form_response
 *  column already flattens labels. */
function pictureUrlFromFormResponse(
  raw:     Record<string, unknown> | null,
  answers: Record<string, string>  | null = null,
): string | null {
  // ── Shape 1: raw_payload.answers (JotForm API shape) ───────────────
  const apiShape = (raw?.answers as Record<string, unknown> | undefined);
  if (apiShape && typeof apiShape === "object") {
    for (const v of Object.values(apiShape)) {
      if (!v || typeof v !== "object") continue;
      const obj = v as { text?: string; answer?: unknown };
      const text = String(obj.text ?? "").toLowerCase();
      const looksLikePic = text.includes("picture") || text.includes("photo") || text.includes("image");
      const answerStr = typeof obj.answer === "string" ? obj.answer : JSON.stringify(obj.answer ?? "");
      if (!answerStr.includes("widget_metadata") && !looksLikePic) continue;
      const url = extractWidgetUrl(obj.answer);
      if (url) return url;
    }
  }

  // ── Shape 2: raw_payload.rawRequest (multipart payload as JSON string) ─
  const rawReq = raw?.rawRequest;
  if (typeof rawReq === "string") {
    try {
      const parsed = JSON.parse(rawReq) as Record<string, unknown>;
      for (const v of Object.values(parsed)) {
        const url = extractWidgetUrl(v);
        if (url) return url;
      }
    } catch { /* not JSON */ }
  } else if (rawReq && typeof rawReq === "object") {
    for (const v of Object.values(rawReq as Record<string, unknown>)) {
      const url = extractWidgetUrl(v);
      if (url) return url;
    }
  }

  // ── Shape 3: flat answers (label-keyed string values) ─────────────
  if (answers) {
    for (const [label, v] of Object.entries(answers)) {
      if (!v) continue;
      // Cheap pre-filter on the label so we don't try to parse every value as JSON.
      const looksLikePic = /picture|photo|image|profilepic|headshot|studio/i.test(label);
      if (!looksLikePic && !v.includes("widget_metadata")) continue;
      const url = extractWidgetUrl(v);
      if (url) return url;
      // Typeform photo: a plain file URL (api.typeform.com/.../files/…), not
      // widget_metadata. Pick it out of the picture-labelled answer.
      if (looksLikePic) {
        const tf = /https?:\/\/api\.typeform\.com\/[^\s,;"'\\]+/i.exec(v)?.[0]
                ?? /https?:\/\/[^\s,;"'\\]+\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.exec(v)?.[0];
        if (tf) return tf.replace(/\\\//g, "/");
      }
    }
  }

  return null;
}

/** Parse a value (string, object, or anything) and pull the first
 *  widget_metadata.value[].url out of it. Returns absolute URL when
 *  JotForm gives a /widget-uploads/ relative path. */
function extractWidgetUrl(v: unknown): string | null {
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    const items  = (parsed as { widget_metadata?: { value?: Array<{ url?: string }> } })?.widget_metadata?.value;
    const u      = items?.find(it => typeof it?.url === "string")?.url;
    if (!u) return null;
    return u.startsWith("http") ? u : `https://www.jotform.com${u.startsWith("/") ? "" : "/"}${u}`;
  } catch { return null; }
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
  // Re-map the raw form answers and use them to backfill gaps in the
  // stored ACF. This makes a re-extraction self-healing: a profile staged
  // before a mapper fix (e.g. date-of-birth from a verbose Typeform label)
  // picks up the newly-mapped fields. The live formAcf still wins — this
  // only fills keys it left empty.
  const remapped = responseRow?.answers
    ? ((mapToProfile(responseRow.answers).acf as Record<string, unknown> | undefined) ?? {})
    : {};
  const baseForm: Record<string, unknown> = { ...remapped, ...formAcf };

  const acf: Record<string, unknown> = { ...baseForm };

  const fa = (k: string) => baseForm[k];
  const set = (k: string, v: unknown) => { if (nonEmpty(v) && !nonEmpty(fa(k))) acf[k] = v; };

  // Phone — use a clean concatenation. If formAcf already has a phone
  // we leave it alone (the JotForm flattener has already produced
  // "+area phone"); otherwise pull from Zoho, then the CV (no-form path).
  set("phone_number", pickFirst(dob.Mobile, dob.Phone, lead.Mobile, lead.Phone, cv.phone));

  // Email — only the CV carries it on the no-form path (the form/Zoho
  // flows already have it as the staging row's email column).
  set("email", cv.email);

  // Specialty — Zoho's Speciality (British spelling on DoB) or
  // Specialty_New override. CV-derived specialty is the fallback when
  // Zoho doesn't have a record on this email.
  set("specialty", pickFirst(dob.Specialty_New, dob.Speciality, dob.Specialty, lead.Specialty_New, lead.Specialty, cv.specialty));
  set("subspecialty", cv.subspecialty);
  set("current_location", cv.current_location);

  // Country of training.
  set("country_of_training", pickFirst(dob.Country_of_Specialty_training, lead.Country_of_Specialty_training, cv.country_training));

  // Nationality.
  set("nationality", pickFirst(dob.Nationality, lead.Nationality, cv.nationality));

  // License — Zoho's free-text License field, or DHA/DOH/MOH tags.
  set("dha__haad__moh_license", pickFirst(dob.License, lead.License, cv.license));

  // Bio / title / years_experience etc. from the CV when available.
  set("job_title",                                              cv.title);
  set("bio",                                                    cv.bio);
  set("specific_areas_of_interests_within_the_specialization",  cv.area_of_interest);
  set("family_status",                                          cv.family_status);
  set("expected_salary",                                        cv.salary_expectation);
  set("notice_period",                                          cv.notice_period);
  set("languages",                                              cv.languages);
  set("english_level",                                          cv.english_level);

  // Years of experience: form normally wins. But occasionally the
  // doctor enters a silly form value (we've seen "1" from a Consultant
  // with a multi-decade CV — likely they thought it meant 'years at
  // this current job'). When form < 3 AND CV ≥ form + 5, the CV is
  // overwhelmingly likely to be the right value, so we override.
  const formYears = parseInt(String(baseForm.years_of_experience_post_specialization ?? ""), 10);
  const cvYears   = parseInt(String(cv.years_experience ?? ""), 10);
  if (Number.isFinite(cvYears) && cvYears > 0) {
    if (!Number.isFinite(formYears) || formYears <= 0) {
      acf.years_of_experience_post_specialization = cvYears;
    } else if (formYears < 3 && cvYears >= formYears + 5) {
      acf.years_of_experience_post_specialization = cvYears;
    }
  }

  // Name — fall back to Zoho's typed-in name when the form didn't carry
  // one, then to the CV-extracted name (the no-form path's only source).
  set("full_name", pickFirst(
    dob.Full_Name, lead.Full_Name,
    joinName(dob.First_Name, dob.Last_Name),
    joinName(lead.First_Name, lead.Last_Name),
    cv.full_name,
  ));

  // Age — typed into Zoho or stated on CV.
  set("age", pickFirst(cv.age, dob.Age, lead.Age));

  // Marital status — usually only on the CV.
  set("marital_status", cv.marital_status);

  // License status — if we don't have free-text license info, derive a
  // human-friendly label from the boolean Has_DHA / Has_DOH / Has_MOH
  // Zoho tags so the WP profile at least flags registration intent.
  if (!nonEmpty(fa("dha__haad__moh_license")) && !nonEmpty(acf.dha__haad__moh_license)) {
    const tags: string[] = [];
    if (yes(dob.Has_DHA) || yes(lead.Has_DHA)) tags.push("DHA Registered");
    if (yes(dob.Has_DOH) || yes(lead.Has_DOH)) tags.push("DOH Registered");
    if (yes(dob.Has_MOH) || yes(lead.Has_MOH)) tags.push("MOH Registered");
    if (tags.length > 0) acf.dha__haad__moh_license = tags.join(", ");
  }

  // Recruiter / owner — useful breadcrumb on the WP record.
  set("recruiter", pickFirst(dob.Recruiter, lead.Recruiter, lead.Owner?.name, dob.Owner?.name));
  set("lead_source", pickFirst(dob.Lead_Source, lead.Lead_Source));

  // Children flag — parse "2 children" / "no children" out of family_status.
  if (!nonEmpty(fa("have_children_or_any_dependent"))) {
    const fs = String(cv.family_status ?? acf.family_status ?? "");
    if (fs) {
      if (/\b(no|none|0)\s+(?:children|dependents?)/i.test(fs))           acf.have_children_or_any_dependent = false;
      else if (/(\d+)\s*(?:children|kids|dependents?)/i.test(fs))         acf.have_children_or_any_dependent = true;
      else if (/\bchildren|kids|dependents?\b/i.test(fs))                 acf.have_children_or_any_dependent = true;
    }
  }

  // Education + Experience — pluck first two of each from the CV's
  // structured arrays into WP's repeating fields (title1/academy1/…,
  // title2/company2/…). Falls back gracefully if Claude returns
  // single-string `education` / `experience` fields instead.
  applyEducation(acf, cv.education as CvEducation[] | string | undefined, fa);
  applyExperience(acf, cv.experience as CvExperience[] | string | undefined, fa);

  // Picture URL — store it as a sidecar (NOT in acf.profile_picture
  // because that's a WP attachment id, not a URL). The caller is
  // responsible for the WP-media upload step if it wants the image
  // bound to the profile. We check all three shapes (raw_payload.answers,
  // raw_payload.rawRequest, and the flat answers dict).
  const pictureUrl = responseRow
    ? pictureUrlFromFormResponse(
        responseRow.raw_payload as Record<string, unknown> | null,
        responseRow.answers as Record<string, string> | null,
      )
    : null;

  return { mergedAcf: acf, pictureUrl, zohoLead, zohoDob };
}

/** Zoho Has_DHA / Has_DOH / Has_MOH come back as "Yes"/"No" (strings)
 *  or sometimes booleans. Be lenient. */
function yes(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v !== "string") return false;
  return /^(y|yes|true|1)$/i.test(v.trim());
}

function joinName(first: unknown, last: unknown): string | null {
  const a = typeof first === "string" ? first.trim() : "";
  const b = typeof last  === "string" ? last.trim()  : "";
  const out = `${a} ${b}`.trim();
  return out || null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Convert a CV date ("2007", "2018-06", "Jun 2018", "20180604", "Present")
 *  to WP's ACF date-picker storage format YYYYMMDD. Year-only → Jan 1 of
 *  that year. Returns null for present/current/unparseable so we NEVER write
 *  an empty/invalid value that WP stores as epoch 0 → "1 January 1970". */
function toWpDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || /present|current|now|ongoing|to date/i.test(s)) return null;
  if (/^\d{8}$/.test(s)) return s;                                       // already YYYYMMDD
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(s);          // YYYY-MM(-DD)
  if (m) return m[1] + m[2].padStart(2, "0") + (m[3] ? m[3].padStart(2, "0") : "01");
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);                                // MM/YYYY
  if (m) return m[2] + m[1].padStart(2, "0") + "01";
  m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);                         // Mon YYYY
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return m[2] + mo + "01"; }
  m = /^(\d{4})$/.exec(s);                                              // year only
  if (m) return m[1] + "0101";
  return null;                                                         // unknown → leave empty
}

const isPresentDate = (v: unknown) => /present|current|now|ongoing|to date/i.test(String(v ?? ""));

/** Education → WP's single education slot: academy1 (institution),
 *  title1 (degree), start_date1, end_date1, present1, description1.
 *  Only the most-recent entry (Claude returns newest first) — the WP
 *  candidate UI shows one education entry. */
function applyEducation(
  acf: Record<string, unknown>,
  src: CvEducation[] | string | undefined,
  fa:  (k: string) => unknown,
) {
  if (!src) return;
  const rows: CvEducation[] = Array.isArray(src)
    ? src
    : (typeof src === "string" && src.trim() ? [{ description: src } as CvEducation] : []);
  const row = rows[0];
  if (!row) return;
  if (!nonEmpty(fa("title1"))   && row.degree)      acf.title1   = row.degree;
  if (!nonEmpty(fa("academy1")) && row.institution) acf.academy1 = row.institution;
  const start = toWpDate(row.start);
  if (!nonEmpty(fa("start_date1")) && start) acf.start_date1 = start;
  if (isPresentDate(row.end)) {
    // WP's "present" field is a select that stores the string "Yes" — a
    // boolean true is rejected (rest_invalid_param → dropped).
    if (!nonEmpty(fa("present1"))) acf.present1 = "Yes";
  } else {
    const end = toWpDate(row.end);
    if (!nonEmpty(fa("end_date1")) && end) acf.end_date1 = end;
  }
  if (!nonEmpty(fa("description1")) && row.description) acf.description1 = row.description;
}

/** Experience → WP's single experience slot: company2 (employer),
 *  title2 (role), start_date_2, end_date2, present2, description2.
 *  (NOTE the inconsistent WP field names: start_date_2 has an underscore,
 *  end_date2 does not — verified against live records.) The old code wrote
 *  to experience_* fields that don't exist on this CPT, so work history
 *  never appeared. */
function applyExperience(
  acf: Record<string, unknown>,
  src: CvExperience[] | string | undefined,
  fa:  (k: string) => unknown,
) {
  if (!src) return;
  const rows: CvExperience[] = Array.isArray(src)
    ? src
    : (typeof src === "string" && src.trim() ? [{ description: src } as CvExperience] : []);
  const row = rows[0];
  if (!row) return;
  if (!nonEmpty(fa("title2"))   && row.title)   acf.title2   = row.title;
  if (!nonEmpty(fa("company2")) && row.company) acf.company2 = row.company;
  const start = toWpDate(row.start);
  if (!nonEmpty(fa("start_date_2")) && start) acf.start_date_2 = start;
  if (isPresentDate(row.end)) {
    // WP's "present" field stores the string "Yes" — boolean true is rejected.
    if (!nonEmpty(fa("present2"))) acf.present2 = "Yes";
  } else {
    const end = toWpDate(row.end);
    if (!nonEmpty(fa("end_date2")) && end) acf.end_date2 = end;
  }
  if (!nonEmpty(fa("description2")) && row.description) acf.description2 = row.description;
}
