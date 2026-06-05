/**
 * JotForm webhook → WordPress candidate (auto profile creation).
 *
 * Replaces the manual flow where the team had to copy fields from a
 * JotForm submission into a WordPress doctor profile by hand.
 *
 * Endpoint:
 *   POST /functions/v1/jotform-webhook?key=<webhook_secret>
 *
 * Paste that URL into JotForm → Settings → Integrations → Webhooks.
 *
 * What this does per submission:
 *   1. Validates the key against the seeded JotForm row's webhook_secret.
 *   2. Parses the JotForm payload (form-urlencoded with a `rawRequest`
 *      JSON blob is the standard shape).
 *   3. Maps known fields (name, email, phone, specialty, etc.) to the
 *      WordPress candidate ACF schema.
 *   4. Lookups by email — if a WP candidate already exists, UPDATE it;
 *      otherwise CREATE a new one as `status=draft` so the team
 *      reviews before it goes live on allocationassist.com.
 *   5. Mirrors the result into wordpress_candidates table (the upsert
 *      edge function does this automatically).
 *   6. Inserts a form_responses row so the submission shows up in
 *      /forms with the same outreach state machinery as Typeform.
 *   7. Auto-links the form_responses row to a Zoho lead/DoB via the
 *      lookup_doctor_id_by_email RPC.
 *
 * JotForm doesn't natively support HMAC signing; the webhook_secret
 * in the URL is the auth layer. The secret is generated server-side
 * when the form row is seeded and is never exposed to the client.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── 1. Auth via webhook key in URL ─────────────────────────────────
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!key) return json({ ok: false, error: "Missing ?key=…" }, 401);

  const { data: form } = await supabase
    .from("forms")
    .select("id, webhook_secret, form_type, provider")
    .eq("provider", "jotform")
    .eq("webhook_secret", key)
    .maybeSingle();
  if (!form) return json({ ok: false, error: "Unknown or revoked key" }, 401);

  // ── 2. Parse payload ──────────────────────────────────────────────
  // JotForm posts application/x-www-form-urlencoded with a rawRequest
  // parameter holding the JSON blob of answers. Also handle a direct
  // JSON POST in case the team configures it that way.
  const ct  = (req.headers.get("content-type") ?? "").toLowerCase();
  const raw = await req.text();
  let parsed: Record<string, unknown> = {};
  let rawAnswers: Record<string, unknown> = {};

  if (ct.includes("application/json")) {
    try { parsed = JSON.parse(raw); } catch { /* fall through */ }
    rawAnswers = (parsed.rawRequest as Record<string, unknown> | undefined) ?? parsed;
  } else {
    // application/x-www-form-urlencoded
    const params = new URLSearchParams(raw);
    for (const [k, v] of params.entries()) parsed[k] = v;
    const rr = params.get("rawRequest");
    if (rr) {
      try { rawAnswers = JSON.parse(rr); } catch { /* fall through */ }
    } else {
      rawAnswers = parsed;
    }
  }

  if (Object.keys(rawAnswers).length === 0) {
    return json({ ok: false, error: "No answers found in payload", got: Object.keys(parsed) }, 400);
  }

  // ── 3. Map JotForm answers → flat record + canonical ACF payload ─
  const flat = flattenAnswers(rawAnswers);
  const profile = mapToProfile(flat);
  const responseId = String(parsed.submissionID ?? parsed.submission_id ?? crypto.randomUUID());

  if (!profile.email) {
    return json({ ok: false, error: "Submission has no email — can't match to a WP candidate. Skipped." }, 422);
  }

  // ── 4. Lookup existing WP candidate by email ──────────────────────
  const { data: existing } = await supabase
    .from("wordpress_candidates")
    .select("id, doctor_id")
    .ilike("email", profile.email)
    .order("wp_modified", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // ── 5. Upsert to WordPress via the existing edge function ─────────
  // Wraps WP REST + mirror sync + auto-Zoho-link in one call. We pass
  // the existing WP id when there's an email match so it's an UPDATE.
  // New rows land as `status=draft` so HI reviews before they go live.
  const upsertBody = {
    id:     existing?.id,
    status: existing ? undefined : "draft",
    title:  profile.full_name || "JotForm intake",
    acf:    profile.acf,
  };
  const upsertRes = await fetch(`${supabaseUrl}/functions/v1/wordpress-candidate-upsert`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify(upsertBody),
  });
  const upsertJson = await upsertRes.json().catch(() => null) as { ok: boolean; id?: number; error?: string } | null;
  if (!upsertRes.ok || !upsertJson?.ok) {
    console.error("[jotform-webhook] WP upsert failed:", upsertJson);
    // We still record the form_response so the team sees the submission
    // landed; flagging the error in outreach_notes for visibility.
  }

  // ── 6. Auto-link doctor_id from the Zoho cache (email match) ──────
  let doctorId: string | null = null;
  const { data: lookupData } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: profile.email });
  if (typeof lookupData === "string") doctorId = lookupData;

  // ── 7. Insert form_response so /forms shows the submission ────────
  await supabase.from("form_responses").upsert({
    form_id:               form.id,
    provider_response_id:  responseId,
    submitted_at:          new Date().toISOString(),
    raw_payload:           parsed,
    answers:               flat,
    respondent_name:       profile.full_name || null,
    respondent_email:      profile.email      || null,
    doctor_id:             doctorId,
    outreach_status:       "new",
    outreach_notes:        upsertJson?.ok
      ? `Auto-created WP candidate #${upsertJson.id}${existing ? " (updated existing)" : " (new draft)"}.`
      : `WP upsert failed: ${upsertJson?.error ?? "unknown"}`,
  }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false });

  console.log("[jotform-webhook] processed submission", responseId, "email:", profile.email, "wp_id:", upsertJson?.id, "doctor_id:", doctorId);

  return json({
    ok:              true,
    submission_id:   responseId,
    wp_candidate_id: upsertJson?.id ?? null,
    wp_action:       existing ? "updated" : "created",
    doctor_id:       doctorId,
  }, 200);
});

