/**
 * send-flow-email — Supabase Edge Function
 *
 * Renders the email template for a given automation flow run + its current
 * email/reminder stage, ships it via Resend, writes an `email_sent` event,
 * and advances the run's `current_stage` to the next stage in the flow.
 *
 * Secrets required (set via `supabase secrets set …` or the dashboard):
 *   RESEND_API_KEY                — Resend account API key
 *   MAIL_FROM                     — display+address, e.g. 'Hospital Intro <onboarding@resend.dev>'
 *   MAIL_TEST_RECIPIENT_OVERRIDE  — optional. When set, ALL emails go to this
 *                                   address regardless of the doctor's real
 *                                   email. Used during testing because
 *                                   `onboarding@resend.dev` only sends to the
 *                                   Resend account owner. Unset once a real
 *                                   sending domain is verified.
 *
 * Auto-injected by Supabase:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Request (JSON):
 *   { run_id: string, dry_run?: boolean }
 *   dry_run=true returns the rendered payload without calling Resend or
 *   mutating any rows — useful for the "Preview" path in the UI.
 *
 * Response (JSON):
 *   { ok: true,  message_id: string, to: string, subject: string, next_stage: string | null }
 *   { ok: false, error: string, detail?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Stage → Template + next-stage routing ──────────────────────────────────
// Hardcoded here (also defined in src/lib/automation-flows.ts) because the
// edge function can't import from src/. Keep these in sync — renaming a
// stage key on either side will silently break sends.
interface StageRoute {
  template_key: string;
  next_stage:   string;
  /** When true, the next stage is a terminal — mark the run completed. */
  terminal_next?: boolean;
  /** When true, after this email sends successfully and the stage advances,
   *  fire send-flow-email again for the new stage. Used for "bundled" email
   *  sequences that should feel like one action to the team:
   *    - Profile Sent: hospital intro + doctor notification fire together
   *    - Relocation: city guide + attestation fire together
   *  The duplicate-send guard already in send-flow-email prevents infinite
   *  loops if a chain were ever misconfigured. */
  auto_continue?: boolean;
}

