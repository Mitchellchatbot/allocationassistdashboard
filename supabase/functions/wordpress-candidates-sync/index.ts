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
      const cvUrl = typeof a.cv_resume === "string"
        ? a.cv_resume
        : (a.cv_resume?.url ?? null);

      return {
        id:                 c.id,
        wp_slug:            c.slug,
        wp_link:            c.link,
        status:             c.status ?? null,
        title:              c.title?.rendered ?? null,
        full_name:          a.full_name ?? null,
        job_title:          a.job_title ?? null,
        email:              a.email ?? null,
        phone:              a.phone_number ?? null,
        date_of_birth:      a.date_of_birth ?? null,
        nationality:        a.nationality ?? null,
        specialty:          a.specialty ?? null,
        subspecialty:       a.subspecialty ?? null,
        area_of_interest:   a.specific_areas_of_interests_within_the_specialization ?? null,
        years_experience:   years,
        license_status:     a.dha__haad__moh_license ?? null,
        license_types:      licenseTypes,
        family_status:      a.family_status ?? null,
        has_dependents:     hasDeps,
        country_of_training: a.country_of_training ?? null,
        current_location:   a.current_location ?? null,
        rank:               a.specialist__consultant ?? null,
        languages:          a.languages ?? null,
        english_level:      a.english_level ?? null,
        current_salary:     a.current_salary ?? null,
        expected_salary:    a.expected_salary ?? null,
        notice_period:      a.notice_period ?? null,
        targeted_locations: targeted,
        cv_url:             cvUrl,
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

  return json({
    ok:            true,
    fetched,
    inserted:      upserted,       // can't cheaply distinguish new vs updated; reports total touched
    pages:         totalPages,
    totalReported: totalCands,
    durationMs:    Date.now() - started,
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
