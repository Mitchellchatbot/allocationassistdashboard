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
import { mapToProfile } from "../_shared/jotform-extract.ts";
import { enrichProfile } from "../_shared/enrich-profile.ts";

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
  let cvUrl:           string | null = null;   // file-upload answer (the CV)
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
    const titleLc = (fieldTitles.get(a.field.id) || a.field.title || "").toLowerCase();
    if (!respondentName && a.type === "text" && a.text && (titleLc.includes("name") || titleLc.includes("full name"))) {
      respondentName = a.text;
    }
    // CV = a file-upload answer. Prefer one whose question mentions cv/resume;
    // otherwise the first file_url wins (most forms have a single upload).
    if (a.type === "file_url" && a.file_url) {
      if (!cvUrl || /cv|resume|curriculum/i.test(titleLc)) cvUrl = a.file_url;
    }
  }

  // ── Map answers → profile (SAME mapper JotForm uses — the form's
  //    questions match, so fuzzy label-matching lands the same fields). ──
  const profile = mapToProfile(flat);
  const email    = profile.email     || respondentEmail || null;
  const fullName = profile.full_name || respondentName  || null;
  const hasEmail = !!email;

  // ── STAGE the profile (does NOT touch WordPress). Enrich the form ACF
  //    with Zoho first, exactly like the JotForm path. The HI team reviews
  //    + publishes from Doctors → Profiles → Staging. ────────────────────
  const safeAcfForm: Record<string, unknown> = { ...(profile.acf ?? {}) };
  delete safeAcfForm.cv_resume;
  const { mergedAcf: safeAcf, pictureUrl } = await enrichProfile({
    supabase,
    email,
    formAcf: safeAcfForm,
    responseRow: { raw_payload: payload as unknown as Record<string, unknown>, answers: flat },
  });

  const { data: stagedRow, error: stagedErr } = await supabase
    .from("staged_doctor_profiles")
    .insert({
      source:              "typeform",
      form_id:             form.id,
      full_name:           fullName,
      email:               email,
      phone:               profile.phone || (safeAcf.phone_number as string | undefined) || null,
      specialty:           (safeAcf.specialty           as string | undefined) ?? null,
      subspecialty:        (safeAcf.subspecialty        as string | undefined) ?? null,
      nationality:         (safeAcf.nationality         as string | undefined) ?? null,
      job_title:           (safeAcf.job_title           as string | undefined) ?? null,
      current_location:    (safeAcf.current_location    as string | undefined) ?? null,
      country_of_training: (safeAcf.country_of_training as string | undefined) ?? null,
      years_experience:    (safeAcf.years_of_experience_post_specialization as string | undefined) ?? null,
      acf:                 safeAcf,
      picture_url:         pictureUrl,
      created_by:          "typeform-webhook",
    })
    .select("id")
    .single();
  if (stagedErr) console.error("[typeform-webhook] staged insert failed:", stagedErr.message);
  const stagedId: string | null = stagedRow?.id ?? null;

  // ── CV pipeline: download the file-upload from Typeform (Bearer token),
  //    store in doctor-cvs, fire cv-extract. Async/fire-and-forget so the
  //    webhook returns fast; cv-extract writes fields back onto the staged
  //    row. Needs the form's personal access token (api_token). ───────────
  if (cvUrl && stagedId && form.api_token) {
    const cvJob = fireTypeformCvPipeline({
      supabaseUrl, serviceKey,
      cvUrl,
      typeformToken:   form.api_token,
      stagedProfileId: stagedId,
      candidateName:   fullName || "Typeform intake",
      candidateEmail:  email,
    }).catch(e => console.error("[typeform-webhook] cv pipeline error:", e));
    // Keep the isolate alive for the background download/extract after we
    // return 200 to Typeform (Supabase runtime would otherwise tear it down).
    try { (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(cvJob); }
    catch { /* not available — best-effort fire-and-forget */ }
  }

  // ── Auto-link doctor_id from the Zoho cache (email match) ────────────
  let doctorId: string | null = null;
  if (hasEmail) {
    const { data } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: email });
    if (typeof data === "string") doctorId = data;
  }

  // ── Insert form_response so it shows in Responses (idempotent) ───────
  const { error: insErr } = await supabase
    .from("form_responses")
    .upsert({
      form_id:               form.id,
      provider_response_id:  fr.token,
      submitted_at:          fr.submitted_at ?? new Date().toISOString(),
      raw_payload:           payload as unknown as Record<string, unknown>,
      answers:               flat,
      respondent_name:       fullName,
      respondent_email:      email,
      doctor_id:             doctorId,
      outreach_status:       "new",
      outreach_notes:
        !hasEmail
          ? "Staged for review. No email captured yet — open the staging row to add contact details."
          : stagedId
            ? "Staged for review. Open Doctors → Profiles → Staging to publish or discard."
            : "Submission saved. Staging insert failed — create the profile manually if needed.",
    }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false });
  if (insErr) {
    console.error("[typeform-webhook] insert failed:", insErr);
    return json({ ok: false, error: "Insert failed", detail: insErr.message }, 500);
  }

  // ── Slack nudge → review the staged row (NOTHING has touched WP). ────
  const summary = [fullName, safeAcf.specialty, safeAcf.country_of_training]
    .filter(Boolean).join(" · ") || email || "no contact details extracted yet";
  await notify({
    kind:    "new_form_submission",
    title:   `New form submission${fullName ? ` · ${fullName}` : ""}`,
    body:    !hasEmail
      ? `${summary}. Staged for review — no email captured, add one in the staging row before publishing.`
      : `${summary}. Staged for review — pick Publish or Save as draft from the staging row.`,
    link_path:         `/doctors?tab=profiles`,
    related_doctor_id: doctorId,
  }).catch(e => console.error("[typeform-webhook] notify failed:", e));

  console.log("[typeform-webhook] processed", fr.token, "email:", email, "staged_id:", stagedId, "cv:", !!cvUrl);
  return json({ ok: true, form_id: form.id, response_id: fr.token, staged_id: stagedId }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Download the Typeform file-upload (the CV), store it in doctor-cvs, insert
 *  a cv_uploads row, and fire cv-extract — mirrors the JotForm CV pipeline but
 *  uses the Typeform personal access token (Bearer) for the file download. */
async function fireTypeformCvPipeline(args: {
  supabaseUrl: string; serviceKey: string;
  cvUrl: string; typeformToken: string;
  stagedProfileId: string;
  candidateName: string; candidateEmail: string | null;
}): Promise<void> {
  const { supabaseUrl, serviceKey, cvUrl, typeformToken, stagedProfileId, candidateName, candidateEmail } = args;

  // api.typeform.com file URLs require the personal access token as a Bearer.
  const dl = await fetch(cvUrl, { headers: { Authorization: `Bearer ${typeformToken}` } });
  if (!dl.ok) throw new Error(`Typeform CV download ${dl.status}`);
  const blob = await dl.blob();
  if (blob.size === 0) throw new Error("Typeform returned empty CV body");
  const filename = (() => {
    try { const p = new URL(cvUrl).pathname; return decodeURIComponent(p.split("/").filter(Boolean).pop() ?? "cv.pdf"); }
    catch { return "cv.pdf"; }
  })();
  const inferredMime = inferMime(filename, dl.headers.get("content-type"));

  const sb = createClient(supabaseUrl, serviceKey);
  const token = crypto.randomUUID().replace(/-/g, "");
  const doctorId = `staged:${stagedProfileId}`;
  const safeDir = doctorId.replace(/[:]/g, "-");
  const filePath = `${safeDir}/${token}/${filename}`;

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from("doctor-cvs")
    .upload(filePath, bytes, { contentType: inferredMime, upsert: true });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  const { data: row, error: insErr } = await sb
    .from("cv_uploads")
    .insert({
      doctor_id: doctorId, doctor_name: candidateName, doctor_email: candidateEmail,
      token, file_path: filePath, file_name: filename, file_size: blob.size,
      file_mime: inferredMime, uploaded_at: new Date().toISOString(), status: "uploaded",
      created_by: "typeform-webhook",
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(`cv_uploads insert: ${insErr?.message ?? "no row"}`);

  await sb.from("staged_doctor_profiles").update({ cv_upload_id: row.id }).eq("id", stagedProfileId);

  const extractRes = await fetch(`${supabaseUrl}/functions/v1/cv-extract`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ upload_id: row.id }),
  });
  if (!extractRes.ok) {
    console.error(`[typeform-webhook] cv-extract ${extractRes.status}: ${(await extractRes.text().catch(() => "")).slice(0, 200)}`);
  }
}

/** File extension → MIME the doctor-cvs bucket accepts. */
function inferMime(filename: string, headerType: string | null): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf"))  return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc"))  return "application/msword";
  if (headerType && headerType !== "application/octet-stream") return headerType;
  return "application/pdf";
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
