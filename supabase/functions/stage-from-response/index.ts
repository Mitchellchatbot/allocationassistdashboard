/**
 * stage-from-response — Supabase Edge Function
 *
 * Given a form_response row id, re-run the same staging pipeline the
 * JotForm webhook does on a live submission:
 *   1. Read the form_response (answers + raw_payload + form_id).
 *   2. Look up the form's JotForm api_token.
 *   3. Map the answers to ACF + enrich via Zoho + extract picture URL.
 *   4. Insert a staged_doctor_profiles row.
 *   5. If a CV URL is in the answers, download from JotForm with
 *      APIKEY auth, push to doctor-cvs storage, and fire cv-extract.
 *
 * Used by the Forms-page "Send to staging" button so the staged row
 * reflects the SAME enrichment + CV/photo pipeline as a fresh webhook
 * submission. Previously the button did a thin frontend map and
 * skipped CV download + picture extraction — staged rows came up
 * missing fields the source data clearly had.
 *
 * Request:  POST { response_id: string }
 * Response: { ok, staged_id, picture_captured, cv_queued }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mapToProfile, flattenAnswers } from "../_shared/jotform-extract.ts";
import { enrichProfile } from "../_shared/enrich-profile.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { response_id?: string };
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  if (!body.response_id) return json({ ok: false, error: "response_id required" }, 400);

  // 1. Pull the form_response + the related form row (for api_token).
  const { data: response, error: rErr } = await supabase
    .from("form_responses")
    .select("id, form_id, respondent_email, respondent_name, answers, raw_payload, doctor_id")
    .eq("id", body.response_id)
    .single();
  if (rErr || !response) return json({ ok: false, error: `Form response not found: ${rErr?.message ?? ""}` }, 404);

  const { data: form } = await supabase
    .from("forms")
    .select("id, provider, provider_form_id, api_token, metadata")
    .eq("id", response.form_id)
    .single();

  // 2. Map answers → profile. The webhook does this with question-label
  //    enrichment too, but here the form_response.answers is ALREADY
  //    label-keyed (the webhook normalized them at ingest time), so
  //    we can run the heuristics directly.
  const flat = flattenAnswers((response.answers ?? {}) as Record<string, unknown>);
  const profile = mapToProfile(flat);

  // 3. Strip cv_resume from the form ACF — it's a URL, not a WP attachment
  //    id, and WP rejects it on create. The CV file lives in storage.
  const safeAcfForm: Record<string, unknown> = { ...(profile.acf ?? {}) };
  delete safeAcfForm.cv_resume;

  // 4. Run the shared enrichment (Zoho lookup + picture URL extract from
  //    raw_payload). Pass the raw_payload as the responseRow so the
  //    picture extractor can read widget_metadata.
  const { mergedAcf: safeAcf, pictureUrl } = await enrichProfile({
    supabase,
    email:   profile.email || response.respondent_email || null,
    formAcf: safeAcfForm,
    responseRow: {
      raw_payload: (response.raw_payload ?? null) as Record<string, unknown> | null,
      answers:     flat,
    },
  });

  // 5. Insert staged row. flat fields surfaced for the staging-list display.
  const stagedInsert: Record<string, unknown> = {
    source:              `form:${response.id}`,
    source_response_id:  response.id,
    form_id:             response.form_id,
    full_name:           profile.full_name || response.respondent_name || null,
    email:               profile.email     || response.respondent_email || null,
    phone:               profile.phone     || (safeAcf.phone_number as string | undefined) || null,
    specialty:           (safeAcf.specialty           as string | undefined) ?? null,
    subspecialty:        (safeAcf.subspecialty        as string | undefined) ?? null,
    nationality:         (safeAcf.nationality         as string | undefined) ?? null,
    job_title:           (safeAcf.job_title           as string | undefined) ?? null,
    current_location:    (safeAcf.current_location    as string | undefined) ?? null,
    country_of_training: (safeAcf.country_of_training as string | undefined) ?? null,
    years_experience:    (safeAcf.years_of_experience_post_specialization as string | undefined) ?? null,
    acf:                 safeAcf,
    picture_url:         pictureUrl,
    created_by:          "stage-from-response",
  };

  const { data: stagedRow, error: stagedErr } = await supabase
    .from("staged_doctor_profiles")
    .insert(stagedInsert)
    .select("id")
    .single();
  if (stagedErr || !stagedRow) return json({ ok: false, error: `Stage insert failed: ${stagedErr?.message}` }, 500);
  const stagedId = stagedRow.id as string;

  // 6. If we have a CV URL + a JotForm api_token, run the download
  //    + storage upload + cv_uploads insert AWAITED — the edge
  //    runtime tears down the isolate when this handler returns,
  //    so fire-and-forget loses the work. The Claude extraction
  //    call inside cv-extract IS still fire-and-forget downstream
  //    (it's a long Anthropic call we don't need to block on).
  // CV URL can hide in three places, in priority order: the mapped ACF, the
  // flat answers, or ONLY in raw_payload (widget uploads / answers the
  // flattener didn't surface — e.g. Flor's CV lived solely in raw_payload).
  const cvUrl = (profile.acf?.cv_resume as string | undefined)
    ?? extractCvUrlFromAnswers(flat)
    ?? extractCvUrlFromRaw(response.raw_payload)
    ?? "";
  let cvQueued = false;
  let cvError: string | null = null;
  if (cvUrl && form?.api_token) {
    try {
      await fireCvPipeline({
        supabaseUrl, serviceKey,
        cvUrl,
        jotformApiKey:   form.api_token,
        stagedProfileId: stagedId,
        candidateName:   profile.full_name || response.respondent_name || "JotForm intake",
        candidateEmail:  profile.email || response.respondent_email || "",
      });
      cvQueued = true;
    } catch (e) {
      cvError = e instanceof Error ? e.message : String(e);
      console.error("[stage-from-response] CV pipeline threw:", cvError);
    }
  }

  return json({
    ok:                true,
    staged_id:         stagedId,
    picture_captured:  !!pictureUrl,
    cv_queued:         cvQueued,
    cv_error:          cvError,
  }, 200);
});

/** Belt-and-braces CV URL fallback: even if mapToProfile missed
 *  the cv_resume mapping (label heuristics can fail on weird forms),
 *  scan every answer for a JotForm /uploads/ URL ending in a document
 *  extension. Same regex shape mapToProfile uses internally. */
