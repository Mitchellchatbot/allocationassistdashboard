/**
 * Pull the "candidate" CPT from the AA WordPress site into the
 * wordpress_candidates table.
 *
 * Endpoint: POST /functions/v1/wordpress-candidates-sync
 * Auth: bearer service-role key (Supabase invoke from the UI passes this).
 *
 * Reads from env (Supabase secrets):
 *   - WP_BASE_URL       e.g. https://www.allocationassist.com
 *   - WP_USERNAME       WP user email/login
 *   - WP_APP_PASSWORD   24-char Application Password (no spaces)
 *
 * Walks /wp-json/wp/v2/candidate?per_page=100&page=N until empty,
 * flattens the ACF blob into the relevant columns, upserts on id.
 *
 * Returns { ok, fetched, inserted, updated, pages, totalReported, durationMs }.
 *
 * Idempotent — re-running tops up with new candidates + refreshes
 * existing rows. Status=any (publish / draft / private) included.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notify } from "../_shared/notify.ts";

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

/** WP REST returns ACF as an object whose values may be scalars,
 *  arrays, or nested objects depending on the field type. We extract
 *  the ones HI cares about; everything else stays in raw_acf. */
interface CandidateAcf {
  full_name?:       string;
  job_title?:       string;
  phone_number?:    string;
  email?:           string;
  date_of_birth?:   string;
  nationality?:     string;
  specialty?:       string;
  subspecialty?:    string;
  specific_areas_of_interests_within_the_specialization?: string;
  years_of_experience_post_specialization?: number | string;
  license_type?:    Array<string | { name?: string; slug?: string }>;
  dha__haad__moh_license?: string;
  family_status?:   string;
  have_children_or_any_dependent?: string | boolean;
  country_of_training?: string;
  current_location?: string;
  specialist__consultant?: string;
  languages?:       string;
  english_level?:   string;
  current_salary?:  string;
  expected_salary?: string;
  notice_period?:   string;
  targeted_locations?: Array<string | { name?: string }>;
  cv_resume?:       string | { url?: string };

  // Profile picture is stored as a WP attachment ID (or, if ACF return
  // format is "Image Object", a {id, url, sizes} object). Either way
  // we resolve to source_url via the /wp/v2/media endpoint.
  profile_picture?: number | string | { id?: number; url?: string; source_url?: string };

  // Single education slot — the WP CPT doesn't use a real ACF repeater.
  academy1?:        string;
  title1?:          string;
  start_date1?:     string;
  end_date1?:       string;
  present1?:        string | boolean;
  description1?:    string;

  // Single experience slot.
  company2?:        string;
  title2?:          string;
  start_date_2?:    string;
  end_date2?:       string;
  present2?:        string | boolean;
  description2?:    string;

  [k: string]: unknown;
}

