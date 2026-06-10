/**
 * Upsert a candidate to the AA WordPress site.
 *
 * - body.id present       → PATCH /wp/v2/candidate/<id> (partial edit)
 * - body.id absent        → POST  /wp/v2/candidate      (create new)
 *
 * After the WP call succeeds we re-fetch the row from WP and upsert it
 * into wordpress_candidates so the dashboard reflects the change
 * immediately, without waiting for the next full sync.
 *
 * Endpoint: POST /functions/v1/wordpress-candidate-upsert
 * Body shape (all optional except where noted):
 *   {
 *     id?:            number,                  // omit to create
 *     status?:        "publish" | "private" | "draft",
 *     title?:         string,                   // post title
 *     // any ACF field key → value. We pass through the WP-native
 *     // keys (full_name, job_title, phone_number, email, …) so the
 *     // UI doesn't need to know about our column-rename layer.
 *     acf?:           Record<string, unknown>,
 *     // doctor_id is OUR field, not WP's — written straight to the
 *     // mirror after the WP write succeeds.
 *     doctor_id?:     string | null,
 *   }
 *
 * Returns the freshly-mirrored row.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl  = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const wpBaseUrl    = (Deno.env.get("WP_BASE_URL") ?? "").replace(/\/+$/, "");
const wpUsername   = Deno.env.get("WP_USERNAME") ?? "";
const wpAppPassword = (Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s/g, "");
const supabase     = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface UpsertBody {
  id?:        number;
  status?:    "publish" | "private" | "draft";
  title?:     string;
  acf?:       Record<string, unknown>;
  doctor_id?: string | null;
  /** Required for CREATE (no id) calls. The team's hard rule is that
   *  nothing lands on WordPress until a human clicks Publish or the
   *  edit-doctor dialog explicitly creates one. We require the caller
   *  to set this so a future webhook/cron can't accidentally CREATE
   *  a WP post — the guard only allows known intents. */
  intent?:    "publish_from_staging" | "manual_create" | "edit";
}

const ALLOWED_CREATE_INTENTS = new Set(["publish_from_staging", "manual_create"]);

