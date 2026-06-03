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
  const PAGE = 1000;
  const MAX_PAGES = 200;  // sanity: 200 × 1000 = 200k responses

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
    const emails: string[] = [];

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
        if (!respondentEmail && a.type === "email" && a.email) respondentEmail = a.email;
        const titleLc = (a.field.title ?? "").toLowerCase();
        if (!respondentName && a.type === "text" && a.text && (titleLc.includes("name") || titleLc.includes("full name"))) {
          respondentName = a.text;
        }
      }

      const responseId = item.token ?? item.response_id;
      if (!responseId) { skipped++; continue; }
      if (respondentEmail) emails.push(respondentEmail.toLowerCase());

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

    // ── 2. Batch Zoho lookups (one query per cache, not per row) ──────
    // ilike doesn't combine with .in() so we fall back to lowercase
    // exact-match against the (already lowercased) emails. zoho_cache
    // tables store emails normalized so this matches the prior per-row
    // .ilike behaviour for the common case.
    const emailToDoctorId = new Map<string, string>();
    if (emails.length > 0) {
      const uniqueEmails = Array.from(new Set(emails));
      const [{ data: dobRows }, { data: leadRows }] = await Promise.all([
        supabase.from("zoho_cache_dob")  .select("zoho_id, email").in("email", uniqueEmails),
        supabase.from("zoho_cache_leads").select("zoho_id, email").in("email", uniqueEmails),
      ]);
      // DoB wins over Lead (further down the pipeline) — same precedence
      // as the live webhook.
      for (const r of leadRows ?? []) {
        if (r.email && r.zoho_id) emailToDoctorId.set(String(r.email).toLowerCase(), `lead:${r.zoho_id}`);
      }
      for (const r of dobRows ?? []) {
        if (r.email && r.zoho_id) emailToDoctorId.set(String(r.email).toLowerCase(), `dob:${r.zoho_id}`);
      }
    }
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