const STAGE_ROUTES: Record<string, StageRoute> = {
  // Flow 1 · Onboarding
  send_onboarding_email:  { template_key: "onboarding_welcome",        next_stage: "wait_for_form" },
  reminder_form:          { template_key: "onboarding_form_reminder", next_stage: "form_received", terminal_next: true },
  // Flow 2 · Profile Sent — hospital intro + doctor notification go together
  email_hospital:         { template_key: "profile_sent_hospital",    next_stage: "email_doctor", auto_continue: true },
  email_doctor:           { template_key: "profile_sent_doctor",      next_stage: "awaiting_response" },
  // Flow 3 · Shortlist
  send_shortlist_email:   { template_key: "shortlist_confirmation",   next_stage: "shortlist_complete", terminal_next: true },
  // Flow 4 · Interview
  send_interview_email:   { template_key: "interview_tips_confirmation", next_stage: "interview_complete", terminal_next: true },
  // Flow 5 · Relocation — guide + attestation go together (per Saif's spec)
  send_relocation_email:  { template_key: "relocation_guide",         next_stage: "send_attestation_email", auto_continue: true },
  send_attestation_email: { template_key: "relocation_attestation",   next_stage: "relocation_complete", terminal_next: true },
  // Flow 6 · Second Payment
  send_invoice:           { template_key: "second_payment_invoice",         next_stage: "reminder_25_working" },
  reminder_25_working:    { template_key: "second_payment_reminder_25",     next_stage: "reminder_day_before" },
  reminder_day_before:    { template_key: "second_payment_reminder_due",    next_stage: "reminder_weekly" },
  // Self-loop until finance marks the invoice paid. The scheduler (not in
  // this function) repeats this stage weekly; manual sends just stay here.
  reminder_weekly:        { template_key: "second_payment_reminder_weekly", next_stage: "reminder_weekly" },
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM      = Deno.env.get("MAIL_FROM") ?? "Hospital Intro <onboarding@resend.dev>";
// When set, EVERY outbound email is redirected here regardless of the
// real recipient. Required while sending from onboarding@resend.dev (Resend
// only allows that to deliver to the account owner). Drop this env var once
// a real sending domain is verified.
// Accepts a comma-separated list — first address goes on To:, rest on Cc:
// so every team member sees test emails as they go out.
const TEST_OVERRIDE_LIST = (Deno.env.get("MAIL_TEST_RECIPIENT_OVERRIDE") ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);
const TEST_OVERRIDE      = TEST_OVERRIDE_LIST[0] ?? "";
// Subdomain dedicated to receiving replies — outgoing emails set
// `Reply-To: reply-<run_id>@<MAIL_REPLY_DOMAIN>`, so a hospital reply lands
// at Resend Inbound carrying the run_id right in the address. Strongest
// matching strategy in inbound-hospital-reply.
const MAIL_REPLY_DOMAIN = Deno.env.get("MAIL_REPLY_DOMAIN") ?? "reply.care-assist.io";
// App's public origin — used to render the CV upload link the onboarding
// email embeds. e.g. https://care-assist.io
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://care-assist.io";

// Allocation Assist branded signature block. Matches the layout Ammar uses
// in his manual sends (teal "Warmest Regards", name + title + company, JLT
// address with pin icon, website link, logo at bottom). Injected at render
// time via {{signature}} so we maintain one source of truth across every
// template — change here once, every email picks it up on the next send.
const SIGNATURE_HTML = `
<div style="margin-top:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a2332;">
  <p style="margin:0 0 4px;color:#14b8a6;font-weight:700;font-size:15px;">Warmest Regards,</p>
  <p style="margin:0 0 4px;color:#14b8a6;font-weight:700;font-size:15px;">The Allocation Assist team,</p>
  <p style="margin:0 0 14px;color:#14b8a6;font-weight:700;font-size:15px;">Allocation Assist</p>
  <p style="margin:0 0 4px;color:#475569;font-size:14px;">
    <span style="display:inline-block;width:14px;color:#14b8a6;">&#9737;</span>
    <strong style="color:#475569;font-weight:600;">Jumeirah Lakes Towers, Dubai, UAE</strong>
  </p>
  <p style="margin:0 0 12px;font-size:14px;">
    <a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a>
  </p>
  <p style="margin:0;color:#14b8a6;font-weight:700;font-size:18px;letter-spacing:-0.3px;">
    Allocation Assist
  </p>
  <p style="margin:2px 0 0;color:#94a3b8;font-size:11px;letter-spacing:0.5px;">The source of workforce</p>
</div>`;

const SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team
Allocation Assist

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com
`;

console.log("[send-flow-email] booted.",
  "Has Resend key:", !!RESEND_API_KEY,
  "From:", MAIL_FROM,
  "Test override:", TEST_OVERRIDE || "(none)");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  if (!RESEND_API_KEY) {
    return json({ ok: false, error: "RESEND_API_KEY not set on the Edge Function." }, 500);
  }

  let body: { run_id?: string; dry_run?: boolean; force?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400); }
  const runId = body.run_id;
  const dryRun = !!body.dry_run;
  const force  = !!body.force;  // explicit override to re-send even if already sent
  if (!runId) return json({ ok: false, error: "run_id is required" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Load run ──────────────────────────────────────────────────────────────
  const { data: run, error: runErr } = await supabase
    .from("automation_flow_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr || !run) {
    return json({ ok: false, error: "Run not found", detail: runErr?.message }, 404);
  }
  console.log("[send-flow-email] run", runId, "stage:", run.current_stage, "flow:", run.flow_key);

  // ── Resolve route + template ──────────────────────────────────────────────
  const route = STAGE_ROUTES[run.current_stage];
  if (!route) {
    return json({
      ok: false,
      error: `Current stage "${run.current_stage}" is not a sendable email/reminder stage.`,
    }, 400);
  }

  // ── Idempotency guard: don't double-send for the same stage ───────────────
  // Without this, a fast double-click on "Send now" OR a re-fired trigger
  // dialog would send twice. Reminder stages (e.g. reminder_weekly) are
  // intentionally allowed to repeat — they self-loop and SHOULD fire on each
  // scheduler tick. We only guard against same-stage duplicates within a
  // short window for non-reminder email stages.
  if (!force && !run.current_stage.startsWith("reminder_")) {
    const { data: prior } = await supabase
      .from("automation_flow_events")
      .select("id, occurred_at")
      .eq("run_id", runId)
      .eq("stage_key", run.current_stage)
      .eq("event_type", "email_sent")
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (prior && prior.length > 0) {
      console.log("[send-flow-email] email already sent for run", runId, "stage", run.current_stage, "— skipping");
      return json({
        ok: false,
        error: `Email already sent for this stage at ${prior[0].occurred_at}. Pass force:true to override.`,
        already_sent: true,
        sent_at: prior[0].occurred_at,
      }, 409);
    }
  }

  // Hospitals can override the default profile_sent_hospital template via
  // their own `template_key` field — honour it when present.
  let templateKey = route.template_key;
  const hospitalId = (run.metadata as Record<string, unknown>)?.hospital_id as string | undefined;
  let hospital: Record<string, unknown> | null = null;
  if (hospitalId) {
    const { data: hRow } = await supabase
      .from("hospitals")
      .select("*")
      .eq("id", hospitalId)
      .maybeSingle();
    hospital = hRow;
    if (run.current_stage === "email_hospital" && hRow?.template_key) {
      console.log("[send-flow-email] using hospital override template:", hRow.template_key);
      templateKey = String(hRow.template_key);
    }
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("*")
    .eq("key", templateKey)
    .single();
  if (tplErr || !tpl) {
    return json({ ok: false, error: `Template "${templateKey}" not found`, detail: tplErr?.message }, 404);
  }

  // ── Load doctor profile (Phase 2) ────────────────────────────────────────
  // For email_hospital + multi-doctor batches, the template needs structured
  // fields (title, bio, years experience, etc.) that don't exist in Zoho.
  // Mirrors profileToTokens() in src/hooks/use-doctor-profiles.ts — keep both
  // in sync when adding new fields.
  let profileTokens: Record<string, string> = {};
  if (run.doctor_id) {
    const { data: prof } = await supabase
      .from("doctor_profiles")
      .select("*")
      .eq("doctor_id", run.doctor_id)
      .maybeSingle();
    if (prof) {
      profileTokens = {
        doctor_title:              String(prof.title              ?? ""),
        doctor_bio:                String(prof.bio                ?? ""),
        doctor_area_of_interest:   String(prof.area_of_interest   ?? ""),
        doctor_country_training:   String(prof.country_training   ?? ""),
        doctor_years_experience:   prof.years_experience != null ? String(prof.years_experience) : "",
        doctor_nationality:        String(prof.nationality        ?? ""),
        doctor_age:                prof.age != null              ? String(prof.age) : "",
        doctor_marital_status:     String(prof.marital_status     ?? ""),
        doctor_family_status:      String(prof.family_status      ?? ""),
        doctor_license:            String(prof.license            ?? ""),
        doctor_salary_expectation: String(prof.salary_expectation ?? ""),
        doctor_notice_period:      String(prof.notice_period      ?? ""),
      };
      console.log("[send-flow-email] loaded doctor profile for", run.doctor_id);
    }
  }

  // ── Generate CV upload link for the onboarding welcome email ─────────────
  // The onboarding_welcome template references `{{upload_link}}` — without
  // a real URL it renders as the literal "{{upload_link}}" in the doctor's
  // inbox. We auto-generate a cv_uploads token here and build the URL so
  // every onboarding email ships with a working upload button, no separate
  // "Send CV upload link" click needed from the team.
  let bundledUploadLink = "";
  if (run.current_stage === "send_onboarding_email" && run.doctor_id) {
    try {
      // Reuse an existing pending token for this doctor if one exists, so
      // re-sending the welcome doesn't spawn N orphan tokens.
      const { data: existingUpload } = await supabase
        .from("cv_uploads")
        .select("token, expires_at")
        .eq("doctor_id", run.doctor_id)
        .eq("status", "pending_upload")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let token = existingUpload?.token ?? "";
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        await supabase.from("cv_uploads").insert({
          doctor_id:    run.doctor_id,
          doctor_name:  run.doctor_name,
          doctor_email: run.doctor_email,
          token,
          status:       "pending_upload",
          created_by:   "onboarding_auto",
        });
      }
      bundledUploadLink = `${APP_ORIGIN.replace(/\/+$/, "")}/upload-cv/${token}`;
      console.log("[send-flow-email] bundled CV upload link for onboarding:", bundledUploadLink);
    } catch (e) {
      console.warn("[send-flow-email] could not bundle CV upload link (non-fatal):", e);
    }
  }

  // ── Build token vars ──────────────────────────────────────────────────────
  const md = (run.metadata ?? {}) as Record<string, unknown>;
  const vars: Record<string, string> = {
    ...profileTokens,
    doctor_name:        String(run.doctor_name ?? ""),
    doctor_email:       String(run.doctor_email ?? ""),
    doctor_phone:       String(run.doctor_phone ?? ""),
    doctor_speciality:  String(md.doctor_speciality ?? ""),
    hospital_name:      String(run.hospital ?? ""),
    hospital_contact_name: String(hospital?.primary_contact_name ?? ""),
    city:               String(hospital?.city ?? md.city ?? ""),
    country:            String(hospital?.country ?? ""),
    // Placeholder URLs/values for systems not yet wired. The sender renders
    // these as literal {{token}} when empty so test recipients can SEE what
    // would need to resolve.
    form_link:          String(md.form_link ?? ""),
    // Prefer the run-bundled upload link if we generated one above; fall
    // back to whatever was set in metadata.
    upload_link:        bundledUploadLink || String(md.upload_link ?? ""),
    profile_link:       String(md.profile_link ?? ""),
    guide_link:         String(md.guide_link ?? ""),
    payment_link:       String(md.payment_link ?? ""),
    hospital_profile_url:  String(md.hospital_profile_url ?? ""),
    hospital_description:  String(md.hospital_description ?? ""),
    amount:             String(md.amount ?? ""),
    due_date:           String(md.due_date ?? ""),
    days_overdue:       String(md.days_overdue ?? ""),
    interview_datetime: String(md.interview_datetime ?? ""),
    interview_format:   String(md.interview_format ?? ""),
    interview_link:     normalizeUrl(String(md.interview_link ?? "")),
    joining_date:       String(md.joining_date ?? ""),
    signature:          SIGNATURE_HTML,
    signature_text:     SIGNATURE_TEXT,
  };

  const subject = render(tpl.subject ?? "", vars);
  // HTML gets escaped token values (so a doctor name like "Dr. <Smith>" or
  // a Claude-extracted field with stray HTML doesn't break the layout or
  // become an XSS vector in a hospital recipient's inbox). Plain text gets
  // raw values.
  const html    = render(tpl.body_html || wrapHtml(tpl.body_text), vars, true);
  const text    = render(tpl.body_text ?? "", vars);

  // ── Pick recipient ────────────────────────────────────────────────────────
  // For Flow 2's hospital-stage, the recipient is the hospital's recruiter
  // email (not the doctor). For every other stage, the doctor.
  const stageRecipient =
    run.current_stage === "email_hospital"
      ? (hospital?.primary_recruiter_email as string | undefined)
      : (run.doctor_email as string | undefined);

  const actualRecipient = stageRecipient ?? "";
  const effectiveTo = TEST_OVERRIDE || actualRecipient;
  if (!effectiveTo) {
    return json({
      ok: false,
      error: `No recipient resolved. ${run.current_stage === "email_hospital" ? "Hospital has no recruiter email." : "Doctor has no email."} Set MAIL_TEST_RECIPIENT_OVERRIDE or populate the contact.`,
    }, 400);
  }

  // ── Dry run? Return preview without sending ───────────────────────────────
  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      preview: { from: MAIL_FROM, to: effectiveTo, subject, html, text },
      template_key: templateKey,
      stage: run.current_stage,
      next_stage: route.next_stage,
    }, 200);
  }

  // ── Send via Resend ───────────────────────────────────────────────────────
  console.log("[send-flow-email] sending to", effectiveTo, "(original:", actualRecipient + ")", "template:", templateKey);

  // Annotate with X-AA-* headers so we can trace runs from Resend's logs back
  // to dashboard rows if anything weird happens.
  const headers: Record<string, string> = {
    "X-AA-Run-Id":      String(run.id),
    "X-AA-Flow-Key":    String(run.flow_key),
    "X-AA-Stage-Key":   String(run.current_stage),
    "X-AA-Template":    templateKey,
  };
  if (TEST_OVERRIDE && actualRecipient && actualRecipient !== TEST_OVERRIDE) {
    headers["X-AA-Original-Recipient"] = actualRecipient;
  }

  // Per-run Reply-To address. Any reply to this lands at Resend Inbound
  // with the run_id encoded right in the recipient address — most accurate
  // matching strategy in inbound-hospital-reply. We also store it on the
  // run's metadata so the team can see in the timeline what address they'd
  // need to inspect inbound logs for.
  const replyToAddress = `reply-${run.id}@${MAIL_REPLY_DOMAIN}`;

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:     MAIL_FROM,
        to:       [effectiveTo],
        // When the test-override is a multi-address list, CC the rest of the
        // team so every test email lands in everyone's inbox.
        cc:       TEST_OVERRIDE_LIST.length > 1 ? TEST_OVERRIDE_LIST.slice(1) : undefined,
        reply_to: replyToAddress,
        subject,
        html,
        text,
        headers,
      }),
    });
  } catch (e) {
    console.error("[send-flow-email] fetch threw:", e);
    return json({ ok: false, error: "Network error reaching Resend", detail: String(e) }, 502);
  }

  const resendBody = await resendRes.text();
  if (!resendRes.ok) {
    console.error("[send-flow-email] Resend HTTP", resendRes.status, resendBody.slice(0, 500));
    // Append an error event so the run timeline shows what went wrong.
    await supabase.from("automation_flow_events").insert({
      run_id:     run.id,
      stage_key:  run.current_stage,
      event_type: "error",
      message:    `Resend rejected the send (HTTP ${resendRes.status}). ${truncate(resendBody, 300)}`,
      payload:    { http_status: resendRes.status, response: resendBody.slice(0, 500) },
    });
    return json({
      ok:     false,
      error:  `Resend API returned ${resendRes.status}`,
      detail: truncate(resendBody, 500),
    }, resendRes.status);
  }

  let messageId = "";
  try {
    const parsed = JSON.parse(resendBody) as { id?: string };
    messageId = parsed.id ?? "";
  } catch { /* empty body is fine */ }
  console.log("[send-flow-email] Resend OK, message_id:", messageId);

  // ── Write email_sent event + advance stage ────────────────────────────────
  await supabase.from("automation_flow_events").insert({
    run_id:     run.id,
    stage_key:  run.current_stage,
    event_type: "email_sent",
    message:    `Sent "${subject}" to ${effectiveTo}${TEST_OVERRIDE && actualRecipient !== TEST_OVERRIDE ? ` (test override; would have gone to ${actualRecipient})` : ""}.`,
    payload:    { resend_message_id: messageId, template_key: templateKey, original_recipient: actualRecipient, effective_recipient: effectiveTo },
  });

  const update: Record<string, unknown> = {
    current_stage: route.next_stage,
    last_event_at: new Date().toISOString(),
  };
  if (route.terminal_next) {
    update.status       = "completed";
    update.completed_at = new Date().toISOString();
  }
  await supabase.from("automation_flow_runs").update(update).eq("id", run.id);

  // Add an `entered` event on the new stage so its panel shows up in the
  // timeline immediately. Helps the UI feel responsive.
  await supabase.from("automation_flow_events").insert({
    run_id:     run.id,
    stage_key:  route.next_stage,
    event_type: route.terminal_next ? "completed" : "entered",
    message:    route.terminal_next ? "Flow completed." : "Awaiting next stage.",
  });

  // ── Auto-continue the chain ─────────────────────────────────────────────
  // For "bundled" email pairs (relocation guide + attestation; profile-sent
  // hospital + doctor notification), fire the next email immediately rather
  // than making the team click Send now twice. Fire-and-forget — we don't
  // wait on the chained send before responding to the original caller.
  if (route.auto_continue && !route.terminal_next) {
    console.log("[send-flow-email] auto-continuing to", route.next_stage);
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-flow-email`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ run_id: run.id }),
    }).catch(e => console.error("[send-flow-email] auto-continue invoke threw:", e));
  }

  return json({
    ok:         true,
    message_id: messageId,
    to:         effectiveTo,
    subject,
    next_stage: route.next_stage,
    completed:  !!route.terminal_next,
    auto_continued: !!route.auto_continue,
  }, 200);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Mustache-ish renderer. Mirrors src/hooks/use-email-templates.ts → renderTemplate.
 *  When `html` is true, every token VALUE gets HTML-escaped before insertion so
 *  arbitrary text (Claude extractions, doctor names with stray `<` chars, etc.)
 *  can't break the email's HTML structure. The template HTML itself is left
 *  untouched — only inserted values are escaped.
 *
 *  Also supports Mustache-style conditional sections: `{{#token}}...{{/token}}`
 *  renders the inner block only if `token` has a truthy value. Used for
 *  optional content like the Join Interview button. */