Deno.serve(async (req: Request) => {
  // Top-level try/catch turns any uncaught throw (WP timeout, malformed
  // response, etc.) into a JSON error response instead of a runtime
  // crash that surfaces to the client as 502 EDGE_FUNCTION_ERROR with
  // no usable detail.
  try {
    return await handleUpsert(req);
  } catch (err) {
    console.error("[wordpress-candidate-upsert] uncaught:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Edge function threw: ${msg}` }, 500);
  }
});

async function handleUpsert(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return json({ ok: false, error: "Missing WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD env" }, 500);
  }

  let body: UpsertBody;
  try { body = await req.json() as UpsertBody; }
  catch { return json({ ok: false, error: "Bad JSON body" }, 400); }

  // Intent guard. Required for CREATE; edits don't need it (a partial
  // edit on an existing WP post is fine from any path that already
  // had access). The user's rule is 'NO WP posts until press upload',
  // which is exactly what this enforces server-side.
  const isCreateCall = !(typeof body.id === "number" && body.id > 0);
  if (isCreateCall) {
    if (!body.intent || !ALLOWED_CREATE_INTENTS.has(body.intent)) {
      console.warn("[wordpress-candidate-upsert] BLOCKED unattributed create:", { intent: body.intent, title: body.title });
      return json({
        ok: false,
        error: "Create blocked: missing or invalid intent. Staging-area Publish or the manual New-profile dialog are the only allowed paths.",
      }, 403);
    }
    console.log(`[wordpress-candidate-upsert] create intent=${body.intent} title="${body.title ?? ""}"`);
  }

  const basic = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);

  // 1. Static WP payload (title/status). ACF is applied per-attempt in the
  //    retry loop below so we can drop a field WP rejects and try again.
  const wpPayload: Record<string, unknown> = {};
  if (body.title  !== undefined) wpPayload.title  = body.title;
  if (body.status !== undefined) wpPayload.status = body.status;
  // Sanitise the ACF object so typed fields don't trip rest_invalid_param.
  let acfPayload = body.acf !== undefined ? sanitizeAcf(body.acf) : undefined;

  // 2. POST (create) or PATCH-via-POST (edit). The WP REST API accepts POST
  //    for both — "POST /wp/v2/candidate/<id>" is the documented edit path.
  const isEdit = typeof body.id === "number" && body.id > 0;
  const wpUrl  = isEdit
    ? `${wpBaseUrl}/wp-json/wp/v2/candidate/${body.id}`
    : `${wpBaseUrl}/wp-json/wp/v2/candidate`;

  // Self-healing POST. WP validates every ACF value against the schema ACF
  // registered — both types AND select-field choice lists — but fails the
  // WHOLE write naming only the parent "acf". When a specific field is
  // rejected we parse it out of the error, DROP it, and retry, so one bad
  // value (e.g. country "UK" not in the choice list, or a stray type) doesn't
  // sink the entire profile. Dropped fields are reported so the team can set
  // them by hand. 45s hard wall per attempt — the edge runtime kills at ~150s.
  const droppedFields: string[] = [];
  let wpJson: {
    id?: number; code?: string; message?: string;
    data?: { status?: number; params?: Record<string, unknown>; details?: Record<string, unknown> };
  } | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const reqBody: Record<string, unknown> = {
      ...wpPayload,
      ...(acfPayload !== undefined ? { acf: acfPayload } : {}),
      ...(isEdit ? {} : { status: body.status ?? "draft" }),
    };
    let wpRes: Response;
    try {
      wpRes = await fetchWithTimeout(wpUrl, {
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(reqBody),
      }, 45_000);
    } catch (e) {
      return json({ ok: false, error: `WP REST didn't respond in 45s. WP may be slow or unreachable. Detail: ${(e as Error).message}` }, 504);
    }
    wpJson = await wpRes.json().catch(() => null) as typeof wpJson;
    if (wpRes.ok && wpJson && !wpJson.code) break;   // success

    // Recoverable? rest_invalid_param naming acf field(s) we still hold — drop
    // them and retry rather than failing the whole upsert.
    if (wpJson?.code === "rest_invalid_param" && acfPayload && Object.keys(acfPayload).length) {
      const bad = badAcfFields(wpJson).filter(f => f in (acfPayload as Record<string, unknown>));
      if (bad.length) {
        for (const f of bad) { delete (acfPayload as Record<string, unknown>)[f]; droppedFields.push(f); }
        console.warn(`[wordpress-candidate-upsert] dropped invalid acf field(s), retrying: ${bad.join(", ")}`);
        continue;
      }
    }
    // Non-recoverable → surface the real error (data.params names the field).
    const passthrough = wpRes.status >= 400 && wpRes.status < 500 ? wpRes.status : 502;
    const extra = wpJson?.data?.params
      ? ` (${Object.values(wpJson.data.params).join("; ")})`
      : wpJson?.data?.details ? ` (${JSON.stringify(wpJson.data.details)})` : "";
    return json({ ok: false, error: `WP ${wpRes.status}: ${wpJson?.code ?? "unknown"} — ${wpJson?.message ?? "no body"}${extra}` }, passthrough);
  }

  const newId = wpJson?.id;
  if (typeof newId !== "number") {
    return json({ ok: false, error: `WP returned no id after upsert${droppedFields.length ? ` (dropped invalid: ${droppedFields.join(", ")})` : ""}` }, 502);
  }

  // 3. The create/edit POST already returned the full object (id, slug,
  //    status, link, acf, …) in WP's normalised form, so use it directly
  //    instead of a second round trip — that refetch was the slow half of
  //    "New profile". The mirror is still exact (next sync reconciles anything
  //    WP changes server-side later).
  const c = wpJson as unknown as {
    id: number; slug: string; status?: string; link: string;
    date?: string; modified?: string;
    title?: { rendered?: string };
    acf?: Record<string, unknown>;
  };

  // 4. Project into mirror columns — same shape the sync function uses,
  //    just for this one row. Keeps the two paths in lockstep.
  const a = c.acf ?? {} as Record<string, unknown>;
  const years = parseYears(a.years_of_experience_post_specialization);
  const hasDeps = parseYesNo(a.have_children_or_any_dependent);
  const licenseTypes = parseStringArray(a.license_type);
  const targeted     = parseStringArray(a.targeted_locations);
  const cvUrl = readCvUrl(a);

  // photo_url: a number (attachment id) needs resolving — skip on upsert
  // path; the next full sync (or the user re-uploading) will fill it.
  const photoUrl = await resolvePhotoUrl(a.profile_picture, basic);

  const eduPresent = parseYesNo(a.present1);
  const expPresent = parseYesNo(a.present2);

  const mirrorRow = {
    id:                 c.id,
    wp_slug:            c.slug,
    wp_link:            c.link,
    status:             c.status ?? null,
    title:              cleanText(c.title?.rendered),
    full_name:          cleanText(a.full_name as string | undefined),
    job_title:          cleanText(a.job_title as string | undefined),
    email:              cleanText(a.email as string | undefined),
    phone:              cleanText(a.phone_number as string | undefined),
    date_of_birth:      cleanText(a.date_of_birth as string | undefined),
    nationality:        cleanText(a.nationality as string | undefined),
    specialty:          cleanText(a.specialty as string | undefined),
    subspecialty:       cleanText(a.subspecialty as string | undefined),
    area_of_interest:   cleanText(a.specific_areas_of_interests_within_the_specialization as string | undefined),
    years_experience:   years,
    license_status:     cleanText(a.dha__haad__moh_license as string | undefined),
    license_types:      licenseTypes,
    family_status:      cleanText(a.family_status as string | undefined),
    has_dependents:     hasDeps,
    country_of_training: cleanText(a.country_of_training as string | undefined),
    current_location:   cleanText(a.current_location as string | undefined),
    rank:               cleanText(a.specialist__consultant as string | undefined),
    languages:          cleanText(a.languages as string | undefined),
    english_level:      cleanText(a.english_level as string | undefined),
    current_salary:     cleanText(a.current_salary as string | undefined),
    expected_salary:    cleanText(a.expected_salary as string | undefined),
    notice_period:      cleanText(a.notice_period as string | undefined),
    targeted_locations: targeted,
    cv_url:             cvUrl,
    photo_url:          photoUrl,

    education_title:       cleanText(a.title1 as string | undefined),
    education_academy:     cleanText(a.academy1 as string | undefined),
    education_start:       (a.start_date1 as string | undefined) ?? null,
    education_end:         (a.end_date1   as string | undefined) ?? null,
    education_present:     eduPresent,
    education_description: cleanText(a.description1 as string | undefined),

    experience_title:       cleanText(a.title2 as string | undefined),
    experience_company:     cleanText(a.company2 as string | undefined),
    experience_start:       (a.start_date_2 as string | undefined) ?? null,
    experience_end:         (a.end_date2    as string | undefined) ?? null,
    experience_present:     expPresent,
    experience_description: cleanText(a.description2 as string | undefined),

    doctor_id:          body.doctor_id !== undefined ? body.doctor_id : undefined,
    raw_acf:            a,
    wp_date:            c.date     ?? null,
    wp_modified:        c.modified ?? null,
    last_synced_at:     new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };

  // Drop doctor_id from the upsert if caller didn't pass it — we don't
  // want to overwrite a previously-set link with undefined.
  const upsertRow: Record<string, unknown> = { ...mirrorRow };
  if (body.doctor_id === undefined) delete upsertRow.doctor_id;

  const { error: upErr } = await supabase
    .from("wordpress_candidates")
    .upsert(upsertRow, { onConflict: "id" });
  if (upErr) {
    return json({ ok: false, error: `Mirror upsert: ${upErr.message}`, wp_id: newId }, 500);
  }

  // 5. Auto-link the newly-created (or freshly-edited) row to an
  //    existing AA doctor_id by email or unique normalised name.
  //    Only fires when doctor_id is currently null — manual links
  //    are sacred. The RPC has the same guard, so this is doubly safe.
  //    Skipped for blank "New profile" creates: there's no email/name to
  //    match yet, and loading + indexing the Zoho cache is the slow part —
  //    the next sync auto-links it once the team fills in the fields.
  let autoLinked: string | null = null;
  if (!body.doctor_id && body.intent !== "manual_create") {
    autoLinked = await autoLinkOne({
      id:        newId,
      full_name: cleanText(a.full_name as string | undefined),
      title:     cleanText(c.title?.rendered),
      email:     cleanText(a.email as string | undefined),
    });
  }

  return json({ ok: true, id: newId, row: mirrorRow, created: !isEdit, auto_linked: autoLinked, dropped_fields: droppedFields }, 200);
}

