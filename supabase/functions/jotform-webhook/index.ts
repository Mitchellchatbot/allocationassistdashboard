/**
 * JotForm webhook → WordPress candidate (auto profile creation).
 *
 * Replaces the manual flow where the team had to copy fields from a
 * JotForm submission into a WordPress doctor profile by hand.
 *
 * Endpoint:
 *   POST /functions/v1/jotform-webhook?key=<webhook_secret>
 *
 * Paste that URL into JotForm → Settings → Integrations → Webhooks.
 *
 * What this does per submission:
 *   1. Validates the key against the seeded JotForm row's webhook_secret.
 *   2. Parses the JotForm payload (form-urlencoded with a `rawRequest`
 *      JSON blob is the standard shape).
 *   3. Maps known fields (name, email, phone, specialty, etc.) to the
 *      WordPress candidate ACF schema.
 *   4. Lookups by email — if a WP candidate already exists, UPDATE it;
 *      otherwise CREATE a new one as `status=draft` so the team
 *      reviews before it goes live on allocationassist.com.
 *   5. Mirrors the result into wordpress_candidates table (the upsert
 *      edge function does this automatically).
 *   6. Inserts a form_responses row so the submission shows up in
 *      /forms with the same outreach state machinery as Typeform.
 *   7. Auto-links the form_responses row to a Zoho lead/DoB via the
 *      lookup_doctor_id_by_email RPC.
 *
 * JotForm doesn't natively support HMAC signing; the webhook_secret
 * in the URL is the auth layer. The secret is generated server-side
 * when the form row is seeded and is never exposed to the client.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flattenAnswers, mapToProfile } from "../_shared/jotform-extract.ts";
import { notify } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── 1. Auth via webhook key in URL ─────────────────────────────────
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!key) return json({ ok: false, error: "Missing ?key=…" }, 401);

  const { data: form } = await supabase
    .from("forms")
    .select("id, webhook_secret, form_type, provider, api_token")
    .eq("provider", "jotform")
    .eq("webhook_secret", key)
    .maybeSingle();
  if (!form) return json({ ok: false, error: "Unknown or revoked key" }, 401);

  // ── 2. Parse payload ──────────────────────────────────────────────
  // JotForm sends one of THREE content types depending on the form's
  // version + how the integration was set up:
  //   - application/json                        (rare; manual configs)
  //   - application/x-www-form-urlencoded       (older JotForm setups)
  //   - multipart/form-data; boundary=…          (current default — most
  //                                              of our submissions)
  // We branch on content-type to avoid the multipart-boundary-as-field
  // bug that turned the whole raw body into one giant garbage answer.
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  let parsed:     Record<string, unknown> = {};
  let rawAnswers: Record<string, unknown> = {};

  if (ct.includes("application/json")) {
    const raw = await req.text();
    try { parsed = JSON.parse(raw); } catch { /* fall through */ }
    rawAnswers = (parsed.rawRequest as Record<string, unknown> | undefined) ?? parsed;
  } else if (ct.includes("multipart/form-data")) {
    // Use the built-in multipart parser. Each form field becomes one
    // entry on the FormData; large fields like rawRequest or fileToken
    // come through intact.
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) {
      // Skip file blobs — JotForm uploads come as File entries we don't
      // need here (the picture proxy + jotform-file-proxy handle them
      // by URL). Coerce everything else to string.
      if (typeof v === "string") parsed[k] = v;
    }
    const rr = parsed.rawRequest as string | undefined;
    if (rr) {
      try { rawAnswers = JSON.parse(rr); } catch { /* fall through */ }
    } else {
      rawAnswers = parsed;
    }
  } else {
    // application/x-www-form-urlencoded (and the no-content-type fallback)
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    for (const [k, v] of params.entries()) parsed[k] = v;
    const rr = params.get("rawRequest");
    if (rr) {
      try { rawAnswers = JSON.parse(rr); } catch { /* fall through */ }
    } else {
      rawAnswers = parsed;
    }
  }

  if (Object.keys(rawAnswers).length === 0) {
    return json({ ok: false, error: "No answers found in payload", got: Object.keys(parsed) }, 400);
  }

  // ── 3. Map JotForm answers → flat record + canonical ACF payload ─
  const flat = flattenAnswers(rawAnswers);
  const profile = mapToProfile(flat);
  const responseId = String(parsed.submissionID ?? parsed.submission_id ?? crypto.randomUUID());

  // Previously: bail with 422 if no email. That tossed the submission
  // entirely — the team never saw it land. Now: keep going. We can't
  // upsert a WP candidate without an email (the WP candidate's primary
  // identifier IS the email) but we CAN store the form_response and
  // ping Slack so the team knows something arrived. The notification
  // body flags the missing email so they know to chase the doctor.
  const hasEmail = !!profile.email;

  // ── 4. STAGE the profile (does NOT touch WordPress) ──────────────
  // Submissions land here, NOT on WordPress. The HI team reviews from
  // the Staging section on Doctors → Profiles. Only when they click
  // Save-as-draft or Publish does anything get sent to WP.
  //
  // cv_resume gets stored on the staged row itself (in acf jsonb), and
  // the CV pipeline keys off staged:<id> instead of wp:<id> so the
  // extracted fields are available when the team chooses to publish.
  const safeAcf: Record<string, unknown> = { ...(profile.acf ?? {}) };
  delete safeAcf.cv_resume;  // kept as a separate field; not for WP write

  const stagedInsert: Record<string, unknown> = {
    source:              "jotform",
    full_name:           profile.full_name || null,
    email:               profile.email      || null,
    phone:               profile.phone      || null,
    specialty:           (safeAcf.specialty           as string | undefined) ?? null,
    subspecialty:        (safeAcf.subspecialty        as string | undefined) ?? null,
    nationality:         (safeAcf.nationality         as string | undefined) ?? null,
    job_title:           (safeAcf.job_title           as string | undefined) ?? null,
    current_location:    (safeAcf.current_location    as string | undefined) ?? null,
    country_of_training: (safeAcf.country_of_training as string | undefined) ?? null,
    years_experience:    (safeAcf.years_of_experience_post_specialization as string | undefined) ?? null,
    acf:                 safeAcf,
    created_by:          "jotform-webhook",
  };

  const { data: stagedRow, error: stagedErr } = await supabase
    .from("staged_doctor_profiles")
    .insert(stagedInsert)
    .select("id")
    .single();

  if (stagedErr || !stagedRow) {
    console.error("[jotform-webhook] staged insert failed:", stagedErr?.message);
  }
  const stagedId: string | null = stagedRow?.id ?? null;

  // ── 4b. CV pipeline: download → bucket → cv-extract → write back ──
  // Async, fire-and-forget. cv-extract handles the staged:<id> prefix
  // and writes extracted fields onto the staged_doctor_profiles row
  // via extracted_cv_data. The StagedRow Publish handler merges that
  // into the WP upsert when the team eventually clicks Publish.
  const cvUrl = (profile.acf?.cv_resume as string | undefined) ?? "";
  if (cvUrl && stagedId && form.api_token) {
    fireCvPipeline({
      supabaseUrl, serviceKey,
      cvUrl,
      jotformApiKey: form.api_token,
      stagedProfileId: stagedId,
      candidateName:   profile.full_name || "JotForm intake",
      candidateEmail:  profile.email,
    }).catch(e => console.error("[jotform-webhook] cv pipeline error:", e));
  }

  // ── 6. Auto-link doctor_id from the Zoho cache (email match) ──────
  let doctorId: string | null = null;
  if (hasEmail) {
    const { data: lookupData } = await supabase.rpc("lookup_doctor_id_by_email", { p_email: profile.email });
    if (typeof lookupData === "string") doctorId = lookupData;
  }

  // ── 7. Insert form_response so /forms shows the submission ────────
  await supabase.from("form_responses").upsert({
    form_id:               form.id,
    provider_response_id:  responseId,
    submitted_at:          new Date().toISOString(),
    raw_payload:           parsed,
    answers:               flat,
    respondent_name:       profile.full_name || null,
    respondent_email:      profile.email      || null,
    doctor_id:             doctorId,
    outreach_status:       "new",
    outreach_notes:
      !hasEmail
        ? "Staged for review. No email captured yet — open the staging row to add contact details."
        : stagedId
          ? "Staged for review. Open Doctors → Profiles → Staging to publish or discard."
          : "Submission saved. Staging insert failed — create the profile manually if needed.",
  }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false });

  console.log("[jotform-webhook] processed submission", responseId, "email:", profile.email, "staged_id:", stagedId, "doctor_id:", doctorId);

  // ── 8. Slack-deliverable nudge so the team reviews the staged row ─
  // Always land on Doctors → Profiles, where the Staging section sits
  // at the top of the list with Publish / Save-as-draft / Discard
  // buttons. NOTHING has touched WordPress at this point.
  const reviewLink = `/doctors?tab=profiles`;
  const summary = [profile.full_name, profile.acf?.specialty, profile.acf?.country_of_training]
    .filter(Boolean).join(" · ") || profile.email || "no contact details extracted yet";
  const body =
    !hasEmail
      ? `${summary}. Staged for review — no email captured, add one in the staging row before publishing.`
      : stagedId
        ? `${summary}. Staged for review — pick Publish or Save as draft from the staging row.`
        : `${summary}. Submission saved, staging failed — create the profile manually if needed.`;
  await notify({
    kind:    "new_form_submission",
    title:   `New form submission${profile.full_name ? ` · ${profile.full_name}` : ""}`,
    body,
    link_path:         reviewLink,
    related_doctor_id: doctorId,
  }).catch(e => console.error("[jotform-webhook] notify failed:", e));

  return json({
    ok:                true,
    submission_id:     responseId,
    staged_profile_id: stagedId,
    doctor_id:         doctorId,
  }, 200);
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Download a JotForm-hosted CV, drop it in the doctor-cvs bucket,
 * insert a cv_uploads row that links it to the staged profile via
 * doctor_id = `staged:<id>`, and kick off cv-extract.
 *
 * cv-extract detects the staged: prefix and writes the extracted
 * fields onto the staged_doctor_profiles row's extracted_cv_data
 * column. When the team later clicks Publish/Save-as-draft on the
 * staged row, the publish handler merges that into the WP upsert.
 *
 * Runs fire-and-forget from the webhook so the JotForm round-trip
 * stays fast.
 */