// Tokens whose values are pre-rendered HTML (signature block, etc) and so
// must NOT be HTML-escaped during template substitution. Anything not in
// this set is treated as untrusted text and escaped.
const RAW_HTML_TOKENS = new Set(["signature", "doctors_table_html"]);

function render(body: string, vars: Record<string, string>, html = false): string {
  // Pass 1: conditional sections
  body = body.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return "";
    return inner;
  });
  // Pass 2: variable substitution
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    if (!html) return v;
    return RAW_HTML_TOKENS.has(key) ? v : escapeHtml(v);
  });
}

/** If a token value looks like a URL but is missing a protocol (very common
 *  when people paste links like "meet.google.com/abc"), prepend https:// so
 *  the href works. Returns "" unchanged so the conditional section still
 *  hides correctly when there's no link. */
function normalizeUrl(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;  // already has scheme
  if (/^(mailto:|tel:|sms:)/i.test(trimmed))    return trimmed;  // special schemes
  return `https://${trimmed}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wrap plain-text body in a minimal HTML envelope so non-HTML templates still
 *  render reasonably for clients that prefer html parts. */
function wrapHtml(text: string): string {
  const escaped = (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="font-family: -apple-system, system-ui, sans-serif; font-size: 14px; line-height: 1.5; white-space: pre-wrap; max-width: 640px;">${escaped}</pre>`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