// ─── one-row auto-link ────────────────────────────────────────────────

interface ZohoLeadLike {
  id?: string;
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
}

/** Lookup a single candidate against the Zoho cache. Returns the
 *  doctor_id if a confident match exists, else null. */
async function autoLinkOne(c: { id: number; full_name: string | null; title: string | null; email: string | null }): Promise<string | null> {
  try {
    const { data: cacheRows } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
    const merged: Record<string, unknown> = {};
    for (const r of (cacheRows ?? []) as Array<{ data: Record<string, unknown> }>) Object.assign(merged, r.data ?? {});
    const leads          = (merged.leads          as ZohoLeadLike[]) ?? [];
    const doctorsOnBoard = (merged.doctorsOnBoard as ZohoLeadLike[]) ?? (merged.contacts as ZohoLeadLike[]) ?? [];

    const emailIdx = new Map<string, string>();
    const nameIdx  = new Map<string, string[]>();
    const indexOne = (r: ZohoLeadLike, prefix: "lead" | "dob") => {
      if (!r.id) return;
      const did = `${prefix}:${r.id}`;
      const e = normaliseEmail(r.Email);
      if (e) emailIdx.set(e, did);
      const n = normaliseName(r.Full_Name ?? `${r.First_Name ?? ""} ${r.Last_Name ?? ""}`);
      if (n) { const arr = nameIdx.get(n); if (arr) { if (!arr.includes(did)) arr.push(did); } else nameIdx.set(n, [did]); }
    };
    for (const r of leads)          indexOne(r, "lead");
    for (const r of doctorsOnBoard) indexOne(r, "dob");

    const e = normaliseEmail(c.email);
    if (e && emailIdx.has(e)) {
      const did = emailIdx.get(e)!;
      await supabase.rpc("wordpress_candidates_bulk_link", { updates: [{ id: c.id, doctor_id: did }] as unknown as Record<string, unknown>[] });
      return did;
    }
    const n = normaliseName(c.full_name ?? c.title ?? "");
    if (n) {
      const hits = nameIdx.get(n);
      if (hits && hits.length === 1) {
        const did = hits[0];
        await supabase.rpc("wordpress_candidates_bulk_link", { updates: [{ id: c.id, doctor_id: did }] as unknown as Record<string, unknown>[] });
        return did;
      }
    }
    return null;
  } catch (err) {
    console.warn("[wordpress-candidate-upsert] auto-link failed:", err);
    return null;
  }
}

