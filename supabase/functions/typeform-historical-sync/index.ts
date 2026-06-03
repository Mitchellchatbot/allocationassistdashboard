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

  // Paginate Typeform's Responses API. Their `before` param uses the
  // last item's response_id (oldest in the page) to fetch the next
  // older page. We accumulate until they return an empty page.
  let fetched = 0;
  let inserted = 0;
  let skipped  = 0;
  let beforeToken: string | null = null;
  const PAGE = 1000;

  for (let page = 0; page < 50; page++) {  // sanity stop: 50 pages × 1000 = 50k responses
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
    if (items.length === 0) break;

    fetched += items.length;

    // Insert each item, mirroring typeform-webhook's flattening logic.
    for (const item of items) {
      const flat: Record<string, string> = {};
      let respondentName  = "";
      let respondentEmail = "";
      for (const a of item.answers ?? []) {
        const title = a.field.title?.trim() || a.field.ref || a.field.id;
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

      let doctorId: string | null = null;
      if (respondentEmail) {
        const { data: dobRow } = await supabase
          .from("zoho_cache_dob").select("zoho_id")
          .ilike("email", respondentEmail).maybeSingle();
        if (dobRow?.zoho_id) doctorId = `dob:${dobRow.zoho_id}`;
        if (!doctorId) {
          const { data: leadRow } = await supabase
            .from("zoho_cache_leads").select("zoho_id")
            .ilike("email", respondentEmail).maybeSingle();
          if (leadRow?.zoho_id) doctorId = `lead:${leadRow.zoho_id}`;
        }
      }

      const responseId = item.token ?? item.response_id;
      if (!responseId) { skipped++; continue; }

      const { error: insErr, count } = await supabase
        .from("form_responses")
        .upsert({
          form_id:               form.id,
          provider_response_id:  responseId,
          submitted_at:          item.submitted_at,
          raw_payload:           item as unknown as Record<string, unknown>,
          answers:               flat,
          respondent_name:       respondentName || null,
          respondent_email:      respondentEmail || null,
          doctor_id:             doctorId,
        }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: true, count: "exact" });

      if (insErr) {
        console.warn("[typeform-historical-sync] insert failed for", responseId, insErr.message);
        skipped++;
      } else if ((count ?? 0) > 0) {
        inserted++;
      } else {
        skipped++;  // already existed
      }
    }

    // Set beforeToken to the OLDEST item's token (last in array) so the
    // next iteration fetches even older responses.
    const oldest = items[items.length - 1];
    const oldestToken = oldest.token ?? oldest.response_id;
    if (!oldestToken || items.length < PAGE) break;
    beforeToken = oldestToken;
  }

  return json({ ok: true, fetched, inserted, skipped }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
