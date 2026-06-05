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

  // ── 4. Lookup existing WP candidate by email ──────────────────────
  const { data: existing } = hasEmail ? await supabase
    .from("wordpress_candidates")
    .select("id, doctor_id")
    .ilike("email", profile.email)
    .order("wp_modified", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle() : { data: null };

  // ── 5. Upsert to WordPress via the existing edge function ─────────
  // Wraps WP REST + mirror sync + auto-Zoho-link in one call. We pass
  // the existing WP id when there's an email match so it's an UPDATE.
  // New rows land as `status=draft` so HI reviews before they go live.
  // Skipped entirely when the submission has no email — WP candidates
  // are keyed on email, no email means no upsert target.
  let upsertJson: { ok: boolean; id?: number; error?: string } | null = null;
  if (hasEmail) {
    // cv_resume is a File-type ACF on WP — sending a raw URL string
    // triggers a 400 rest_invalid_param that takes down the entire
    // upsert. We hold the CV URL separately (it's in cv_uploads + the
    // doctor-cvs bucket via fireCvPipeline below). Drop it from the
    // outgoing ACF so the rest of the fields land.
    const safeAcf: Record<string, unknown> = { ...(profile.acf ?? {}) };
    delete safeAcf.cv_resume;
    const upsertBody = {
      id:     existing?.id,
      status: existing ? undefined : "draft",
      title:  profile.full_name || "JotForm intake",
      acf:    safeAcf,
    };
    const upsertRes = await fetch(`${supabaseUrl}/functions/v1/wordpress-candidate-upsert`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify(upsertBody),
    });
    upsertJson = await upsertRes.json().catch(() => null) as { ok: boolean; id?: number; error?: string } | null;
    if (!upsertRes.ok || !upsertJson?.ok) {
      console.error("[jotform-webhook] WP upsert failed:", upsertJson);
      // We still record the form_response so the team sees the submission
      // landed; flagging the error in outreach_notes for visibility.
    }
  } else {
    console.log("[jotform-webhook] no email on submission — skipping WP upsert, recording response only");
  }

  // ── 5b. CV pipeline: download → bucket → cv-extract → merge into WP ─
  // If the submission included a CV URL AND we successfully created/
  // updated the WP candidate, download the file via the JotForm API
  // (the URL itself requires a JotForm session), store it in the
  // doctor-cvs bucket, create a cv_uploads row, and asynchronously
  // invoke cv-extract. cv-extract will populate doctor_profiles AND
  // (via the wp:<id> doctor_id prefix) update the WP candidate's ACF
  // with bio / license / years_experience / etc. — so the team sees
  // the draft auto-fill over the next 15-30s instead of having to
  // copy fields by hand.
  const cvUrl = (profile.acf?.cv_resume as string | undefined) ?? "";
  if (cvUrl && upsertJson?.ok && upsertJson.id && form.api_token) {
    fireCvPipeline({
      supabaseUrl, serviceKey,
      cvUrl,
      jotformApiKey: form.api_token,
      wpCandidateId: upsertJson.id,
      candidateName: profile.full_name || "JotForm intake",
      candidateEmail: profile.email,
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
        ? "Submission saved. No email captured yet — add one in the dashboard to link a profile."
        : upsertJson?.ok
          ? `Draft profile ready for review${existing ? " (updated existing)" : ""}.`
          : "Submission saved. Finish creating the profile in the dashboard.",
  }, { onConflict: "form_id,provider_response_id", ignoreDuplicates: false });

  console.log("[jotform-webhook] processed submission", responseId, "email:", profile.email, "wp_id:", upsertJson?.id, "doctor_id:", doctorId);

  // ── 8. Slack-deliverable nudge so the team reviews the profile ─────
  // Deep-link strategy: deep-link straight into the rich editor for the
  // freshly-created WP candidate when we have one, so clicking the
  // Slack button lands the user on the inline edit dialog. Falls back
  // to the Forms page if the upsert was skipped or failed.
  const reviewLink = (hasEmail && upsertJson?.ok && upsertJson.id)
    ? `/doctors?tab=profiles&open=${upsertJson.id}`
    : `/forms`;
  const summary = [profile.full_name, profile.acf?.specialty, profile.acf?.country_of_training]
    .filter(Boolean).join(" · ") || profile.email || "no contact details extracted yet";
  // Friendly body — no jargon, no "upsert failed" tech-speak. Tells the
  // operator what's waiting for them in plain English.
  const body =
    !hasEmail
      ? `${summary}. No email on the submission yet — open it in the dashboard to add contact details.`
      : existing
        ? `${summary}. Existing profile updated — click to review the changes.`
        : upsertJson?.ok
          ? `${summary}. Your draft is ready — click to review and publish.`
          : `${summary}. Submission saved — finish creating the profile in the dashboard.`;
  await notify({
    kind:    "new_form_submission",
    title:   `New form submission${profile.full_name ? ` · ${profile.full_name}` : ""}`,
    body,
    link_path:         reviewLink,
    related_doctor_id: doctorId,
  }).catch(e => console.error("[jotform-webhook] notify failed:", e));

  return json({
    ok:              true,
    submission_id:   responseId,
    wp_candidate_id: upsertJson?.id ?? null,
    wp_action:       existing ? "updated" : "created",
    doctor_id:       doctorId,
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
 * insert a cv_uploads row that links it to the freshly-created WP
 * candidate via doctor_id = `wp:<id>`, and kick off cv-extract.
 *
 * cv-extract reads doctor_id off the cv_uploads row and (with the
 * companion change in cv-extract) will detect the wp: prefix +
 * upsert the extracted fields into the matching WP candidate's ACF —
 * so the team's draft auto-fills with bio / license / years_experience
 * over the next ~15-30 seconds.
 *
 * Runs fire-and-forget from the webhook so the JotForm round-trip
 * stays fast.
 */
async function fireCvPipeline(args: {
  supabaseUrl:    string;
  serviceKey:     string;
  cvUrl:          string;
  jotformApiKey:  string;
  wpCandidateId:  number;
  candidateName:  string;
  candidateEmail: string;
}): Promise<void> {
  const { supabaseUrl, serviceKey, cvUrl, jotformApiKey, wpCandidateId, candidateName, candidateEmail } = args;

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
  //    wp-<id>/<token>/<filename> — same convention as send-cv-upload-link.
  const sb = createClient(supabaseUrl, serviceKey);
  const token = crypto.randomUUID().replace(/-/g, "");
  const doctorId = `wp:${wpCandidateId}`;
  const filePath = `${doctorId}/${token}/${filename}`;

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

  // 4. Fire cv-extract. Don't await — it can take 15-30s and we want
  //    this whole pipeline to be fire-and-forget. cv-extract handles
  //    the wp: prefix and updates the WP candidate on its own.
  fetch(`${supabaseUrl}/functions/v1/cv-extract`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ upload_id: row.id }),
  }).catch(e => console.error("[cv-pipeline] cv-extract invoke failed:", e));

  console.log(`[cv-pipeline] queued CV extraction for WP candidate ${wpCandidateId} (upload ${row.id})`);
}