function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

function normaliseName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.toLowerCase()
       .replace(/^(dr|doctor|prof|mr|mrs|ms|miss)\.?\s+/i, "")
       .replace(/[^\w\s]/g, " ")
       .replace(/\s+/g, " ")
       .trim();
  return s.split(" ").length >= 2 ? s : null;
}

// ─── helpers ──────────────────────────────────────────────────────────

function parseYears(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseInt(v, 10); return isNaN(n) ? null : n; }
  return null;
}

function parseYesNo(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v == null || v === "")  return null;
  return /yes|true|1/i.test(String(v));
}

/** Coerce a phone value to a plain "+area phone" string. Handles JotForm's
 *  {area, phone(, full)} object, that object as a raw JSON string, or an
 *  already-plain string. Returns "" only for genuinely empty input. */
function normalizePhone(v: unknown): string {
  let o: { area?: unknown; phone?: unknown; full?: unknown } | null = null;
  if (v && typeof v === "object") {
    o = v as typeof o;
  } else if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("{") && s.includes("phone")) {
      try { o = JSON.parse(s); } catch { /* not JSON — treat as plain */ }
    }
    if (!o) return s; // already a plain phone string
  } else {
    return v == null ? "" : String(v).trim();
  }
  if (typeof o?.full === "string" && o.full.trim()) return o.full.trim();
  const a = o?.area  != null ? String(o.area).trim()  : "";
  const p = o?.phone != null ? String(o.phone).trim() : "";
  const joined = [a, p].filter(Boolean).join(" ");
  if (joined) return joined;
  // Object with no usable parts → fall back to the original string form.
  return typeof v === "string" ? v.trim() : "";
}

/** Parse the ACF field name(s) WP rejected out of a rest_invalid_param
 *  response. WP only names the parent "acf" in `message`, but data.params /
 *  data.details spell out e.g. "acf[country_of_training] is not one of …". */
function badAcfFields(wpJson: { message?: string; data?: { params?: Record<string, unknown>; details?: Record<string, unknown> } } | null): string[] {
  const texts: string[] = [];
  if (wpJson?.message)       texts.push(String(wpJson.message));
  if (wpJson?.data?.params)  texts.push(...Object.values(wpJson.data.params).map(v => String(v)));
  if (wpJson?.data?.details) texts.push(JSON.stringify(wpJson.data.details));
  const fields = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/acf\[([a-zA-Z0-9_]+)\]/g)) fields.add(m[1]);
  return [...fields];
}

