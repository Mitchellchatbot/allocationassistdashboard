/**
 * JotForm → historical backfill.
 *
 * Pulls every submission from a JotForm via its public API and runs
 * each one through the same pipeline the live webhook uses:
 *   - extract + map answers (shared module)
 *   - upsert WordPress candidate (email-matched; new ones land as draft)
 *   - auto-link to Zoho lead/DoB
 *   - record a form_responses row
 *
 * Endpoint: POST /functions/v1/jotform-historical-sync
 * Body:    { form_id: <dashboard form uuid> }
 *
 * Required state on the `forms` row:
 *   - api_token       — JotForm Personal API Key (Settings → API)
 *   - provider_form_id — JotForm form ID (URL slug after /form/)
 *
 * Returns { ok, fetched, inserted, skipped, wp_created, wp_updated,
 *           total_reported, durationMs }.
 *
 * Idempotent — re-running upserts on (form_id, submission_id) so the
 * second run is a no-op. The first run does the real work.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Inlined from _shared/jotform-extract.ts — bundling the shared file via
// the Supabase CLI's --import-map didn't reliably resolve at the edge,
// causing the function to crash 90s after first DB call. The webhook
// imports the shared module successfully but the sync function does
// not (likely a transient deploy artefact). Copy-paste beats prolonged
// debugging.

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── INLINED JotForm extractor (mirrors _shared/jotform-extract.ts) ───
// If you edit either copy, edit BOTH. The webhook still imports the
// shared file; this function inlines so the bundle stays self-contained
// and the function cold-starts reliably.

function flattenAnswers(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (key === "slug" || key === "appid" || key === "event_id") continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if ("answer" in obj || "text" in obj) {
        const label = typeof obj.text === "string" && obj.text.trim()
          ? obj.text.trim()
          : (typeof obj.name === "string" ? humaniseKey(obj.name) : humaniseKey(key));
        const value = stringifyValue(obj.answer ?? obj.prettyFormat ?? "");
        if (label && value) out[label] = value;
        continue;
      }
    }
    const label = humaniseKey(key);
    const value = stringifyValue(v);
    if (label && value) out[label] = value;
  }
  return out;
}

function humaniseKey(k: string): string {
  const stripped = k.replace(/^q\d+_/, "");
  const spaced = stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.replace(/\b\w/g, c => c.toUpperCase());
}

function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(stringifyValue).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.full === "string")  return obj.full.trim();
    if (typeof obj.first === "string" || typeof obj.last === "string") {
      return [obj.first, obj.middle, obj.last]
        .map(s => typeof s === "string" ? s.trim() : "")
        .filter(Boolean).join(" ");
    }
    if (typeof obj.url === "string")          return obj.url.trim();
    if (typeof obj.prettyFormat === "string") return obj.prettyFormat.trim();
    if (typeof obj.text === "string")         return obj.text.trim();
    return JSON.stringify(obj);
  }
  return String(v);
}

function mapToProfile(flat: Record<string, string>): {
  full_name: string; email: string; phone: string; acf: Record<string, unknown>;
} {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) lower[norm(k)] = v;
  const pick = (...keys: string[]): string => {
    for (const k of keys) if (lower[k]) return lower[k];
    return "";
  };
  const pickContains = (...substrings: string[]): string => {
    for (const sub of substrings) for (const [k, v] of Object.entries(lower)) {
      if (k.includes(sub) && v) return v;
    }
    return "";
  };
  const first = pick("firstname", "fname", "givenname");
  const last  = pick("lastname", "lname", "surname", "familyname");
  const full  = pick("fullname", "name") || [first, last].filter(Boolean).join(" ");
  const email = pick("email", "emailaddress");
  const phone = pick("phone", "phonenumber", "mobile", "tel", "telephone", "whatsapp");
  const acf: Record<string, unknown> = {};
  if (full)  acf.full_name = full;
  if (email) acf.email = email;
  if (phone) acf.phone_number = phone;
  const dob = pick("dateofbirth", "dob", "birthdate", "birthday");
  if (dob) acf.date_of_birth = dob;
  const nat = pick("nationality");
  if (nat) acf.nationality = nat;
  const specialty = pick("specialty", "specialization", "speciality") || pickContains("specialty", "specialization");
  if (specialty) acf.specialty = specialty;
  const subspecialty = pick("subspecialty", "subspeciality") || pickContains("subspecialty", "subspeciality");
  if (subspecialty) acf.subspecialty = subspecialty;
  const areas = pick("areasofinterest", "areasofinterestwithinthespecialization", "specificareasofinterests") || pickContains("areasofinterest", "specificarea");
  if (areas) acf.specific_areas_of_interests_within_the_specialization = areas;
  const years = pick("yearsofexperience", "yearsexperience", "yearspostspecialization") || pickContains("yearsofexperience", "yearsexperience");
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
  const license = pick("license", "licensetype", "dhadohmoh", "dhadohmohscfhsqchplicenses") || pickContains("dhadohmoh", "license");
  if (license) acf.dha__haad__moh_license = license;
  const targeted = pick("targetedlocations", "preferredlocations") || pickContains("targetedlocation");
  if (targeted) acf.targeted_locations = targeted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const cv = pick("cv", "resume", "cvresume", "uploadcv", "uploadyourcv") || pickContains("cv", "resume");
  if (cv) acf.cv_resume = cv;
  return { full_name: full, email, phone, acf };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  console.log("[jotform-sync] booted, SUPABASE_URL set:", !!supabaseUrl, "serviceKey set:", !!serviceKey, "len:", serviceKey.length);
  const supabase = createClient(supabaseUrl, serviceKey);
  const started = Date.now();

  let body: { form_id?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  const formId = body.form_id;
  if (!formId) return json({ ok: false, error: "form_id is required" }, 400);
  console.log("[jotform-sync] looking up form id:", formId);

  // ── Look up the dashboard form row to get API key + JotForm form id ──
  const lookupStart = Date.now();
  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("id, provider, provider_form_id, api_token")
    .eq("id", formId)
    .maybeSingle();
  console.log("[jotform-sync] lookup result:", { row: !!form, error: formErr?.message, durationMs: Date.now() - lookupStart });
  if (formErr) return json({ ok: false, error: `DB lookup error: ${formErr.message}` }, 500);
  if (!form)   return json({ ok: false, error: "Form not found (no row matched the id)" }, 404);
  if (form.provider !== "jotform") {
    return json({ ok: false, error: `Form is provider="${form.provider}", expected "jotform"` }, 400);
  }
  if (!form.api_token)       return json({ ok: false, error: "JotForm API token not set (forms.api_token). Open the form in /forms → Sync history to enter it." }, 400);
  if (!form.provider_form_id) return json({ ok: false, error: "JotForm form_id not set (forms.provider_form_id). It's the slug in the form URL (jotform.com/form/<id>)." }, 400);

  // ── Pre-fetch Zoho cache ONCE so per-submission doctor_id lookup is
  // an in-memory Map hit rather than an RPC round-trip per row. Saves
  // 50-100ms × N submissions, often the difference between fitting in
  // Supabase's 150s wall clock and timing out at row ~225.
  const { data: cacheRows } = await supabase
    .from("zoho_cache")
    .select("id, data")
    .in("id", [1, 2]);
  const emailToDoctor = new Map<string, string>();
  for (const r of (cacheRows ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    if (r.id === 1) {
      // leads on row 1
      const leads = (r.data?.leads as Array<{ id?: string; Email?: string | null }> | undefined) ?? [];
      for (const l of leads) {
        const e = (l.Email ?? "").trim().toLowerCase();
        if (e && l.id) emailToDoctor.set(e, `lead:${l.id}`);
      }
    } else if (r.id === 2) {
      // doctorsOnBoard on row 2 — wins precedence over leads.
      const dob = (r.data?.doctorsOnBoard as Array<{ id?: string; Email?: string | null }> | undefined) ?? [];
      for (const d of dob) {
        const e = (d.Email ?? "").trim().toLowerCase();
        if (e && d.id) emailToDoctor.set(e, `dob:${d.id}`);
      }
    }
  }
  console.log("[jotform-historical-sync] built email→doctor_id map:", emailToDoctor.size, "entries");

  // ── Skip-set: which submissions are ALREADY in form_responses? ──────
  // Without this, a re-run replays every WP-upsert it did last time.
  // For a backfill that previously got ~225 rows through, this drops
  // the work by ~225 sequential 1-2s WP REST calls — easily the
  // difference between completing and timing out at 150s.
  const importedIds = new Set<string>();
  for (let from = 0; from < 200_000; from += 1000) {
    const { data: rows, error: idErr } = await supabase
      .from("form_responses")
      .select("provider_response_id")
      .eq("form_id", form.id)
      .range(from, from + 999);
    if (idErr) { console.warn("[jotform-historical-sync] skip-set fetch error:", idErr); break; }
    if (!rows || rows.length === 0) break;
    for (const r of rows) if (r.provider_response_id) importedIds.add(String(r.provider_response_id));
    if (rows.length < 1000) break;
  }
  console.log("[jotform-historical-sync] skip-set built:", importedIds.size, "rows already imported");

  // ── Walk /form/<id>/submissions ─────────────────────────────────────
  // JotForm's `limit` is capped per plan tier (free: 20, basic: 100,
  // pro: 1000). We ASK for 1000 but the server silently returns fewer
  // when a tier cap is in effect. The earlier version broke when
  // items.length < PAGE_SIZE (= 1000), so on a tier-capped plan we
  // bailed after page 0 with only N items fetched ("stuck at 225").
  //
  // Robust pagination:
  //   - Advance offset by the ACTUAL page length, not the requested PAGE_SIZE
  //   - Terminate when the server returns 0 items, OR when offset has
  //     reached resultSet.count (JotForm's reported total).
  //   - Hard cap 100k as a safety net.
  const PAGE_SIZE  = 1000;
  const HARD_CAP   = 100_000;
  const MAX_PAGES  = 2000;
  // WordPress REST upserts are ~9s each. Even at parallelism 16 we
  // can fit maybe ~40 in a 150s edge wall clock. Cap each invocation
  // at PROCESS_LIMIT new rows; the frontend hook loops back-to-back
  // calls until done. Idempotent on (form_id, provider_response_id)
  // so re-entering the loop is safe.
  const PROCESS_LIMIT = 40;
  let offset = 0;
  let fetched = 0;
  let inserted = 0;
  let skipped = 0;
  let wpCreated = 0;
  let wpUpdated = 0;
  let totalReported = 0;
  let processedInRun = 0;
  let limitReached = false;

  for (let page = 0; page < MAX_PAGES && fetched < HARD_CAP; page++) {
    const url = new URL(`https://api.jotform.com/form/${form.provider_form_id}/submissions`);
    url.searchParams.set("apiKey", form.api_token);
    url.searchParams.set("limit",  String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("orderby","created_at");
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return json({ ok: false, error: `JotForm API ${res.status}: ${text.slice(0, 300)}`, fetched, inserted }, 502);
    }
    const payload = await res.json() as {
      responseCode?: number;
      message?:      string;
      content?:      Array<{ id: string; form_id?: string; created_at?: string; answers?: Record<string, unknown> }>;
      resultSet?:    { count?: number };
      limit?:        number;
    };
    if (payload.responseCode && payload.responseCode !== 200) {
      return json({ ok: false, error: `JotForm: ${payload.message ?? "unknown error"}`, fetched, inserted }, 502);
    }
    const items = payload.content ?? [];
    if (page === 0) totalReported = payload.resultSet?.count ?? 0;
    if (items.length === 0) break;
    fetched += items.length;

    // Filter out already-imported submissions BEFORE doing any of the
    // expensive per-row work. Saves the WP REST round-trip + the
    // form_responses upsert + the WP-candidates lookup for every row
    // a previous sync already covered.
    const allFresh = items.filter(sub => !importedIds.has(String(sub.id)));
    const reusedCount = items.length - allFresh.length;
    if (reusedCount > 0) skipped += reusedCount;
    if (allFresh.length === 0) {
      console.log("[jotform-historical-sync] page", page, "fully covered by prior sync, skipping");
      offset += items.length;
      if (totalReported > 0 && offset >= totalReported) break;
      continue;
    }

    // Cap by PROCESS_LIMIT for this invocation. If this page would
    // push us over, take a slice and remember more remains; the
    // frontend hook loops the call until limitReached stays false.
    const remainingBudget = PROCESS_LIMIT - processedInRun;
    const fresh = allFresh.length <= remainingBudget ? allFresh : allFresh.slice(0, remainingBudget);
    if (fresh.length < allFresh.length) limitReached = true;
    processedInRun += fresh.length;

    // ── Pre-batch the WP-candidate email→id lookup for this whole page
    // in one query. Otherwise we'd do N round-trips just to learn which
    // emails already exist as WP candidates.
    const pageEmails: string[] = [];
    for (const sub of fresh) {
      const flat    = flattenAnswers(sub.answers ?? {});
      const profile = mapToProfile(flat);
      if (profile.email) pageEmails.push(profile.email.toLowerCase());
    }
    const wpExistingByEmail = new Map<string, number>();
    if (pageEmails.length > 0) {
      const { data: wpRows } = await supabase
        .from("wordpress_candidates")
        .select("id, email")
        .in("email", Array.from(new Set(pageEmails)));
      for (const r of (wpRows ?? []) as Array<{ id: number; email: string | null }>) {
        const e = (r.email ?? "").toLowerCase();
        if (e && !wpExistingByEmail.has(e)) wpExistingByEmail.set(e, r.id);
      }
    }

    // ── Process each submission with bounded concurrency ─────────────
    // WP REST upserts are ~1-2s each. Sequential pace timed out at the
    // 150s edge wall clock. 16 in-flight keeps WP REST busy without
    // hammering it — empirically the public site stays responsive
    // at this rate during a 865-row backfill.
    const CONCURRENCY = 16;
    const processOne = async (sub: { id: string; created_at?: string; answers?: Record<string, unknown> }) => {
      try {
        const flat = flattenAnswers(sub.answers ?? {});
        const profile = mapToProfile(flat);
        const submittedAt = sub.created_at ? new Date(sub.created_at.replace(" ", "T") + "Z").toISOString() : new Date().toISOString();

        let wpId: number | null = null;
        let wpAction: "created" | "updated" | "skipped" = "skipped";

        if (profile.email) {
          const existingId = wpExistingByEmail.get(profile.email.toLowerCase()) ?? null;
          const upsertBody = {
            id:     existingId ?? undefined,
            status: existingId ? undefined : "draft",
            title:  profile.full_name || "JotForm intake",
            acf:    profile.acf,
          };
          try {
            const upRes = await fetch(`${supabaseUrl}/functions/v1/wordpress-candidate-upsert`, {
              method:  "POST",
              headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body:    JSON.stringify(upsertBody),
            });
            const upJson = await upRes.json().catch(() => null) as { ok: boolean; id?: number } | null;
            if (upRes.ok && upJson?.ok && typeof upJson.id === "number") {
              wpId = upJson.id;
              wpAction = existingId ? "updated" : "created";
              if (existingId) wpUpdated++; else wpCreated++;
            }
          } catch (e) {
            console.warn("[jotform-historical-sync] WP upsert failed for submission", sub.id, e);
          }
        }

        // doctor_id from the in-memory Zoho map (built once at sync start).
        const doctorId = profile.email ? (emailToDoctor.get(profile.email.toLowerCase()) ?? null) : null;

        const { data: upserted, error: upErr } = await supabase
          .from("form_responses")
          .upsert({
            form_id:               form.id,
            provider_response_id:  sub.id,
            submitted_at:          submittedAt,
            raw_payload:           sub as unknown as Record<string, unknown>,
            answers:               flat,
            respondent_name:       profile.full_name || null,
            respondent_email:      profile.email     || null,
            doctor_id:             doctorId,
            outreach_status:       "new",
            outreach_notes:        wpId
              ? `Historical sync · WP candidate #${wpId} (${wpAction}).`
              : profile.email
                ? `Historical sync · WP upsert skipped (failed).`
                : `Historical sync · no email on submission, WP candidate not touched.`,
          }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false })
          .select("id");
        if (upErr) {
          console.warn("[jotform-historical-sync] form_responses upsert error", upErr);
          skipped++;
        } else if (upserted && upserted.length > 0) {
          inserted++;
        }
      } catch (e) {
        console.error("[jotform-historical-sync] submission failed:", sub.id, e);
        skipped++;
      }
    };

    // Walk the fresh slice (skip-set applied) in fixed-size chunks of
    // CONCURRENCY in-flight tasks.
    for (let i = 0; i < fresh.length; i += CONCURRENCY) {
      const chunk = fresh.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(processOne));
    }

    // Per-invocation budget exhausted — bail and let the frontend
    // re-fire. The skip-set means the next call picks up exactly
    // where this one left off.
    if (limitReached) {
      console.log("[jotform-historical-sync] hit PROCESS_LIMIT, returning early with done:false");
      break;
    }

    // Advance by the ACTUAL number of items returned (tier-cap-safe).
    offset += items.length;
    // Stop once we've covered the reported total. If the API didn't
    // report a total (totalReported = 0), keep walking until we get
    // an empty page on the next loop iteration.
    if (totalReported > 0 && offset >= totalReported) break;
  }

  return json({
    ok:              true,
    done:            !limitReached,
    fetched,
    inserted,
    skipped,
    wp_created:      wpCreated,
    wp_updated:      wpUpdated,
    total_reported:  totalReported,
    durationMs:      Date.now() - started,
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
