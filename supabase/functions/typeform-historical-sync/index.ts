/**
 * Pull historical Typeform responses for a registered form.
 *
 * Typeform's webhook only delivers NEW submissions from the moment it's
 * activated. To backfill responses submitted before the webhook was
 * wired up, this function calls the Responses API:
 *   GET https://api.typeform.com/forms/<form_id>/responses?page_size=1000&before=<token>
 *
 * Authenticates with a Personal Access Token stored on forms.api_token
 * (set via the dashboard's "Sync history" dialog).
 *
 * Each response is transformed into the SAME shape the live
 * typeform-webhook function produces, then inserted into form_responses
 * with ON CONFLICT DO NOTHING — re-running this is safe and tops up
 * any responses received since the last sync.
 *
 * Request: POST { form_id: "<uuid>" }
 * Response: { ok, fetched, inserted, skipped }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TypeformAnswer {
  type: string;
  field: { id: string; ref?: string; title?: string; type: string };
  text?: string; email?: string; phone_number?: string;
  number?: number; boolean?: boolean; date?: string;
  url?: string; file_url?: string;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[]; other?: string };
}

interface TypeformResponseItem {
  response_id?: string;
  token?:       string;
  submitted_at: string;
  hidden?:      Record<string, string>;
  answers?:     TypeformAnswer[];
  /** Per-response definition snapshot (Typeform sends this on the
   *  Responses API). Contains field titles which the answers array
   *  doesn't carry — without this lookup every question column
   *  renders as the field's random UUID. */
  definition?:  { fields?: Array<{ id: string; ref?: string; title?: string }> };
}