// ─── helpers ───────────────────────────────────────────────────────────

/** Flatten JotForm's answer shape into a plain { questionLabel: value }
 *  map. JotForm keys look like 'q3_firstName' / 'q4_email' / 'q10_phone'.
 *  Strip the q\d+_ prefix and humanise the rest. Compound fields
 *  (name objects, phone objects) get expanded into a single string. */
function flattenAnswers(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (key === "slug" || key === "appid" || key === "event_id") continue;
    const label = humaniseKey(key);
    const value = stringifyValue(v);
    if (label && value) out[label] = value;
  }
  return out;
}

function humaniseKey(k: string): string {
  // 'q3_firstName' → 'firstName' → 'First Name'
  const stripped = k.replace(/^q\d+_/, "");
  // CamelCase / underscores → spaces
  const spaced = stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Common JotForm compound shapes:
    //   { first: "John", last: "Doe", middle?: "..." }
    //   { full: "+971 50 123 4567", area?, phone? }
    //   { url: "https://..." } for file uploads
    if (typeof obj.full === "string")  return obj.full.trim();
    if (typeof obj.first === "string" || typeof obj.last === "string") {
      return [obj.first, obj.middle, obj.last].map(s => typeof s === "string" ? s.trim() : "").filter(Boolean).join(" ");
    }
    if (typeof obj.url === "string")   return obj.url.trim();
    // Fall back to JSON for anything else so the data isn't lost.
    return JSON.stringify(obj);
  }
  return String(v);
}

/** Map the flattened JotForm record to the canonical WordPress ACF
 *  payload + a couple of top-level convenience fields. Field matching
 *  is fuzzy — normalised lower-case alphanumeric comparison so
 *  variants like 'First Name' / 'first_name' / 'fname' all hit. */
