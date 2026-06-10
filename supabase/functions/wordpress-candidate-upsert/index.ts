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

  // 1. Build the WP payload. Only include fields the caller actually
  //    set — partial PATCH is the friendly default and avoids us
  //    accidentally zeroing a field by sending undefined.
  const wpPayload: Record<string, unknown> = {};
  if (body.title  !== undefined) wpPayload.title  = body.title;
  if (body.status !== undefined) wpPayload.status = body.status;
  // Sanitise the ACF object so typed fields don't trip WP's
  // rest_invalid_param ("Invalid parameter(s): acf"). See sanitizeAcf.
  if (body.acf    !== undefined) wpPayload.acf    = sanitizeAcf(body.acf);

  // 2. POST (create) or PATCH-via-POST (edit). The WP REST API accepts
  //    POST for both — "POST /wp/v2/candidate/<id>" is the documented
  //    way to edit (uses _method=POST under the hood). PUT also works
  //    but PATCH is what WP REST actually expects.
  const isEdit = typeof body.id === "number" && body.id > 0;
  const wpUrl  = isEdit
    ? `${wpBaseUrl}/wp-json/wp/v2/candidate/${body.id}`
    : `${wpBaseUrl}/wp-json/wp/v2/candidate`;

  // Hard wall on WP REST. The supabase edge-runtime kills functions at
  // ~150s; a slow WP host can easily eat that and 502 the caller. Cap
  // at 45s per call so we fail loudly with a useful error before the
  // runtime nukes us.
  let wpRes: Response;
  try {
    wpRes = await fetchWithTimeout(wpUrl, {
      method: "POST",
      headers: {
        Authorization: basic,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
      body: JSON.stringify({ ...wpPayload, ...(isEdit ? {} : { status: body.status ?? "draft" }) }),
    }, 45_000);
  } catch (e) {
    return json({
      ok: false,
      error: `WP REST didn't respond in 45s. WP may be slow or unreachable. Detail: ${(e as Error).message}`,
    }, 504);
  }
  const wpJson = await wpRes.json().catch(() => null) as {
    id?: number; code?: string; message?: string;
    data?: { status?: number; params?: Record<string, unknown>; details?: Record<string, unknown> };
  } | null;
  if (!wpRes.ok || !wpJson || wpJson.code) {
    // Pass through 4xx as-is so the client sees the actual WP error
    // (rest_invalid_param, rest_forbidden, etc.) instead of an opaque
    // 502. 5xx stays 502 because that's a true upstream gateway issue.
    const passthrough = wpRes.status >= 400 && wpRes.status < 500
      ? wpRes.status
      : 502;
    // rest_invalid_param only names the parent param ("acf") in `message`;
    // the SPECIFIC offending field + reason live in data.params / data.details
    // (e.g. "acf[years…] is not of type integer"). Surface them so we don't
    // have to guess which ACF field WP rejected.
    const extra = wpJson?.data?.params
      ? ` (${Object.values(wpJson.data.params).join("; ")})`
      : wpJson?.data?.details
        ? ` (${JSON.stringify(wpJson.data.details)})`
        : "";
    return json({
      ok: false,
      error: `WP ${wpRes.status}: ${wpJson?.code ?? "unknown"} — ${wpJson?.message ?? "no body"}${extra}`,
    }, passthrough);
  }

  const newId = wpJson.id;
  if (typeof newId !== "number") {
    return json({ ok: false, error: "WP returned no id after upsert" }, 502);
  }

  // 3. Re-fetch the row so our mirror reflects WP's truth (including
  //    fields WP normalises, e.g. status defaults, slug generation).
  let refetchRes: Response;
  try {
    refetchRes = await fetchWithTimeout(`${wpBaseUrl}/wp-json/wp/v2/candidate/${newId}?_fields=id,slug,status,link,date,modified,title,acf`, {
      headers: { Authorization: basic, Accept: "application/json" },
    }, 20_000);
  } catch (e) {
    return json({ ok: false, error: `WP refetch timed out: ${(e as Error).message}` }, 504);
  }
  if (!refetchRes.ok) {
    return json({ ok: false, error: `WP refetch ${refetchRes.status}` }, 502);
  }
  const c = await refetchRes.json() as {
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
  const cvUrl = typeof a.cv_resume === "string"
    ? a.cv_resume
    : ((a.cv_resume as { url?: string } | undefined)?.url ?? null);

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
  let autoLinked: string | null = null;
  if (!body.doctor_id) {
    autoLinked = await autoLinkOne({
      id:        newId,
      full_name: cleanText(a.full_name as string | undefined),
      title:     cleanText(c.title?.rendered),
      email:     cleanText(a.email as string | undefined),
    });
  }

  return json({ ok: true, id: newId, row: mirrorRow, created: !isEdit, auto_linked: autoLinked }, 200);
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