interface WpCandidate {
  id:        number;
  date?:     string;
  modified?: string;
  slug:      string;
  status?:   string;
  link:      string;
  title?:    { rendered?: string };
  acf?:      CandidateAcf;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!wpBaseUrl || !wpUsername || !wpAppPassword) {
    return json({ ok: false, error: "Missing WP_BASE_URL / WP_USERNAME / WP_APP_PASSWORD env" }, 500);
  }

  const started = Date.now();
  const basic   = "Basic " + btoa(`${wpUsername}:${wpAppPassword}`);

  let fetched     = 0;
  let upserted    = 0;
  let totalPages  = 0;
  let totalCands  = 0;
  // Every WP candidate id seen this run — used to reconcile deletions below.
  const fetchedIds = new Set<number>();

  const PAGE_SIZE = 100;
  // Include every status admins can see (publish / private / draft).
  // status=any requires authenticated request, which we have.
  const baseUrl   = `${wpBaseUrl}/wp-json/wp/v2/candidate?per_page=${PAGE_SIZE}&status=any&_fields=id,slug,status,link,date,modified,title,acf`;

  for (let page = 1; page <= 200; page++) {
    const res = await fetch(`${baseUrl}&page=${page}`, {
      headers: { Authorization: basic, Accept: "application/json" },
    });
    // WP returns 400 with code='rest_post_invalid_page_number' when you
    // go past the last page. Treat that as a clean end-of-stream.
    if (res.status === 400) {
      const body = await res.text();
      if (body.includes("rest_post_invalid_page_number")) break;
      return json({ ok: false, error: `WP API ${res.status}: ${body.slice(0, 300)}` }, 502);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return json({ ok: false, error: `WP API ${res.status}: ${body.slice(0, 300)}` }, res.status);
    }
    if (page === 1) {
      totalPages = parseInt(res.headers.get("x-wp-totalpages") ?? "0", 10);
      totalCands = parseInt(res.headers.get("x-wp-total")      ?? "0", 10);
    }
    const items = await res.json() as WpCandidate[];
    if (!Array.isArray(items) || items.length === 0) break;
    fetched += items.length;
    for (const c of items) if (typeof c.id === "number") fetchedIds.add(c.id);

    // Collect profile_picture attachment IDs on this page so we can
    // batch-resolve them with one /wp/v2/media call instead of N.
    const mediaIds = new Set<number>();
    for (const c of items) {
      const pp = c.acf?.profile_picture;
      if (typeof pp === "number") mediaIds.add(pp);
      else if (typeof pp === "string" && /^\d+$/.test(pp)) mediaIds.add(parseInt(pp, 10));
    }
    const mediaMap = await resolveMedia([...mediaIds], basic);

    // Flatten + bulk upsert per page.
    const rows = items.map(c => {
      const a = c.acf ?? {};
      const years = typeof a.years_of_experience_post_specialization === "number"
        ? a.years_of_experience_post_specialization
        : (typeof a.years_of_experience_post_specialization === "string"
            ? parseInt(a.years_of_experience_post_specialization, 10) || null
            : null);
      const hasDeps = typeof a.have_children_or_any_dependent === "boolean"
        ? a.have_children_or_any_dependent
        : (a.have_children_or_any_dependent === "1" || /yes|true/i.test(String(a.have_children_or_any_dependent ?? "")));
      const licenseTypes = Array.isArray(a.license_type)
        ? a.license_type.map(l => typeof l === "string" ? l : (l.name || l.slug || "")).filter(Boolean)
        : [];
      const targeted = Array.isArray(a.targeted_locations)
        ? a.targeted_locations.map(l => typeof l === "string" ? l : (l.name || "")).filter(Boolean)
        : [];
      const cvUrl = readCvUrl(a);

      // Resolve profile picture — accept either a media ID, a string ID,
      // or an ACF image object that already carries source_url/url.
      let photoUrl: string | null = null;
      const pp = a.profile_picture;
      if (typeof pp === "number")                                  photoUrl = mediaMap.get(pp) ?? null;
      else if (typeof pp === "string" && /^\d+$/.test(pp))         photoUrl = mediaMap.get(parseInt(pp, 10)) ?? null;
      else if (pp && typeof pp === "object")                       photoUrl = (pp.source_url || pp.url) ?? null;

      const eduPresent = typeof a.present1 === "boolean"
        ? a.present1
        : /yes|true|1/i.test(String(a.present1 ?? ""));
      const expPresent = typeof a.present2 === "boolean"
        ? a.present2
        : /yes|true|1/i.test(String(a.present2 ?? ""));

      return {
        id:                 c.id,
        wp_slug:            c.slug,
        wp_link:            c.link,
        status:             c.status ?? null,
        title:              cleanText(c.title?.rendered),
        full_name:          cleanText(a.full_name),
        job_title:          cleanText(a.job_title),
        email:              cleanText(a.email),
        phone:              cleanText(a.phone_number),
        date_of_birth:      cleanText(a.date_of_birth),
        nationality:        cleanText(a.nationality),
        specialty:          cleanText(a.specialty),
        subspecialty:       cleanText(a.subspecialty),
        area_of_interest:   cleanText(a.specific_areas_of_interests_within_the_specialization),
        years_experience:   years,
        license_status:     cleanText(a.dha__haad__moh_license),
        license_types:      licenseTypes.map(l => decodeEntities(l)),
        family_status:      cleanText(a.family_status),
        has_dependents:     hasDeps,
        country_of_training: cleanText(a.country_of_training),
        current_location:   cleanText(a.current_location),
        rank:               cleanText(a.specialist__consultant),
        languages:          cleanText(a.languages),
        english_level:      cleanText(a.english_level),
        current_salary:     cleanText(a.current_salary),
        expected_salary:    cleanText(a.expected_salary),
        notice_period:      cleanText(a.notice_period),
        targeted_locations: targeted.map(t => decodeEntities(t)),
        cv_url:             cvUrl,
        photo_url:          photoUrl,

        education_title:       cleanText(a.title1 as string | undefined),
        education_academy:     cleanText(a.academy1 as string | undefined),
        education_start:       a.start_date1 ?? null,
        education_end:         a.end_date1   ?? null,
        education_present:     eduPresent,
        education_description: cleanText(a.description1 as string | undefined),

        experience_title:       cleanText(a.title2 as string | undefined),
        experience_company:     cleanText(a.company2 as string | undefined),
        experience_start:       a.start_date_2 ?? null,
        experience_end:         a.end_date2    ?? null,
        experience_present:     expPresent,
        experience_description: cleanText(a.description2 as string | undefined),

        raw_acf:            a as Record<string, unknown>,
        wp_date:            c.date     ?? null,
        wp_modified:        c.modified ?? null,
        last_synced_at:     new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      };
    });

    const { error: upErr } = await supabase
      .from("wordpress_candidates")
      .upsert(rows, { onConflict: "id" });
    if (upErr) {
      console.error("[wordpress-candidates-sync] page", page, "upsert failed:", upErr);
      return json({ ok: false, error: `Upsert page ${page}: ${upErr.message}`, fetched }, 500);
    }
    upserted += rows.length;

    console.log(`[wordpress-candidates-sync] page ${page}/${totalPages || "?"}: ${items.length} items, ${upserted} upserted so far`);
    if (totalPages && page >= totalPages) break;
  }

  // Reconcile deletions: any mirror row whose WP id wasn't returned in this
  // FULL sync no longer exists on WordPress (deleted, or trashed) — drop it so
  // the portal stops showing ghosts. Guarded on a complete fetch (we got at
  // least everything x-wp-total reported) so a transient empty/partial
  // response can never wipe the mirror.
  let removed = 0;
  if (fetched > 0 && (totalCands === 0 || fetched >= totalCands)) {
    const mirrorIds: number[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 100_000; from += PAGE) {
      const { data, error } = await supabase
        .from("wordpress_candidates").select("id").range(from, from + PAGE - 1);
      if (error) { console.warn("[wordpress-candidates-sync] reconcile read failed:", error.message); break; }
      const batch = (data ?? []) as Array<{ id: number }>;
      for (const r of batch) mirrorIds.push(r.id);
      if (batch.length < PAGE) break;
    }
    const stale = mirrorIds.filter(id => !fetchedIds.has(id));
    for (let i = 0; i < stale.length; i += 200) {
      const chunk = stale.slice(i, i + 200);
      const { error } = await supabase.from("wordpress_candidates").delete().in("id", chunk);
      if (error) { console.warn("[wordpress-candidates-sync] reconcile delete failed:", error.message); break; }
      removed += chunk.length;
    }
    if (removed > 0) console.log(`[wordpress-candidates-sync] reconciled ${removed} candidate(s) deleted on WordPress`);
  }

  // Auto-link freshly synced rows to existing AA doctor_ids by
  // email + normalised name. Runs inside the sync so the user never
  // has to think about "step 2" — a new candidate that maps to a
  // Zoho record gets stamped on the way in.
  const linkResult = await autoLinkCandidates();

  // Info-level (bell only, no Slack) summary — and only when the sync
  // actually linked new candidates to Zoho records, since those are the
  // ones that feed vacancy matching. Routine no-op re-syncs stay silent so
  // the bell doesn't fill up with "synced 0 new" noise.
  if (linkResult.updated > 0) {
    await notify({
      kind:      "wp_sync_summary",
      title:     `WordPress sync — ${linkResult.updated} candidate${linkResult.updated === 1 ? "" : "s"} linked`,
      body:      `${upserted} candidate record${upserted === 1 ? "" : "s"} refreshed from WordPress; ${linkResult.updated} newly linked to Zoho (${linkResult.matched_by_email} by email, ${linkResult.matched_by_name} by name).`,
      link_path: `/wp-candidates`,
    }).catch(e => console.error("[wordpress-candidates-sync] notify failed:", e));
  }

  return json({
    ok:            true,
    fetched,
    inserted:      upserted,       // can't cheaply distinguish new vs updated; reports total touched
    removed,                       // mirror rows dropped because they're gone from WP
    pages:         totalPages,
    totalReported: totalCands,
    auto_linked:   linkResult.updated,
    auto_link_email: linkResult.matched_by_email,
    auto_link_name:  linkResult.matched_by_name,
    durationMs:    Date.now() - started,
  }, 200);
});