/** WP's country select choices (full English names). Used to resolve a
 *  case/spacing variant back to the exact choice so it isn't rejected. */
const CANONICAL_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (Brazzaville)","Congo (Kinshasa)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic (Czechia)","Denmark","Djibouti","Dominica","Dominican Republic","East Timor (Timor-Leste)","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Hong Kong","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast (Côte d'Ivoire)","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Korea, North","Korea, South","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Macedonia","Myanmar (Burma)","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];
const COUNTRY_BY_LOWER = new Map(CANONICAL_COUNTRIES.map(c => [c.toLowerCase(), c]));

/** Common aliases → canonical WP choice. */
const COUNTRY_ALIASES: Record<string, string> = {
  "uk": "United Kingdom", "u.k.": "United Kingdom", "gb": "United Kingdom",
  "great britain": "United Kingdom", "britain": "United Kingdom",
  "england": "United Kingdom", "scotland": "United Kingdom", "wales": "United Kingdom",
  "northern ireland": "United Kingdom",
  "usa": "United States", "us": "United States", "u.s.": "United States",
  "u.s.a.": "United States", "america": "United States", "united states of america": "United States",
  "united states of america (usa)": "United States",
  "uae": "United Arab Emirates", "u.a.e.": "United Arab Emirates", "emirates": "United Arab Emirates",
  "ksa": "Saudi Arabia", "saudi": "Saudi Arabia", "saudi arabia (ksa)": "Saudi Arabia",
  "republic of ireland": "Ireland", "roi": "Ireland",
  "south korea": "Korea, South", "north korea": "Korea, North",
  "ivory coast": "Ivory Coast (Côte d'Ivoire)", "cote d'ivoire": "Ivory Coast (Côte d'Ivoire)",
  "czechia": "Czech Republic (Czechia)", "czech republic": "Czech Republic (Czechia)",
  "myanmar": "Myanmar (Burma)", "burma": "Myanmar (Burma)",
  "timor-leste": "East Timor (Timor-Leste)", "east timor": "East Timor (Timor-Leste)",
};
/** Strip parentheticals + punctuation for fuzzy comparison. */
function normCountry(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
const COUNTRY_NORM_TO_CANON = new Map(CANONICAL_COUNTRIES.map(c => [normCountry(c), c] as const));

/** Levenshtein distance (small strings). */
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Best-effort canonical country. Exact/alias first, then normalised exact
 *  (drops parentheticals/commas/punctuation, fixes casing), then "canonical
 *  appears as a whole phrase inside the input" (extra descriptor words like
 *  "United Kingdom of Great Britain"), then a tight typo tolerance. Kept
 *  CONSERVATIVE on purpose: a wrong-but-valid country would be accepted by WP
 *  and silently mislabel the doctor, so we only auto-correct when confident —
 *  anything iffy falls through and the upsert retry loop drops it. */
function normalizeCountry(v: string): string {
  const raw = v.trim();
  if (!raw) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  if (COUNTRY_ALIASES[key])         return COUNTRY_ALIASES[key];
  if (COUNTRY_BY_LOWER.has(key))     return COUNTRY_BY_LOWER.get(key)!;
  const n = normCountry(raw);
  if (!n) return raw;
  if (COUNTRY_NORM_TO_CANON.has(n))  return COUNTRY_NORM_TO_CANON.get(n)!;
  for (const [cn, canon] of COUNTRY_NORM_TO_CANON) {
    if (cn.length >= 5 && (` ${n} `).includes(` ${cn} `)) return canon;
  }
  let best: { canon: string; d: number } | null = null;
  for (const [cn, canon] of COUNTRY_NORM_TO_CANON) {
    const d = lev(n, cn);
    if (!best || d < best.d) best = { canon, d };
  }
  if (best && best.d <= 2 && best.d <= Math.floor(n.length / 4)) return best.canon;
  return raw;  // not confident → retry loop drops it
}

/** ACF fields that WP registers as checkbox / multi-select — they want an
 *  array in REST, and a bare string trips rest_invalid_param. */
const ACF_ARRAY_FIELDS = new Set(["license_type", "targeted_locations"]);

/** Sanitise an ACF payload so typed fields don't trip WordPress's
 *  rest_invalid_param ("Invalid parameter(s): acf"). WP validates every
 *  value against the schema ACF registered, but only reports the parent
 *  param — so one wrong-typed field fails the WHOLE write. We:
 *    - drop empties (an "" / null on a number/date/image/bool field errors;
 *      text fields don't need an explicit empty on write),
 *    - coerce the known typed fields to the type ACF expects,
 *    - wrap multi-select fields in an array.
 *  Unknown text fields pass through untouched. */
function sanitizeAcf(acf: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!acf || typeof acf !== "object") return acf;
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(acf)) {
    let v: unknown = raw;
    if (v === null || v === undefined || v === "") continue;

    // CV / résumé is an ACF File field — only ever set via the dedicated
    // upload-cv path (an attachment id). A raw URL/string here trips
    // rest_invalid_param, so never send it through a normal upsert.
    if (k === "cv_resume" || k === "cv__resume" || k === "cv_resume_file") continue;

    // Image field → attachment ID (integer). A URL / object / non-numeric
    // string is rejected; the photo is attached separately via
    // wordpress-candidate-upload-photo, so just drop anything that isn't a
    // valid id here.
    if (k === "profile_picture") {
      const id = typeof v === "number" ? v : (/^\d+$/.test(String(v)) ? parseInt(String(v), 10) : null);
      if (id) out[k] = id;
      continue;
    }
    // Number field → coerce a numeric-ish string, drop anything non-numeric.
    if (k === "years_of_experience_post_specialization") {
      const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n)) out[k] = n;
      continue;
    }
    // WP registers this as a STRING field ("string,null"), NOT a boolean —
    // a boolean trips rest_invalid_param. Keep the original string; convert a
    // stray boolean to "Yes"/"No".
    if (k === "have_children_or_any_dependent") {
      out[k] = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v).trim();
      continue;
    }
    // Country select — map common aliases (UK, USA, UAE…) to the canonical
    // choice. An unrecognised value still rides through; if WP rejects it as
    // "not one of …", the retry loop drops it.
    if (k === "country_of_training") {
      out[k] = normalizeCountry(String(v));
      continue;
    }
    // Phone — JotForm's phone control is a {area, phone} object; depending on
    // the ingest path it can arrive here as that object OR its raw JSON
    // string, which WP then stores verbatim ('{"area":"+49",...}'). Always
    // coerce to a plain "+area phone" string before it reaches the field.
    if (k === "phone_number") {
      const clean = normalizePhone(v);
      if (clean) out[k] = clean;
      continue;
    }
    // Checkbox / multi-select → array.
    if (ACF_ARRAY_FIELDS.has(k) && !Array.isArray(v)) v = [String(v)];

    out[k] = v;
  }
  return out;
}

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => typeof x === "string" ? x : ((x as { name?: string; slug?: string })?.name || (x as { slug?: string })?.slug || "")).filter(Boolean);
}