interface TypeformResponsesPayload {
  total_items?: number;
  page_count?:  number;
  items?:       TypeformResponseItem[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { form_id?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const formId = body.form_id;
  if (!formId) return json({ ok: false, error: "form_id required" }, 400);

  // Lookup form + token
  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("*")
    .eq("id", formId)
    .maybeSingle();
  if (formErr || !form) return json({ ok: false, error: "Form not found" }, 404);
  if (form.provider !== "typeform") {
    return json({ ok: false, error: "Historical sync only supported for Typeform forms" }, 400);
  }
  if (!form.api_token) {
    return json({ ok: false, error: "Set a Typeform Personal Access Token on this form first" }, 400);
  }
  if (!form.provider_form_id) {
    return json({ ok: false, error: "Form has no provider_form_id" }, 400);
  }

  // ── Fetch form definition once for field titles ────────────────────
  // The Responses API does NOT include definition per-item. To resolve
  // question titles from field IDs we have to call GET /forms/<id>
  // separately, build a map, then apply it to every response below.
  // Without this, every column header is the field's random UUID.
  const fieldTitles = new Map<string, string>();
  try {
    const defRes = await fetch(`https://api.typeform.com/forms/${form.provider_form_id}`, {
      headers: { Authorization: `Bearer ${form.api_token}` },
    });
    if (defRes.ok) {
      // Walk nested groups recursively. Typeform's Group field type
      // (used for "First name" + "Last name" + similar split inputs)
      // has its own .properties.fields[] array with the real
      // questions. The previous flat-only walk missed all of those,
      // so their column headers rendered as raw UUIDs.
      type TFField = { id?: string; ref?: string; title?: string; type?: string; properties?: { fields?: TFField[] } };
      const def = await defRes.json() as { fields?: TFField[] };
      function walk(fields: TFField[] | undefined) {
        if (!fields) return;
        for (const f of fields) {
          if (f.id && f.title?.trim()) fieldTitles.set(f.id, cleanQuestionTitle(f.title));
          // Group-type fields nest the real questions under .properties.fields
          if (f.properties?.fields) walk(f.properties.fields);
        }
      }
      walk(def.fields);
      console.log(`[typeform-historical-sync] loaded ${fieldTitles.size} field titles from form definition (recursive walk)`);
    } else {
      console.warn(`[typeform-historical-sync] couldn't fetch form definition: ${defRes.status}`);
    }
  } catch (e) {
    console.warn(`[typeform-historical-sync] form definition fetch threw:`, e);
    // Non-fatal — we'll fall back to field IDs in the absence of titles.
  }

  // ── Build the email → doctor_id map ONCE, before paging ────────────
  // zoho_cache rows 1/2 are multi-MB JSONB blobs. The previous version
  // re-loaded BOTH on every page; on a large form (18+ pages) that, plus
  // 1000 raw response payloads held per page, blew the worker's memory
  // (WORKER_RESOURCE_LIMIT) so the sync died before committing the newest
  // page and never caught up. Load once, keep only a compact email→id map
  // (a few MB of strings), and let the big blobs get collected.
  const emailToDoctorId = new Map<string, string>();
  {
    const [{ data: cache1 }, { data: cache2 }] = await Promise.all([
      supabase.from("zoho_cache").select("data").eq("id", 1).maybeSingle(),
      supabase.from("zoho_cache").select("data").eq("id", 2).maybeSingle(),
    ]);
    const leads = (cache1?.data as { leads?: Array<{ id?: string; Email?: string | null }> } | null)?.leads ?? [];
    const dob   = (cache2?.data as { doctorsOnBoard?: Array<{ id?: string; Email?: string | null }> } | null)?.doctorsOnBoard ?? [];
    for (const r of leads) {
      const e = (r.Email ?? "").trim().toLowerCase();
      if (e && r.id) emailToDoctorId.set(e, `lead:${r.id}`);
    }
    // DoB second so it overwrites any lead match for the same email
    // (further down the funnel wins).
    for (const r of dob) {
      const e = (r.Email ?? "").trim().toLowerCase();
      if (e && r.id) emailToDoctorId.set(e, `dob:${r.id}`);
    }
    console.log(`[typeform-historical-sync] built email→doctor map once: ${emailToDoctorId.size} entries`);
  }

  // Paginate Typeform's Responses API. Their `before` param uses the
  // last item's response_id (oldest in the page) to fetch the next
  // older page. We accumulate until they return a genuinely empty
  // page — do NOT use 'items.length < PAGE' as an early-exit because
  // Typeform sometimes returns smaller-than-requested pages mid-way
  // through, especially when the requested page_size is at the max.
  let fetched = 0;
  let inserted = 0;
  let skipped  = 0;
  let totalReported = 0;
  let beforeToken: string | null = null;
  // 500 (not Typeform's max 1000) keeps per-page memory — 500 full raw
  // payloads + the bulk-upsert serialisation — comfortably under the
  // worker limit. 200 pages × 500 = 100k responses of headroom.
  const PAGE = 500;
  const MAX_PAGES = 200;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ page_size: String(PAGE) });
    if (beforeToken) params.set("before", beforeToken);
    const apiUrl = `https://api.typeform.com/forms/${form.provider_form_id}/responses?${params}`;
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${form.api_token}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return json({ ok: false, error: `Typeform API ${res.status}: ${txt.slice(0, 200)}` }, res.status);
    }
    const payload = await res.json() as TypeformResponsesPayload;
    const items = payload.items ?? [];
    if (page === 0 && typeof payload.total_items === "number") {
      totalReported = payload.total_items;
    }
    console.log(`[typeform-historical-sync] page ${page}: ${items.length} items (total_items=${payload.total_items ?? "?"})`);
    if (items.length === 0) break;

    fetched += items.length;

    // ── 1. Transform all items for this page (no DB calls) ────────────
    type Row = {
      form_id:               string;
      provider_response_id:  string;
      submitted_at:          string;
      raw_payload:           Record<string, unknown>;
      answers:               Record<string, string>;
      respondent_name:       string | null;
      respondent_email:      string | null;
      doctor_id:             string | null;
    };
    const rows: Row[] = [];

    for (const item of items) {
      const flat: Record<string, string> = {};
      let respondentName  = "";
      let respondentEmail = "";
      for (const a of item.answers ?? []) {
        const title = fieldTitles.get(a.field.id) || a.field.title?.trim() || a.field.ref || a.field.id;
        const value =
          a.type === "text"          ? (a.text         ?? "") :
          a.type === "email"         ? (a.email        ?? "") :
          a.type === "phone_number"  ? (a.phone_number ?? "") :
          a.type === "number"        ? (a.number != null ? String(a.number) : "") :
          a.type === "boolean"       ? (a.boolean != null ? String(a.boolean) : "") :
          a.type === "date"          ? (a.date    ?? "") :
          a.type === "url"           ? (a.url     ?? "") :
          a.type === "file_url"      ? (a.file_url ?? "") :
          a.type === "choice"        ? (a.choice?.label ?? a.choice?.other ?? "") :
          a.type === "choices"       ? ([...(a.choices?.labels ?? []), a.choices?.other].filter(Boolean).join(", ")) :
                                       JSON.stringify(a);
        if (value) flat[title] = value;
        const titleLc = (a.field.title ?? "").toLowerCase();
        // Email extraction: prefer the native email-typed answer, but
        // also catch text-typed fields that hold an email (this form
        // configures the email question as short_text so the team can
        // validate format with a custom regex). Falls through to any
        // text whose value looks like an email + title hints at it.
        if (!respondentEmail) {
          if (a.type === "email" && a.email) respondentEmail = a.email;
          else if (a.type === "text" && a.text && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a.text.trim())) {
            respondentEmail = a.text.trim();
          }
        }
        if (!respondentName && a.type === "text" && a.text && (titleLc.includes("name") || titleLc.includes("full name"))) {
          respondentName = a.text;
        }
      }

      const responseId = item.token ?? item.response_id;
      if (!responseId) { skipped++; continue; }

      rows.push({
        form_id:               form.id,
        provider_response_id:  responseId,
        submitted_at:          item.submitted_at,
        raw_payload:           item as unknown as Record<string, unknown>,
        answers:               flat,
        respondent_name:       respondentName || null,
        respondent_email:      respondentEmail || null,
        doctor_id:             null,   // filled in via batched lookup below
      });
    }

    // ── 2. Link responses to doctors via the pre-built email map ─────
    // (Map is built once above the loop — see the note there for why.)
    for (const row of rows) {
      if (row.respondent_email) {
        const hit = emailToDoctorId.get(row.respondent_email.toLowerCase());
        if (hit) row.doctor_id = hit;
      }
    }

    // ── 3. Bulk upsert the whole page in one round-trip ───────────────
    if (rows.length > 0) {
      const { error: bulkErr } = await supabase
        .from("form_responses")
        .upsert(rows, { onConflict: "form_id,provider_response_id" });
      if (bulkErr) {
        console.error("[typeform-historical-sync] bulk upsert failed:", bulkErr);
        return json({ ok: false, error: `Bulk upsert: ${bulkErr.message}`, fetched, inserted, skipped, totalReported }, 500);
      }
      inserted += rows.length;
    }

    // ── 4. Continue paginating until items are EMPTY (not until short
    //      page). Typeform occasionally returns short pages mid-stream;
    //      we keep going regardless. Stop only when the API gives us
    //      back zero rows.
    const oldest = items[items.length - 1];
    const oldestToken = oldest.token ?? oldest.response_id;
    if (!oldestToken) break;
    beforeToken = oldestToken;
  }

  return json({ ok: true, fetched, inserted, skipped, totalReported }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Strip Typeform's {{field:<uuid>}} / {{hidden:foo}} placeholder tokens
 *  from a question title so column headers are readable. Mirrors the
 *  helper in typeform-webhook so live + historical produce identical
 *  question keys. */
function cleanQuestionTitle(raw: string): string {
  return raw
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[-–—\s]+([.,!?;:])/g, "$1")
    .trim();
}