// ─── Auto-linker — same logic as the wordpress-candidates-link function,
//      inlined here so every sync ends with a fresh pass. Keeping it in
//      one place would be nicer, but Supabase edge functions can't import
//      each other yet without a shared package. ──────────────────────────

interface ZohoLeadLike {
  id?: string;
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
}

async function autoLinkCandidates(): Promise<{ updated: number; matched_by_email: number; matched_by_name: number }> {
  try {
    const { data: cacheRows, error: cacheErr } = await supabase
      .from("zoho_cache")
      .select("id, data")
      .in("id", [1, 2]);
    if (cacheErr) { console.warn("[sync auto-link] zoho_cache:", cacheErr.message); return zeroes(); }

    const merged: Record<string, unknown> = {};
    for (const r of (cacheRows ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
      Object.assign(merged, r.data ?? {});
    }
    const leads        = (merged.leads        as ZohoLeadLike[]) ?? [];
    const doctorsOnBoard = (merged.doctorsOnBoard as ZohoLeadLike[])
                        ?? (merged.contacts as ZohoLeadLike[])
                        ?? (merged.doctors_on_board as ZohoLeadLike[])
                        ?? [];

    const emailIdx = new Map<string, string>();
    const nameIdx  = new Map<string, string[]>();
    const indexOne = (r: ZohoLeadLike, prefix: "lead" | "dob") => {
      if (!r.id) return;
      const did = `${prefix}:${r.id}`;
      const e = normaliseEmail(r.Email);
      if (e) emailIdx.set(e, did);
      const n = normaliseName(r.Full_Name ?? `${r.First_Name ?? ""} ${r.Last_Name ?? ""}`);
      if (n) {
        const arr = nameIdx.get(n);
        if (arr) { if (!arr.includes(did)) arr.push(did); }
        else nameIdx.set(n, [did]);
      }
    };
    for (const r of leads)          indexOne(r, "lead");
    for (const r of doctorsOnBoard) indexOne(r, "dob");

    const updates: Array<{ id: number; doctor_id: string }> = [];
    let matchedByEmail = 0, matchedByName = 0;
    const PAGE = 1000;
    for (let from = 0; from < 50_000; from += PAGE) {
      const { data, error } = await supabase
        .from("wordpress_candidates")
        .select("id, full_name, title, email")
        .is("doctor_id", null)
        .range(from, from + PAGE - 1);
      if (error) { console.warn("[sync auto-link] candidates fetch:", error.message); break; }
      const batch = (data ?? []) as Array<{ id: number; full_name: string | null; title: string | null; email: string | null }>;
      if (batch.length === 0) break;
      for (const c of batch) {
        const e = normaliseEmail(c.email);
        const n = normaliseName(c.full_name ?? c.title ?? "");
        if (e && emailIdx.has(e)) { updates.push({ id: c.id, doctor_id: emailIdx.get(e)! }); matchedByEmail++; continue; }
        if (n) {
          const hits = nameIdx.get(n);
          if (hits && hits.length === 1) { updates.push({ id: c.id, doctor_id: hits[0] }); matchedByName++; }
        }
      }
      if (batch.length < PAGE) break;
    }
    if (updates.length === 0) return { updated: 0, matched_by_email: 0, matched_by_name: 0 };

    const { data: affected, error: rpcErr } = await supabase.rpc("wordpress_candidates_bulk_link", {
      updates: updates as unknown as Record<string, unknown>[],
    });
    if (rpcErr) { console.warn("[sync auto-link] rpc:", rpcErr.message); return zeroes(); }
    const updated = typeof affected === "number" ? affected : 0;
    console.log(`[wordpress-candidates-sync] auto-linked ${updated} rows (${matchedByEmail} email + ${matchedByName} name)`);
    return { updated, matched_by_email: matchedByEmail, matched_by_name: matchedByName };
  } catch (e) {
    console.warn("[sync auto-link] unexpected error:", e);
    return zeroes();
  }
}

function zeroes() { return { updated: 0, matched_by_email: 0, matched_by_name: 0 }; }

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

/** WP REST returns title.rendered with HTML entities ("&#8211;", "&amp;",
 *  &nbsp;, …) already encoded. We render those fields as plain text in
 *  the UI, so we decode here once on the way in. Covers the entities
 *  WP actually emits — &#8211; (en-dash), &#8212; (em-dash),
 *  &#8216;/&#8217; (curly quotes), &amp;, &#038;, &quot;, &#39;, &nbsp;,
 *  and any numeric or hex numeric entity. */
function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,         (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(s: string | null | undefined): string | null {
  if (s == null) return null;
  const decoded = decodeEntities(String(s)).trim();
  return decoded === "" ? null : decoded;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Read a CV URL out of an acf object regardless of the real field slug.
 *  The "CV/ Resume" field's slug isn't fixed (cv_resume / cv__resume / …),
 *  so check the known variants, then any /resume|curriculum/i key. Accepts a
 *  string URL or an ACF File object ({url}). */
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

/** Batch-resolve attachment IDs → source_url via /wp/v2/media?include[]=…
 *  WP caps include[] at 100 per request, so chunk if needed. Returns a
 *  Map keyed by attachment id; missing IDs are silently absent. */
async function resolveMedia(ids: number[], basic: string): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const qs = slice.map(id => `include[]=${id}`).join("&");
    const url = `${wpBaseUrl}/wp-json/wp/v2/media?per_page=100&_fields=id,source_url&${qs}`;
    try {
      const res = await fetch(url, { headers: { Authorization: basic, Accept: "application/json" } });
      if (!res.ok) {
        console.warn("[wordpress-candidates-sync] media batch failed", res.status, await res.text().catch(() => ""));
        continue;
      }
      const arr = await res.json() as Array<{ id: number; source_url: string }>;
      for (const m of arr) if (m?.id && m.source_url) out.set(m.id, m.source_url);
    } catch (err) {
      console.warn("[wordpress-candidates-sync] media batch error", err);
    }
  }
  return out;
}