function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,         (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g,  "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function cleanText(s: string | null | undefined): string | null {
  if (s == null) return null;
  const decoded = decodeEntities(String(s)).trim();
  return decoded === "" ? null : decoded;
}

/** Read a CV URL out of an acf object regardless of the real field slug
 *  (cv_resume / cv__resume / …), then any /resume|curriculum/i key. Accepts a
 *  string URL or an ACF File object ({url}). Mirrors the sync function. */
function readCvUrl(a: Record<string, unknown>): string | null {
  const fromVal = (v: unknown): string | null => {
    if (typeof v === "string") return v.trim() || null;
    if (v && typeof v === "object") {
      const o = v as { url?: string; source_url?: string };
      return (o.url || o.source_url) ?? null;
    }
    return null;
  };
  for (const k of ["cv_resume", "cv__resume", "cv_resume_file"]) {
    const u = fromVal(a[k]);
    if (u) return u;
  }
  for (const k of Object.keys(a)) {
    if (/resume|curriculum/i.test(k)) {
      const u = fromVal(a[k]);
      if (u) return u;
    }
  }
  return null;
}

async function resolvePhotoUrl(pp: unknown, basic: string): Promise<string | null> {
  if (pp == null) return null;
  if (typeof pp === "object") {
    const obj = pp as { url?: string; source_url?: string };
    return obj.source_url ?? obj.url ?? null;
  }
  const id = typeof pp === "number" ? pp : (/^\d+$/.test(String(pp)) ? parseInt(String(pp), 10) : null);
  if (!id) return null;
  try {
    const res = await fetch(`${wpBaseUrl}/wp-json/wp/v2/media/${id}?_fields=source_url`, {
      headers: { Authorization: basic, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json() as { source_url?: string };
    return d.source_url ?? null;
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** fetch + AbortController timeout. Throws on timeout so callers can
 *  distinguish a slow upstream from a connection refusal. */
async function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
