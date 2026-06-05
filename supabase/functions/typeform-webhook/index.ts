/**
 * Typeform webhook receiver.
 *
 * Wire each Typeform's "Webhooks" settings to:
 *   https://elfkqmbwuspjaoorqggq.supabase.co/functions/v1/typeform-webhook
 *
 * Typeform POSTs a JSON payload of the shape:
 *   {
 *     event_id, event_type: "form_response",
 *     form_response: {
 *       form_id, token, submitted_at, hidden, definition: {...},
 *       answers: [{ type, field: {id, ref, title, type}, ... value ... }]
 *     }
 *   }
 *
 * We:
 *   1. Look up the `forms` row by provider_form_id (matches form_response.form_id)
 *   2. Verify the optional HMAC signature (typeform-signature header) if the
 *      form has a webhook_secret configured
 *   3. Flatten the answers array into { question_title: value } and try to
 *      pull a respondent name/email
 *   4. Try to link to an existing AA lead / DoB by email (case-insensitive)
 *   5. Insert into form_responses (idempotent via unique (form_id, provider_response_id))
 *
 * Returns 200 on success — Typeform retries on non-2xx for ~24h.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";
import { notify } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, typeform-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TypeformAnswer {
  type:  string;                          // 'text' | 'email' | 'choice' | 'number' | 'date' | 'boolean' | etc.
  field: { id: string; ref?: string; title?: string; type: string };
  text?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  url?: string;
  file_url?: string;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[]; other?: string };
}

interface TypeformPayload {
  event_id?:   string;
  event_type?: string;
  form_response?: {
    form_id:       string;
    token:         string;
    submitted_at?: string;
    landed_at?:    string;
    definition?:   { id?: string; title?: string; fields?: Array<{ id: string; ref?: string; title?: string }> };
    answers?:      TypeformAnswer[];
    hidden?:       Record<string, string>;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  // Read raw body — needed for HMAC verification BEFORE parsing.
  const rawBody = await req.text();
  let payload: TypeformPayload;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }

  const fr = payload.form_response;
  if (!fr || !fr.form_id || !fr.token) {
    return json({ ok: false, error: "Missing form_response.form_id / token" }, 400);
  }

  // ── Look up form row ────────────────────────────────────────────────
  const { data: form, error: formErr } = await supabase
    .from("forms")
    .select("*")
    .eq("provider", "typeform")
    .eq("provider_form_id", fr.form_id)
    .maybeSingle();
  if (formErr) {
    console.error("[typeform-webhook] forms lookup failed:", formErr);
    return json({ ok: false, error: "DB error" }, 500);
  }
  if (!form) {
    // Form not registered in our system. Acknowledge with 200 so Typeform
    // doesn't retry forever, but log so we can wire it up.
    console.warn("[typeform-webhook] received submission for unregistered form_id:", fr.form_id);
    return json({ ok: true, ignored: true, reason: "form not registered in dashboard" }, 200);
  }

  // ── Optional HMAC verification ───────────────────────────────────────
  if (form.webhook_secret) {
    const sig = req.headers.get("typeform-signature") ?? "";
    // Typeform format: "sha256=<base64-hmac>"
    const m = sig.match(/^sha256=(.+)$/);
    if (!m) {
      console.warn("[typeform-webhook] missing or malformed typeform-signature header");
      return json({ ok: false, error: "Missing signature" }, 401);
    }
    const expected = createHmac("sha256", form.webhook_secret).update(rawBody).digest("base64");
    if (expected !== m[1]) {
      console.warn("[typeform-webhook] HMAC mismatch — rejecting");
      return json({ ok: false, error: "Bad signature" }, 401);
    }
  }

  // ── Flatten answers ─────────────────────────────────────────────────
  // Build { questionTitle: stringValue } so the dashboard can render
  // responses without needing the Typeform shape.
  //
  // Question titles live in form_response.definition.fields[].title.
  // The answers[].field object only has id + type (no title), so we
  // need to look up each answer's title via the definition. Without
  // this lookup, every column header rendered as the field's random
  // UUID, which is what the user reported.
  // Recursive walk — Typeform Group fields nest the real questions
  // under .properties.fields[]. Without recursion, sub-questions
  // (First name + Last name in a "Name" group, etc) fall through to
  // their raw UUID.
  type TFField = { id?: string; ref?: string; title?: string; type?: string; properties?: { fields?: TFField[] } };
  const fieldTitles = new Map<string, string>();
  function walkFields(fields: TFField[] | undefined) {
    if (!fields) return;
    for (const f of fields) {
      if (f.id && f.title?.trim()) fieldTitles.set(f.id, cleanQuestionTitle(f.title));
      if (f.properties?.fields) walkFields(f.properties.fields);
    }
  }
  walkFields((fr.definition?.fields as TFField[] | undefined));

  const flat: Record<string, string> = {};
  let respondentName:  string | null = null;
  let respondentEmail: string | null = null;
  for (const a of fr.answers ?? []) {
    const title = fieldTitles.get(a.field.id) || a.field.title?.trim() || a.field.ref || a.field.id;
    const value =
      a.type === "text"      ? (a.text       ?? "") :
      a.type === "email"     ? (a.email      ?? "") :
      a.type === "phone_number" ? (a.phone_number ?? "") :
      a.type === "number"    ? (a.number     != null ? String(a.number) : "") :
      a.type === "boolean"   ? (a.boolean    != null ? String(a.boolean) : "") :
      a.type === "date"      ? (a.date       ?? "") :
      a.type === "url"       ? (a.url        ?? "") :
      a.type === "file_url"  ? (a.file_url   ?? "") :
      a.type === "choice"    ? (a.choice?.label ?? a.choice?.other ?? "") :
      a.type === "choices"   ? ([...(a.choices?.labels ?? []), a.choices?.other].filter(Boolean).join(", ")) :
                               JSON.stringify(a);
    if (value) flat[title] = value;

    // Heuristic respondent capture — first email/name we see wins.
    // Some forms configure the email question as short_text (custom
    // regex validation), so we also accept text answers whose value
    // looks like an email.
    if (!respondentEmail) {
      if (a.type === "email" && a.email) respondentEmail = a.email;
      else if (a.type === "text" && a.text && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a.text.trim())) {
        respondentEmail = a.text.trim();
      }
    }
    const titleLc = (a.field.title ?? "").toLowerCase();
    if (!respondentName && a.type === "text" && a.text && (titleLc.includes("name") || titleLc.includes("full name"))) {
      respondentName = a.text;
    }
  }

  // ── Try to link to an existing AA lead / DoB by email ───────────────
  // Single RPC against the canonical JSONB Zoho cache. DoB > Lead
  // precedence is baked into the SQL function. The previous
  // implementation queried zoho_cache_dob / zoho_cache_leads tables
  // that don't exist on this project, silently failing to link.
  let doctorId: string | null = null;
  if (respondentEmail) {
    const { data, error } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: respondentEmail });
    if (error) console.warn("[typeform-webhook] lookup_doctor_id_by_email:", error.message);
    else if (typeof data === "string") doctorId = data;
  }

  // ── Insert response (idempotent on (form_id, provider_response_id)) ──
  const { error: insErr } = await supabase
    .from("form_responses")
    .upsert({
      form_id:               form.id,
      provider_response_id:  fr.token,
      submitted_at:          fr.submitted_at ?? new Date().toISOString(),
      raw_payload:           payload as unknown as Record<string, unknown>,
      answers:               flat,
      respondent_name:       respondentName,
      respondent_email:      respondentEmail,
      doctor_id:             doctorId,
    }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: true });

  if (insErr) {
    console.error("[typeform-webhook] insert failed:", insErr);
    return json({ ok: false, error: "Insert failed", detail: insErr.message }, 500);
  }

  // Slack + bell — review-the-profile nudge. Typeform doesn't push to
  // WP, so the link target is the Forms page filtered to this
  // submission's email — the team takes it from there.
  await notify({
    kind:    "new_form_submission",
    title:   `New form submission${respondentName ? ` · ${respondentName}` : ""}`,
    body:    `${respondentEmail ?? "(no email)"} via Typeform. Review the submission and decide whether to action it.`,
    link_path:         respondentEmail
      ? `/forms?q=${encodeURIComponent(respondentEmail)}`
      : `/forms`,
    related_doctor_id: doctorId,
  }).catch(e => console.error("[typeform-webhook] notify failed:", e));

  return json({ ok: true, form_id: form.id, response_id: fr.token }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Strip Typeform's {{field:<uuid>}} / {{hidden:foo}} placeholder
 *  tokens from a question title so column headers are readable.
 *  Typeform uses these placeholders to inline earlier answers in
 *  subsequent question text (e.g. "Nice to meet you {{field:abc}} —
 *  what's your email?"). The placeholder is only resolved when the
 *  form is being filled out; in the form definition it stays as raw
 *  text, which is useless as a column header. */
function cleanQuestionTitle(raw: string): string {
  return raw
    .replace(/\{\{[^}]*\}\}/g, "")  // strip {{...}} placeholders
    .replace(/\s+/g, " ")            // collapse multi-line / repeated whitespace
    .replace(/\s+([.,!?;:])/g, "$1") // tighten spacing before punctuation
    .replace(/[-–—\s]+([.,!?;:])/g, "$1") // 'X - ?' → 'X?'
    .trim();
}
