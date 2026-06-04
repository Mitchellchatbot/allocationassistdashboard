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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return json({ ok: false, error: "Missing WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD env" }, 500);
  }

  let body: UpsertBody;
  try { body = await req.json() as UpsertBody; }
  catch { return json({ ok: false, error: "Bad JSON body" }, 400); }

  const basic = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);

  // 1. Build the WP payload. Only include fields the caller actually
  //    set — partial PATCH is the friendly default and avoids us
  //    accidentally zeroing a field by sending undefined.
  const wpPayload: Record<string, unknown> = {};
  if (body.title  !== undefined) wpPayload.title  = body.title;
  if (body.status !== undefined) wpPayload.status = body.status;
  if (body.acf    !== undefined) wpPayload.acf    = body.acf;

  // 2. POST (create) or PATCH-via-POST (edit). The WP REST API accepts
  //    POST for both — "POST /wp/v2/candidate/<id>" is the documented
  //    way to edit (uses _method=POST under the hood). PUT also works
  //    but PATCH is what WP REST actually expects.
  const isEdit = typeof body.id === "number" && body.id > 0;
  const wpUrl  = isEdit
    ? `${wpBaseUrl}/wp-json/wp/v2/candidate/${body.id}`
    : `${wpBaseUrl}/wp-json/wp/v2/candidate`;

  const wpRes = await fetch(wpUrl, {
    method: "POST",
    headers: {
      Authorization: basic,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
    body: JSON.stringify({ ...wpPayload, ...(isEdit ? {} : { status: body.status ?? "draft" }) }),
  });
  const wpJson = await wpRes.json().catch(() => null) as { id?: number; code?: string; message?: string } | null;
  if (!wpRes.ok || !wpJson || wpJson.code) {
    return json({
      ok: false,
      error: `WP ${wpRes.status}: ${wpJson?.code ?? "unknown"} — ${wpJson?.message ?? "no body"}`,
    }, wpRes.status === 401 ? 401 : 502);
  }

  const newId = wpJson.id;
  if (typeof newId !== "number") {
    return json({ ok: false, error: "WP returned no id after upsert" }, 502);
  }

  // 3. Re-fetch the row so our mirror reflects WP's truth (including
  //    fields WP normalises, e.g. status defaults, slug generation).
  const refetchRes = await fetch(`${wpBaseUrl}/wp-json/wp/v2/candidate/${newId}?_fields=id,slug,status,link,date,modified,title,acf`, {
    headers: { Authorization: basic, Accept: "application/json" },
  });
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

  return json({ ok: true, id: newId, row: mirrorRow, created: !isEdit }, 200);
});

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