async function fireCvPipeline(args: {
  supabaseUrl:     string;
  serviceKey:      string;
  cvUrl:           string;
  jotformApiKey:   string;
  stagedProfileId: string;
  candidateName:   string;
  candidateEmail:  string;
}): Promise<void> {
  const { supabaseUrl, serviceKey, cvUrl, jotformApiKey, stagedProfileId, candidateName, candidateEmail } = args;

  // 1. Download the CV from JotForm using APIKEY auth.
  const jfRes = await fetch(cvUrl, { headers: { APIKEY: jotformApiKey } });
  if (!jfRes.ok) {
    console.error("[cv-pipeline] CV download failed:", jfRes.status, cvUrl);
    return;
  }
  const blob = await jfRes.blob();
  const filename = (() => {
    try {
      const p = new URL(cvUrl).pathname;
      return decodeURIComponent(p.split("/").filter(Boolean).pop() ?? "cv.pdf");
    } catch { return "cv.pdf"; }
  })();

  // 2. Upload to the doctor-cvs storage bucket. Path key:
  //    staged-<id>/<token>/<filename> — staging-aware so cv-extract
  //    can route the result back to staged_doctor_profiles.
  const sb = createClient(supabaseUrl, serviceKey);
  const token = crypto.randomUUID().replace(/-/g, "");
  const doctorId = `staged:${stagedProfileId}`;
  // Storage doesn't accept `:` in keys cleanly; replace with `-` for path
  const safeDir = doctorId.replace(/[:]/g, "-");
  const filePath = `${safeDir}/${token}/${filename}`;

  const { error: upErr } = await sb.storage
    .from("doctor-cvs")
    .upload(filePath, blob, {
      contentType: jfRes.headers.get("content-type") ?? "application/pdf",
      upsert: true,
    });
  if (upErr) {
    console.error("[cv-pipeline] storage upload failed:", upErr.message);
    return;
  }

  // 3. Insert cv_uploads row. cv-extract will pick this up via the
  //    upload_id we pass through next.
  const { data: row, error: insErr } = await sb
    .from("cv_uploads")
    .insert({
      doctor_id:    doctorId,
      doctor_name:  candidateName,
      doctor_email: candidateEmail,
      token,
      file_path:    filePath,
      file_name:    filename,
      file_size:    blob.size,
      file_mime:    jfRes.headers.get("content-type") ?? "application/pdf",
      uploaded_at:  new Date().toISOString(),
      status:       "uploaded",
      created_by:   "jotform-webhook",
    })
    .select("id")
    .single();
  if (insErr || !row) {
    console.error("[cv-pipeline] cv_uploads insert failed:", insErr?.message);
    return;
  }

  // 3b. Link the cv_uploads row id onto the staged_doctor_profiles row
  //     so the StagedRow Publish handler can find the CV file path
  //     without a separate lookup.
  await sb.from("staged_doctor_profiles")
    .update({ cv_upload_id: row.id })
    .eq("id", stagedProfileId);

  // 4. Fire cv-extract. Don't await — it can take 15-30s and we want
  //    this whole pipeline to be fire-and-forget. cv-extract handles
  //    the staged: prefix and writes extracted_cv_data onto the
  //    staged_doctor_profiles row.
  fetch(`${supabaseUrl}/functions/v1/cv-extract`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ upload_id: row.id }),
  }).catch(e => console.error("[cv-pipeline] cv-extract invoke failed:", e));

  console.log(`[cv-pipeline] queued CV extraction for staged profile ${stagedProfileId} (upload ${row.id})`);
}