function extractCvUrlFromAnswers(flat: Record<string, string>): string | null {
  for (const v of Object.values(flat)) {
    const m = /(https?:\/\/[^\s,;"']+\.(?:pdf|doc|docx))/i.exec(v ?? "");
    if (m && /jotform\.com\/uploads\//i.test(m[1])) return m[1];
  }
  return null;
}

/** Last-resort CV URL scan: JotForm file-upload answers sometimes appear
 *  ONLY in raw_payload (widget uploads, or answers the flattener didn't
 *  surface into the flat answers map). Stringify the whole payload and grab
 *  the first /uploads/ document URL. */
function extractCvUrlFromRaw(raw: unknown): string | null {
  if (!raw) return null;
  let s: string;
  try { s = typeof raw === "string" ? raw : JSON.stringify(raw); } catch { return null; }
  const m = /(https?:\/\/[^\s,;"'\\]+\/uploads\/[^\s,;"'\\]+\.(?:pdf|doc|docx))/i.exec(s);
  return m ? m[1] : null;
}

/** Mirrors fireCvPipeline in jotform-webhook. Kept in-file so this
 *  function is self-contained (the webhook module isn't importable
 *  from sibling functions in the Supabase Edge runtime). */
async function fireCvPipeline(args: {
  supabaseUrl: string; serviceKey: string;
  cvUrl: string; jotformApiKey: string;
  stagedProfileId: string;
  candidateName: string; candidateEmail: string;
}): Promise<void> {
  const { supabaseUrl, serviceKey, cvUrl, jotformApiKey, stagedProfileId, candidateName, candidateEmail } = args;

  const jfRes = await fetch(cvUrl, { headers: { APIKEY: jotformApiKey } });
  if (!jfRes.ok) throw new Error(`JotForm CV download ${jfRes.status}`);
  const blob = await jfRes.blob();
  if (blob.size === 0) throw new Error("JotForm returned empty CV body");
  const filename = (() => {
    try {
      const p = new URL(cvUrl).pathname;
      return decodeURIComponent(p.split("/").filter(Boolean).pop() ?? "cv.pdf");
    } catch { return "cv.pdf"; }
  })();
  // JotForm always returns application/octet-stream for downloads,
  // but the doctor-cvs bucket policy only allows specific MIME
  // types. Infer from the filename extension so the upload + the
  // downstream Claude document-extraction both get an honest type.
  const inferredMime = inferMime(filename, jfRes.headers.get("content-type"));

  const sb = createClient(supabaseUrl, serviceKey);
  const token = crypto.randomUUID().replace(/-/g, "");
  const doctorId = `staged:${stagedProfileId}`;
  const safeDir = doctorId.replace(/[:]/g, "-");
  const filePath = `${safeDir}/${token}/${filename}`;

  // supabase-js .upload() uses Blob.type if the body is a Blob,
  // overriding our contentType option. Pass raw bytes so it
  // respects inferredMime.
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
      file_mime: inferredMime,
      uploaded_at: new Date().toISOString(), status: "uploaded",
      created_by: "stage-from-response",
    })
    .select("id")
    .single();
  if (insErr || !row) throw new Error(`cv_uploads insert: ${insErr?.message ?? "no row"}`);

  await sb.from("staged_doctor_profiles").update({ cv_upload_id: row.id }).eq("id", stagedProfileId);

  // Block on cv-extract too — we're inside an awaited call from
  // the handler, so the isolate stays alive for the duration.
  // The whole stage-from-response now takes ~20-30s but the user
  // gets back a row with picture_url + acf populated by enrich +
  // extracted_cv_data populated by Claude, all visible in the
  // staging UI on first refresh. Much better demo experience.
  const extractRes = await fetch(`${supabaseUrl}/functions/v1/cv-extract`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ upload_id: row.id }),
  });
  if (!extractRes.ok) {
    const t = await extractRes.text().catch(() => "");
    console.error(`[stage-from-response] cv-extract ${extractRes.status}: ${t.slice(0, 200)}`);
  } else {
    console.log(`[stage-from-response] cv-extract succeeded for staged ${stagedProfileId}`);
  }
}

/** Map a file extension or fallback header to a concrete MIME the
 *  doctor-cvs bucket accepts (PDFs and Word docs). Anything else
 *  defaults to application/pdf since the form question is labelled
 *  'Updated CV' and that's the overwhelming majority. */
function inferMime(filename: string, headerType: string | null): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf"))  return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc"))  return "application/msword";
  if (headerType && headerType !== "application/octet-stream") return headerType;
  return "application/pdf";
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