function mapToProfile(flat: Record<string, string>): {
  full_name: string;
  email:     string;
  acf:       Record<string, unknown>;
} {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  // Build a lower-key map alongside the original so we can do
  // both case-insensitive lookups AND return original labels.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) lower[norm(k)] = v;

  const pick = (...keys: string[]): string => {
    for (const k of keys) if (lower[k]) return lower[k];
    return "";
  };
  const pickContains = (...substrings: string[]): string => {
    for (const sub of substrings) {
      for (const [k, v] of Object.entries(lower)) {
        if (k.includes(sub) && v) return v;
      }
    }
    return "";
  };

  const first = pick("firstname", "fname", "givenname");
  const last  = pick("lastname", "lname", "surname", "familyname");
  const full  = pick("fullname", "name") || [first, last].filter(Boolean).join(" ");

  const email  = pick("email", "emailaddress");
  const phone  = pick("phone", "phonenumber", "mobile", "tel", "telephone", "whatsapp");

  // ACF fields — names match the WordPress candidate CPT schema.
  const acf: Record<string, unknown> = {};

  if (full)  acf.full_name = full;
  if (email) acf.email     = email;
  if (phone) acf.phone_number = phone;

  const dob = pick("dateofbirth", "dob", "birthdate", "birthday");
  if (dob) acf.date_of_birth = dob;

  const nat = pick("nationality");
  if (nat) acf.nationality = nat;

  const specialty = pick("specialty", "specialization", "speciality") || pickContains("specialty", "specialization");
  if (specialty) acf.specialty = specialty;

  const subspecialty = pick("subspecialty", "subspeciality") || pickContains("subspecialty", "subspeciality");
  if (subspecialty) acf.subspecialty = subspecialty;

  const areas = pick("areasofinterest", "areasofinterestwithinthespecialization", "specificareasofinterests")
             || pickContains("areasofinterest", "specificarea");
  if (areas) acf.specific_areas_of_interests_within_the_specialization = areas;

  const years = pick("yearsofexperience", "yearsexperience", "yearspostspecialization")
             || pickContains("yearsofexperience", "yearsexperience");
  if (years) acf.years_of_experience_post_specialization = years;

  const country = pick("countryoftraining", "trainingcountry") || pickContains("countryoftraining");
  if (country) acf.country_of_training = country;

  const location = pick("currentlocation", "location") || pickContains("currentlocation");
  if (location) acf.current_location = location;

  const job = pick("jobtitle", "currentrole", "position");
  if (job) acf.job_title = job;

  const languages = pick("languages") || pickContains("languages");
  if (languages) acf.languages = languages;

  const englishLevel = pick("englishlevel") || pickContains("englishlevel", "english");
  if (englishLevel) acf.english_level = englishLevel;

  const currentSalary = pick("currentsalary") || pickContains("currentsalary");
  if (currentSalary) acf.current_salary = currentSalary;

  const expectedSalary = pick("expectedsalary") || pickContains("expectedsalary");
  if (expectedSalary) acf.expected_salary = expectedSalary;

  const noticePeriod = pick("noticeperiod") || pickContains("noticeperiod", "notice");
  if (noticePeriod) acf.notice_period = noticePeriod;

  const familyStatus = pick("familystatus", "maritalstatus");
  if (familyStatus) acf.family_status = familyStatus;

  const dependents = pick("haschildren", "children", "dependents", "havechildren", "havedependents");
  if (dependents) acf.have_children_or_any_dependent = /yes|true|1/i.test(dependents) ? "Yes" : "No";

  const rank = pick("specialistorconsultant", "rank", "level");
  if (rank) acf.specialist__consultant = rank;

  const license = pick("license", "licensetype", "dhadohmoh", "dhadohmohscfhsqchplicenses")
               || pickContains("dhadohmoh", "license");
  if (license) acf.dha__haad__moh_license = license;

  const targeted = pick("targetedlocations", "preferredlocations")
                || pickContains("targetedlocation");
  if (targeted) acf.targeted_locations = targeted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);

  // CV upload — JotForm file fields ship as URLs. Match anything that
  // looks like a CV/resume field.
  const cv = pick("cv", "resume", "cvresume", "uploadcv", "uploadyourcv") || pickContains("cv", "resume");
  if (cv) acf.cv_resume = cv;

  return { full_name: full, email, acf };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
