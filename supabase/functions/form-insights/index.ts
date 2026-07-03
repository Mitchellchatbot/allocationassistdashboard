/**
 * form-insights — drop-off / completion analytics for a configured form.
 *
 *  - Typeform: calls the Insights Summary API (needs the stored PAT with
 *    forms:read/insights access) → per-QUESTION views + dropoffs + the form
 *    completion rate. This is the real "where do people drop off" funnel.
 *  - Jotform: its public API has NO per-field funnel — only the submission
 *    count from GET /form/{id}. We return that (supported:false) so the UI can
 *    show an overall tile without pretending it's a funnel.
 *
 * Reads the per-form api_token from the `forms` table with the service role, so
 * the token never touches the client. Pass ?form_id=<uuid> for one form; omit it
 * to get every form (used for a quick probe).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

interface FormRow { id: string; name: string; provider: string; provider_form_id: string | null; api_token: string | null; }

async function insightsFor(form: FormRow, debug: boolean) {
  const base = { formId: form.id, name: form.name, provider: form.provider };
  if (!form.api_token) return { ...base, supported: false, error: "No API token stored for this form." };
  if (!form.provider_form_id) return { ...base, supported: false, error: "No provider form id." };

  if (form.provider === "typeform") {
    const res = await fetch(`https://api.typeform.com/insights/${form.provider_form_id}/summary`, {
      headers: { Authorization: `Bearer ${form.api_token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ...base, supported: true, status: res.status,
        error: res.status === 401 || res.status === 403
          ? `Typeform token can't read Insights (HTTP ${res.status}). Regenerate the PAT with forms:read scope.`
          : `Typeform API ${res.status}: ${text.slice(0, 180)}` };
    }
    let data: Record<string, unknown> = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    const summary = ((data.form as Record<string, unknown>)?.summary ?? {}) as Record<string, number>;
    const rawFields = (Array.isArray(data.fields) ? data.fields : []) as Array<Record<string, unknown>>;
    const fields = rawFields.map(f => ({
      ref:      String(f.ref ?? f.id ?? ""),
      title:    String(f.title ?? ""),
      type:     String(f.type ?? ""),
      views:    Number(f.views ?? 0),
      dropoffs: Number(f.dropoffs ?? 0),
    }));
    return {
      ...base, supported: true,
      // Typeform returns completion_rate as a whole percent already (e.g. 65),
      // NOT a 0–1 fraction — don't rescale it.
      completionRate: summary.completion_rate != null ? Math.round(Number(summary.completion_rate)) : null,
      visits:       Number(summary.total_visits ?? 0) || null,
      uniqueVisits: Number(summary.unique_visits ?? 0) || null,
      responses:    Number(summary.responses_count ?? summary.submitted ?? 0) || null,
      avgTimeSec:   Number(summary.average_time ?? 0) || null,
      // Per-question views + dropoffs. Not a strict monotonic funnel (Typeform
      // branches, and `views` counts revisits), so the UI reads drop-off as
      // dropoffs/views per question — same as Typeform's own Insights screen.
      fields,
      ...(debug ? { raw: data } : {}),
    };
  }

  if (form.provider === "jotform") {
    const res = await fetch(`https://api.jotform.com/form/${form.provider_form_id}?apiKey=${encodeURIComponent(form.api_token)}`);
    const text = await res.text();
    if (!res.ok) return { ...base, supported: false, status: res.status, error: `Jotform API ${res.status}` };
    let data: Record<string, unknown> = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    const content = (data.content ?? {}) as Record<string, unknown>;
    return {
      ...base, supported: false,
      submitted: Number(content.count ?? 0) || 0,
      note: "Jotform's API doesn't expose per-question drop-off — showing submission count only.",
      ...(debug ? { raw: content } : {}),
    };
  }

  return { ...base, supported: false, error: `Insights not available for provider '${form.provider}'.` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    let formId = url.searchParams.get("form_id");
    let debug = url.searchParams.get("debug") === "1";
    if (!formId && req.method === "POST") {
      const body = await req.json().catch(() => ({})) as { form_id?: string; debug?: boolean };
      if (body?.form_id) formId = body.form_id;
      if (body?.debug) debug = true;
    }

    let query = supabase.from("forms").select("id, name, provider, provider_form_id, api_token");
    if (formId) query = query.eq("id", formId);
    const { data: forms, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!forms || forms.length === 0) return json({ ok: false, error: "form not found" }, 404);

    const results = [];
    for (const f of forms as FormRow[]) {
      try { results.push(await insightsFor(f, debug)); }
      catch (e) { results.push({ formId: f.id, name: f.name, provider: f.provider, supported: false, error: e instanceof Error ? e.message : String(e) }); }
    }

    // Single-form call → return the object directly; probe (no form_id) → array.
    if (formId) return json({ ok: true, ...results[0] });
    return json({ ok: true, results });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
