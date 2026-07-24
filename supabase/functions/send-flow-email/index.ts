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
  // Flow 5 · Contract Check-in (Ammar 2026-06-03: HI doesn't send the
  // contract — hospital does. These are nudges to both sides while we
  // wait for the doctor to confirm signature.)
  checkin_doctor:         { template_key: "contract_checkin_doctor",     next_stage: "checkin_hospital", auto_continue: true },
  checkin_hospital:       { template_key: "contract_checkin_hospital",   next_stage: "awaiting_signature" },
  reminder_signature:     { template_key: "contract_checkin_reminder",   next_stage: "contract_signed", terminal_next: true },
  // Flow 6 · Relocation — guide then attestation. They used to auto-chain
  // (guide send fired attestation blind), but the team wants to preview &
  // send each one explicitly, so the guide advances to send_attestation_email
  // and PAUSES there for the dedicated "Send attestation info" button.
  send_relocation_email:  { template_key: "relocation_guide",         next_stage: "send_attestation_email" },
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
const MAIL_FROM      = Deno.env.get("MAIL_FROM") ?? "Hospital Intro <hospitalintro@allocationassist.com>";
// When set, EVERY outbound email is redirected here regardless of the
// real recipient. Required while sending from onboarding@resend.dev (Resend
// only allows that to deliver to the account owner). Drop this env var once
// a real sending domain is verified.
// Accepts a comma-separated list — first address goes on To:, rest on Cc:
// so every team member sees test emails as they go out.
const TEST_OVERRIDE_LIST = (Deno.env.get("MAIL_TEST_RECIPIENT_OVERRIDE") ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);
const TEST_OVERRIDE      = TEST_OVERRIDE_LIST[0] ?? "";
// AA's fixed second-payment (placement-fee) amount, used on the invoice +
// reminder emails when a per-run override isn't set.
const SECOND_PAYMENT_AMOUNT = "AED 10,500";
// Subdomain dedicated to receiving replies — outgoing emails set
// `Reply-To: reply-<run_id>@<MAIL_REPLY_DOMAIN>`, so a hospital reply lands
// at Resend Inbound carrying the run_id right in the address. Strongest
// matching strategy in inbound-hospital-reply.
const MAIL_REPLY_DOMAIN = Deno.env.get("MAIL_REPLY_DOMAIN") ?? "reply.allocationassist.com";
// App's public origin — used to render the CV upload link the onboarding
// email embeds. e.g. https://allocationassist.com
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://allocationassist.com";

// ── Per-sender From / signature registry ─────────────────────────────────────
// Each HI team member sends from their own @allocationassist.com address
// so recipients see a real person. The display-name + first-name pair
// powers both the From header AND the sign-off in the branded signature.
//
// To add or change a sender: bump this map. To temporarily fall back to
// the generic team address (e.g. domain still verifying), unset
// assigned_to on the run or remove the entry here.
//
// Keys are lowercased — assigned_to may be saved with original casing.
interface SenderProfile { displayName: string; firstName: string; lastName: string; email: string; title: string; phone: string; }
const SENDERS: Record<string, SenderProfile> = {
  "rodaina@allocationassist.com":        { displayName: "Rodaina Thabit",  firstName: "Rodaina", lastName: "Thabit",  email: "rodaina@allocationassist.com",        title: "Hospital Introduction Officer", phone: "" },
  "mohamed.othman@allocationassist.com": { displayName: "Mohamed Othman",  firstName: "Mohamed", lastName: "Othman",  email: "mohamed.othman@allocationassist.com", title: "Hospital Introduction Officer", phone: "" },
  "sohaila@allocationassist.com":        { displayName: "Sohaila Mohamed", firstName: "Sohaila", lastName: "Mohamed", email: "sohaila@allocationassist.com",        title: "Hospital Introduction Officer", phone: "" },
  "ishak@allocationassist.com":          { displayName: "Ishak Boulaat",   firstName: "Ishak",   lastName: "Boulaat", email: "ishak@allocationassist.com",          title: "Hospital Introduction Officer", phone: "" },
  "ammar@allocationassist.com":          { displayName: "Ammar",            firstName: "Ammar",   lastName: "",        email: "ammar@allocationassist.com",          title: "Founder",                       phone: "" },
  // Generic company sender — Allocation Assist is a referral agency, so profile
  // sends default to this rather than a specific person. Signs off as the team.
  "hello@allocationassist.com":          { displayName: "Allocation Assist Team", firstName: "The Allocation Assist", lastName: "team", email: "hello@allocationassist.com", title: "", phone: "" },
};

/** Resolve the From line + signature variant from a run's assigned_to. */
function pickSender(assignedTo: string | null | undefined): { fromHeader: string; replyHint: string; first: string; last: string; title: string; phone: string } {
  const key = (assignedTo ?? "").trim().toLowerCase();
  const s = SENDERS[key];
  if (s) {
    return {
      fromHeader: `${s.displayName} <${s.email}>`,
      // hello@ is the generic company From but has no real mailbox — route its
      // replies through the parser address (reply-<run_id>@) so the dashboard
      // Replies inbox captures them, instead of the dead hello@ box. Real people
      // keep personal routing (replies land in their Gmail).
      replyHint:  key === "hello@allocationassist.com" ? "" : s.email,
      first:      s.firstName,
      last:       s.lastName,
      title:      s.title,
      phone:      s.phone,
    };
  }
  // No assigned owner or owner not in the registry → fall back to the
  // generic team address from env. Keeps sends working during the
  // Resend domain-verification window or for runs the team hasn't
  // claimed yet.
  return {
    fromHeader: MAIL_FROM,
    replyHint:  "",
    first:      "The Allocation Assist team",
    last:       "",
    title:      "Allocation Assist",
    phone:      "",
  };
}

/** Signature variant — matches Ammar's reference exactly (2026-06-06):
 *  teal "Warmest Regards," → teal "Firstname Lastname," → teal title →
 *  teal phone (when known) → grey JLT location with pin glyph →
 *  blue website link → bottom teal "Allocation Assist" + grey tagline.
 *  No box, no logo image, no card frame — just a plain text-only block
 *  that lands looking identical to Plinky's manual sends. */
// Email body + signature font: Garamond ("all emails Garamond, Large"). This
// governs every paragraph (plainifyBody strips the DB template's own styling,
// so the wrapper font is what's inherited).
const FONT_STACK  = "Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif";
// CARD font: Poppins — the allocationassist.com website's body font. Scoped to
// the profile card ONLY (team 2026-06-12: "use the website font just for the
// website html, not all of it") so the card reads like their website while the
// rest of the email stays Garamond.
const CARD_FONT   = "'Poppins', 'Helvetica Neue', Helvetica, Arial, sans-serif";
// Web-font link prepended to the email HTML so clients that support it (Apple
// Mail + the dashboard previews) render real Poppins in the card. Stripped
// harmlessly by clients that don't support <style>/@import (they use the
// Helvetica/Arial fallback). Gmail/Outlook won't load it — expected.
const FONT_IMPORT = `<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');</style>`;

// Public URL for the logo image (uploaded to the email-assets bucket,
// migration 20260608000004). Lives on Supabase Storage so email clients
// hot-link without auth.
const LOGO_URL = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/logo.png`;
// Teal line-icons for the profile-card fact grid — rasterised Lucide PNGs in the
// email-assets bucket (SVG/icon-fonts don't render in most email clients). Each
// fact label maps to one icon file. Keep in sync with FACT_ICON in
// SendProfileDialog.tsx and the uploaded files under email-assets/icons/.
const ICON_BASE = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/icons`;
const FACT_ICON: Record<string, string> = {
  "Subspecialty": "activity", "Title / rank": "badge", "Country of training": "graduation-cap",
  "Years of experience": "calendar-days", "Current location": "map-pin", "Targeted locations": "target",
  "Nationality": "globe", "Age": "id-card", "Date of birth": "calendar", "Marital status": "heart",
  "Family status": "users", "Languages": "languages", "English level": "book-open",
  "UAE license": "award", "License types": "badge-check", "Salary expectation": "banknote",
  "Notice period": "clipboard-check",
};

function signatureHtml(first: string, last: string, title: string, phone: string): string {
  const fullName = [first, last].filter(Boolean).join(" ") || "Allocation Assist";
  const teal     = `color:#14b8a6;font-weight:700;font-size:16px;margin:0 0 2px;line-height:1.45;font-family:${FONT_STACK};`;
  const grey     = `color:#475569;font-size:15px;margin:6px 0 2px;line-height:1.45;font-family:${FONT_STACK};`;
  const linkLine = `font-size:15px;margin:2px 0 16px;line-height:1.45;font-family:${FONT_STACK};`;
  return `
<p style="margin:24px 0 0;font-family:${FONT_STACK};font-size:16px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="${teal}">Warmest Regards,</p>
<p style="${teal}">${escapeHtml(fullName)}</p>
${title ? `<p style="${teal}">${escapeHtml(title)}</p>` : ""}
${phone ? `<p style="${teal}">${escapeHtml(phone)}</p>` : ""}
<p style="${grey}"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="${linkLine}"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr>
    <td style="padding:0;">
      <img src="${LOGO_URL}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" />
    </td>
  </tr>
</table>`;
}
function signatureText(first: string, last: string, title: string, phone: string): string {
  const fullName = [first, last].filter(Boolean).join(" ") || "Allocation Assist";
  return [
    "",
    "",
    "Warmest Regards,",
    fullName,
    title || "",
    phone  || "",
    "Jumeirah Lakes Towers, Dubai, UAE",
    "www.allocationassist.com",
  ].filter(line => line !== null).join("\n");
}

// Allocation Assist branded signature block. Matches the layout Ammar uses
// in his manual sends (teal "Warmest Regards", name + title + company, JLT
// address with pin icon, website link, logo at bottom). The block is now
// generated per-sender by signatureHtml() / signatureText() above —
// the first line picks up the actual sender's name instead of the
// generic 'The Allocation Assist team'.

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

  let body: {
    run_id?: string; dry_run?: boolean; force?: boolean;
    preview_stage?: string; preview_metadata?: Record<string, unknown>;
    // Per-send overrides from the editable preview — see the matching block in
    // send-batch. When present, these replace the template-rendered subject/body
    // on a real send so the team's edits ship verbatim. Ignored on a dry run
    // (the preview always reflects the freshly-rendered template) and NOT
    // forwarded to auto-continue sends, so a bundled follow-up (e.g. the doctor
    // heads-up after the hospital intro) still uses its own template.
    subject_override?: string; html_override?: string; text_override?: string;
    // Per-send CC / BCC from the preview's CcBccPicker. When present these win
    // over the run's metadata.cc_override / bcc_override, so any flow email can
    // loop in extra recipients at send time.
    cc_override?: string[]; bcc_override?: string[];
    // Per-send recipient override from the preview's editable To field. When a
    // valid email, it REPLACES the stage's resolved recipient for this one send
    // (Mitchell: "a dedicated field for the doctors' email address … change the
    // address of where it's sent"). Ignored on dry runs and never forwarded to
    // auto-continue sends. TEST_OVERRIDE still wins over it.
    to_override?: string;
    // One-shot attachments for THIS send (already uploaded to the public
    // email-attachments bucket — entries are { filename, path:<https URL> }).
    // Used by FlowSendPreviewDialog so any flow email can carry a CV/doc. Only
    // consulted when the run's metadata has no per-stage attachments, and NOT
    // forwarded to auto-continue sends (they re-invoke with run_id only).
    attachments?: Array<{ filename?: string; path?: string }>;
  };
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
  // Preview override: on a dry run, the caller can ask to render the email for
  // a stage the run hasn't entered yet (e.g. a "Confirm shortlist" button
  // previewing send_shortlist_email before advancing). Mutating the in-memory
  // run object — never persisted on a dry run — makes EVERY downstream renderer
  // (route/template, stage-gated attachment + token blocks, {{city}} etc.)
  // reflect the previewed step with no other code changes.
  if (dryRun && body.preview_stage) {
    run.current_stage = body.preview_stage;
    if (body.preview_metadata && typeof body.preview_metadata === "object") {
      run.metadata = { ...((run.metadata as Record<string, unknown>) ?? {}), ...body.preview_metadata };
    }
  }
  console.log("[send-flow-email] run", runId, "stage:", run.current_stage, "flow:", run.flow_key, dryRun ? "(dry-run)" : "");

  // Resolve the sender for this run based on assigned_to. Falls back
  // to the generic MAIL_FROM env when the owner isn't in the registry.
  const sender = pickSender(run.assigned_to as string | null | undefined);
  console.log("[send-flow-email] sender:", sender.fromHeader, "(assigned_to:", run.assigned_to, ")");

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
  if (!force && !dryRun && !run.current_stage.startsWith("reminder_")) {
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
    // The doctor "working opportunity" email likewise defers to the hospital's
    // own template (its profile_sent_doctor_<hospital> variant) — that's where
    // the {{hospital_image}} slot + per-hospital blurb live. Set in the Profile
    // Sent hospital-templates editor; a per-send pick below still wins.
    if (run.current_stage === "email_doctor" && hRow?.doctor_template_key) {
      console.log("[send-flow-email] using hospital doctor template:", hRow.doctor_template_key);
      templateKey = String(hRow.doctor_template_key);
    }
  }

  // Per-send template pick (Amir #3). The Send Profile dialog can choose which
  // template each stage uses; it stores the keys in metadata.template_overrides
  // keyed by stage. This wins over the route default AND the hospital default,
  // and renders server-side with this run's own tokens — so a picked template
  // works for a multi-hospital BCC batch (each run renders its own). Single-
  // hospital sends also carry the pick via stage_overrides (pre-rendered), so
  // the feature works before this function is redeployed.
  const tplOverrides = (run.metadata as { template_overrides?: Record<string, string> } | null)?.template_overrides;
  if (tplOverrides && tplOverrides[run.current_stage]) {
    console.log("[send-flow-email] using per-send template override:", tplOverrides[run.current_stage]);
    templateKey = String(tplOverrides[run.current_stage]);
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("email_templates")
    .select("*")
    .eq("key", templateKey)
    .single();
  if (tplErr || !tpl) {
    return json({ ok: false, error: `Template "${templateKey}" not found`, detail: tplErr?.message }, 404);
  }

  // ── Load doctor profile tokens (WP candidate is source of truth) ───────
  // For email_hospital + multi-doctor batches the template needs structured
  // fields (title, area of interest, years experience, etc.) that don't
  // exist in Zoho.
  //
  // Source priority:
  //   1. wordpress_candidates row linked via doctor_id (canonical going
  //      forward — same record the Profiles tab edits live).
  //   2. legacy doctor_profiles row — fills any token WP doesn't have.
  //
  // Mirrors wpCandidateToTokens() + profileToTokens() in the frontend hooks;
  // keep them in lockstep when adding new tokens.
  let profileTokens: Record<string, string> = {};
  if (run.doctor_id) {
    // Step 1: WP candidate. The picker is Zoho-sourced (dob:/lead: ids) and a
    // candidate's WP record is often NOT linked by doctor_id (email/name
    // mismatch), or the doctor is website-only (wp:<id>). So resolve the same
    // way the batch path does: wp:<id> → linked doctor_id → phone → email →
    // name. Without this a fully-filled WP profile renders as {{tokens}}.
    const did = String(run.doctor_id);
    const sel = () => supabase.from("wordpress_candidates").select("*");
    let wp: Record<string, any> | null = null;  // eslint-disable-line @typescript-eslint/no-explicit-any
    if (did.startsWith("wp:")) {
      const numId = Number(did.slice(3));
      if (Number.isFinite(numId)) wp = (await sel().eq("id", numId).maybeSingle()).data ?? null;
    }
    if (!wp) {
      wp = (await sel().eq("doctor_id", did)
        .order("wp_modified", { ascending: false, nullsFirst: false }).limit(1).maybeSingle()).data ?? null;
    }
    if (!wp && run.doctor_phone) {
      const k = String(run.doctor_phone).replace(/\D/g, "").slice(-9);
      if (k.length === 9) wp = (await sel().ilike("phone", `%${k}%`).limit(1).maybeSingle()).data ?? null;
    }
    if (!wp && run.doctor_email) {
      wp = (await sel().ilike("email", String(run.doctor_email).trim()).limit(1).maybeSingle()).data ?? null;
    }
    if (!wp && run.doctor_name) {
      const clean = String(run.doctor_name).replace(/^(dr|doctor|prof|mr|mrs|ms|miss)\.?\s+/i, "").trim();
      if (clean) {
        const { data: byName } = await sel().ilike("full_name", `%${clean}%`).limit(2);
        if (Array.isArray(byName) && byName.length === 1) wp = byName[0];
      }
    }
    if (wp) {
      const age = computeAgeFromDob(wp.date_of_birth);
      profileTokens = {
        doctor_title:              String(wp.job_title              ?? ""),
        doctor_bio:                String(wp.area_of_interest       ?? ""),  // WP has no bio; closest analogue
        doctor_area_of_interest:   formatAreasOfInterest(wp.area_of_interest as string | null, { fallback: String(wp.specialty ?? wp.job_title ?? "") }),
        doctor_country_training:   String(wp.country_of_training    ?? ""),
        doctor_years_experience:   wp.years_experience != null ? String(wp.years_experience) : "",
        doctor_nationality:        String(wp.nationality            ?? ""),
        doctor_age:                age != null ? String(age) : "",
        doctor_dob:                formatDobLong(wp.date_of_birth),
        doctor_marital_status:     String(wp.family_status          ?? ""),  // WP doesn't separate marital
        doctor_family_status:      String(wp.family_status          ?? ""),
        doctor_license:            String(wp.license_status         ?? ""),
        doctor_salary_expectation: String(wp.expected_salary        ?? ""),
        doctor_notice_period:      String(wp.notice_period          ?? ""),
        // Extras from the richer WP record — templates can reference these
        // as we iterate the copy.
        doctor_photo_url:          String(wp.photo_url              ?? ""),
        doctor_specialty:          String(wp.specialty              ?? ""),
        doctor_subspecialty:       String(wp.subspecialty           ?? ""),
        doctor_rank:               String(wp.rank                   ?? ""),
        doctor_languages:          String(wp.languages              ?? ""),
        doctor_english_level:      String(wp.english_level          ?? ""),
        doctor_current_location:   String(wp.current_location       ?? ""),
        doctor_targeted_locations: Array.isArray(wp.targeted_locations) ? wp.targeted_locations.join(", ") : "",
        doctor_license_types:      Array.isArray(wp.license_types)      ? wp.license_types.join(", ")      : "",
        doctor_cv_url:             String(wp.cv_url                 ?? ""),
        doctor_wp_link:            String(wp.wp_link                ?? ""),
      };
      console.log("[send-flow-email] WP candidate tokens loaded for", run.doctor_id);
    }

    // Step 2: legacy doctor_profiles — fills any token WP didn't have.
    const { data: prof } = await supabase
      .from("doctor_profiles")
      .select("*")
      .eq("doctor_id", run.doctor_id)
      .maybeSingle();
    if (prof) {
      const fallback: Record<string, string> = {
        doctor_title:              String(prof.title              ?? ""),
        doctor_bio:                String(prof.bio                ?? ""),
        doctor_area_of_interest:   formatAreasOfInterest(prof.area_of_interest as string | null, { fallback: String(prof.specialty ?? prof.title ?? "") }),
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
      // Fold in any field WP left empty.
      for (const [k, v] of Object.entries(fallback)) {
        if (v && !profileTokens[k]) profileTokens[k] = v;
      }
      console.log("[send-flow-email] legacy doctor_profiles fallback applied for", run.doctor_id);
    }
  }

  // ── Staged-profile fallback (works WITHOUT a doctor_id too) ──────────────
  // If WP + legacy doctor_profiles left tokens empty, look the candidate up
  // in staged_doctor_profiles. Match priority:
  //   1. doctor_id literal `staged:<uuid>` if present
  //   2. run.doctor_email
  //   3. run.doctor_name
  // This is what makes test-sends and pre-publish demos work: the staging
  // area is the canonical source of truth right up until Publish, so the
  // email rendering should be too.
  const needsStagedFallback = !profileTokens.doctor_bio && !profileTokens.doctor_title;
  if (needsStagedFallback) {
    let stagedRow: Record<string, unknown> | null = null;
    const did = String(run.doctor_id ?? "");
    if (did.startsWith("staged:")) {
      const { data } = await supabase.from("staged_doctor_profiles").select("*").eq("id", did.slice(7)).maybeSingle();
      stagedRow = data;
    }
    if (!stagedRow && run.doctor_email) {
      const { data } = await supabase.from("staged_doctor_profiles").select("*").eq("email", run.doctor_email).order("created_at", { ascending: false }).limit(1).maybeSingle();
      stagedRow = data;
    }
    if (!stagedRow && run.doctor_name) {
      const { data } = await supabase.from("staged_doctor_profiles").select("*").eq("full_name", run.doctor_name).order("created_at", { ascending: false }).limit(1).maybeSingle();
      stagedRow = data;
    }
    if (stagedRow) {
      const sacf = (stagedRow.acf ?? {}) as Record<string, unknown>;
      const age = computeAgeFromDob(sacf.date_of_birth as string | undefined);
      const sFallback: Record<string, string> = {
        doctor_title:              String(sacf.job_title              ?? ""),
        doctor_bio:                String(sacf.bio                    ?? ""),
        doctor_area_of_interest:   formatAreasOfInterest(sacf.specific_areas_of_interests_within_the_specialization as string | null, { fallback: String(sacf.specialty ?? sacf.job_title ?? "") }),
        doctor_country_training:   String(sacf.country_of_training    ?? ""),
        doctor_years_experience:   sacf.years_of_experience_post_specialization != null ? String(sacf.years_of_experience_post_specialization) : "",
        doctor_nationality:        String(sacf.nationality            ?? ""),
        doctor_age:                age != null ? String(age) : "",
        doctor_dob:                formatDobLong(sacf.date_of_birth as string | undefined),
        doctor_marital_status:     String(sacf.marital_status         ?? ""),
        doctor_family_status:      String(sacf.family_status          ?? ""),
        doctor_license:            String(sacf.dha__haad__moh_license ?? ""),
        doctor_salary_expectation: String(sacf.expected_salary        ?? ""),
        doctor_notice_period:      String(sacf.notice_period          ?? ""),
        doctor_specialty:          String(sacf.specialty              ?? (stagedRow.specialty as string ?? "")),
        doctor_subspecialty:       String(sacf.subspecialty           ?? ""),
        doctor_languages:          String(sacf.languages              ?? ""),
        doctor_english_level:      String(sacf.english_level          ?? ""),
        doctor_current_location:   String(sacf.current_location       ?? ""),
        doctor_targeted_locations: Array.isArray(sacf.targeted_locations) ? (sacf.targeted_locations as string[]).join(", ") : "",
      };
      for (const [k, v] of Object.entries(sFallback)) if (v && !profileTokens[k]) profileTokens[k] = v;
      console.log(`[send-flow-email] staged fallback applied (id=${stagedRow.id}) — ${Object.keys(profileTokens).length} tokens`);
    }
  }

  // Area of Interest now renders as a SHORT "A, B & C" line
  // (formatAreasOfInterest, applied above) in its own data-table column — short
  // enough not to blow out the table, which was the original reason it had been
  // dropped. Empty for doctors with no area_of_interest on file.

  // ── Lookup per-emirate relocation guide URL ─────────────────────────────
  // Ammar 2026-06-03: 'we sent it for Dubai Abu Dhabi and all of them'.
  // Resolve by the hospital's city → relocation_articles.url, used to
  // set {{guide_link}} in the relocation_guide template. Falls back to
  // an empty string which the template renders as a generic "we'll
  // share it with you separately" line.
  let resolvedGuideLink = "";
  let resolvedGuideLabel = "";
  if (run.current_stage === "send_relocation_email" && hospital?.city) {
    try {
      const { data: art } = await supabase
        .from("relocation_articles")
        .select("url, label")
        .eq("city", hospital.city)
        .maybeSingle();
      if (art?.url) {
        resolvedGuideLink  = String(art.url);
        resolvedGuideLabel = String(art.label ?? "");
      }
    } catch (e) {
      console.warn("[send-flow-email] relocation_articles lookup failed (non-fatal):", e);
    }
  }

  // ── Attach the relocation-guide PDFs ────────────────────────────────────
  // Ammar sends the guide as PDF attachments, not a link. The files live in
  // the public `relocation-guides` bucket: the shared pack (schools, apps,
  // rental prices) sits in `_default/`, and each city's own relocation guide
  // sits in its slug folder (dubai/, abu-dhabi/, al-ain/, sharjah/…). We
  // attach `_default` + the city folder, so each doctor gets the shared pack
  // PLUS their city's guide. (A same-named file in the city folder overrides
  // the default.) Resend fetches each `path` URL; we encode it so filenames
  // with spaces work.
  const relocationAttachments: Array<{ filename: string; path: string }> = [];
  if (run.current_stage === "send_relocation_email") {
    try {
      const sbUrl    = Deno.env.get("SUPABASE_URL") ?? "";
      // Resolve the relocation city the SAME way the {{city}} token does
      // (line ~596): hospital.city, else the city picked at select_city_guide
      // (stored in run.metadata.city). Reading only hospital.city meant a
      // manually-picked city (e.g. "Al Ain") attached only the _default pack,
      // never the city's own guide folder.
      const citySlug = String(hospital?.city ?? (run.metadata as Record<string, unknown> | null)?.city ?? "")
        .toLowerCase().trim().replace(/\s+/g, "-");
      const byName = new Map<string, string>();   // filename → public URL
      for (const folder of ["_default", citySlug].filter(Boolean)) {
        const { data: files } = await supabase.storage
          .from("relocation-guides")
          .list(folder, { limit: 100, sortBy: { column: "name", order: "asc" } });
        for (const f of (files ?? [])) {
          if (!f.name.toLowerCase().endsWith(".pdf")) continue;
          byName.set(
            f.name,
            `${sbUrl}/storage/v1/object/public/relocation-guides/${folder}/${encodeURIComponent(f.name)}`,
          );
        }
      }
      for (const [filename, path] of byName) relocationAttachments.push({ filename, path });
      console.log(`[send-flow-email] relocation attachments for "${hospital?.city ?? "?"}": ${relocationAttachments.length}`);
    } catch (e) {
      console.warn("[send-flow-email] relocation attachment listing failed (non-fatal):", e);
    }
  }

  // ── Mint shared-profile token for profile_sent_hospital sends ───────────
  // Each hospital recipient gets their own tokenised URL pointing at the
  // dashboard's /shared-profile/:token route (Ammar 2026-06-03 — hospitals
  // can't see profiles on the AA website without a login, so the email
  // CTA links here instead). Token persists 90d by default.
  let mintedProfileUrl = "";
  if (run.current_stage === "email_hospital" && run.doctor_id) {
    try {
      // Reuse an existing non-revoked token for this run if there is one,
      // so re-sends don't proliferate tokens.
      const { data: existingTok } = await supabase
        .from("shared_profile_tokens")
        .select("token, expires_at, revoked_at")
        .eq("run_id", run.id)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let token = existingTok?.token ?? "";
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        await supabase.from("shared_profile_tokens").insert({
          token,
          doctor_id:   run.doctor_id,
          doctor_name: run.doctor_name,
          hospital:    run.hospital,
          run_id:      run.id,
          created_by:  "send-flow-email",
        });
      }
      mintedProfileUrl = `${APP_ORIGIN.replace(/\/+$/, "")}/shared-profile/${token}`;
      console.log("[send-flow-email] minted shared-profile URL:", mintedProfileUrl);
    } catch (e) {
      console.warn("[send-flow-email] could not mint shared-profile token (non-fatal):", e);
    }
  }

  // (Removed: the onboarding CV-upload-link bundling — the team no longer
  // emails doctors a CV-upload link. The upload_link token now renders empty.)

  // ── Build token vars ──────────────────────────────────────────────────────
  const md = (run.metadata ?? {}) as Record<string, unknown>;
  const vars: Record<string, string> = {
    ...profileTokens,
    doctor_name:        String(run.doctor_name ?? ""),
    doctor_email:       String(run.doctor_email ?? ""),
    doctor_phone:       String(run.doctor_phone ?? ""),
    doctor_speciality:  String(md.doctor_speciality ?? ""),
    hospital_name:      String(run.hospital ?? ""),
    // Greeting name — per-hospital toggle (hospitals.greet_with_contact_name):
    // ON → the chosen recipient's own name (metadata.hospital_contact_name,
    // set by the send screen for the primary/cycle/override contact), falling
    // back to the hospital's primary_contact_name, then the hospital name.
    // OFF → the hospital name.
    hospital_contact_name: String(
      hospital?.greet_with_contact_name
        ? (String((md as { hospital_contact_name?: string }).hospital_contact_name ?? "").trim()
           || String(hospital?.primary_contact_name ?? "").trim()
           || (run.hospital ?? ""))
        : (run.hospital ?? ""),
    ),
    city:               String(hospital?.city ?? md.city ?? ""),
    country:            String(hospital?.country ?? ""),
    // Placeholder URLs/values for systems not yet wired. The sender renders
    // these as literal {{token}} when empty so test recipients can SEE what
    // would need to resolve.
    form_link:          String(md.form_link ?? ""),
    // CV-upload link removed — the team no longer collects CVs via an emailed
    // link. Kept as an empty token so any legacy template reference is blank.
    upload_link:        "",
    profile_link:       String(md.profile_link ?? ""),
    // profile_url drives the "View full profile online" CTA. Prefer
    // the per-run minted shared-profile token (B5) over any pre-set
    // metadata; final fallback is the AA homepage so the button isn't
    // dead-on-arrival if minting failed.
    profile_url:        mintedProfileUrl || String(md.profile_url ?? "https://www.allocationassist.com"),
    // Prefer the city-resolved guide URL (B6) over any pre-set
    // metadata so per-emirate articles surface automatically.
    guide_link:         resolvedGuideLink || String(md.guide_link ?? ""),
    guide_label:        resolvedGuideLabel || `Relocating to ${String(hospital?.city ?? "your new city")}`,
    payment_link:       String(md.payment_link ?? ""),
    hospital_profile_url:  String(md.hospital_profile_url ?? ""),
    hospital_description:  String(md.hospital_description ?? ""),
    // Hospital photo (RAW <img>) for working-opportunity emails — from the
    // hospital row's image_url; empty when the hospital has no photo on file, so
    // the {{hospital_image}} block simply disappears.
    hospital_image: (() => {
      const u = String((hospital as Record<string, unknown> | null)?.image_url ?? "").trim();
      return u ? `<img src="${u}" alt="${escapeHtml(String(run.hospital ?? "Hospital"))}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />` : "";
    })(),
    // Second-payment fee: fixed at AED 10,500 (Ammar 2026-06-11) unless a
    // per-run override is set. invoice_number / payment_link stay blank until
    // we have a source for them.
    amount:             String(md.amount || SECOND_PAYMENT_AMOUNT),
    invoice_number:     String(md.invoice_number ?? ""),
    invoice_issue_date: String(md.invoice_issue_date ?? ""),
    late_fee_amount:    String(md.late_fee_amount ?? ""),
    // Due date = explicit override, else 45 days after the logged joining date
    // (the AA second-payment terms the scheduler already assumes).
    due_date:           computeDueDate(md),
    days_overdue:       String(md.days_overdue ?? ""),
    interview_datetime: String(md.interview_datetime ?? ""),
    interview_format:   String(md.interview_format ?? ""),
    interview_link:     normalizeUrl(String(md.interview_link ?? "")),
    joining_date:       String(md.joining_date ?? ""),
    signature:          signatureHtml(sender.first, sender.last, sender.title, sender.phone),
    signature_text:     signatureText(sender.first, sender.last, sender.title, sender.phone),
    // logo_header used to live here as a top-of-email image. Pulled in
    // favour of putting the icon directly above the "Allocation Assist"
    // line in signatureHtml() — keeps the brand at the bottom (matching
    // the user's reference) AND avoids leaving a literal {{logo_header}}
    // token in the dashboard's template-editor preview, which doesn't
    // render server-side tokens.
    logo_header:        "",
  };
  // Rich profile card for the individual profile_sent_hospital email — the
  // website's coloured profile look, rendered in-email (table colour + CV /
  // full-profile buttons). Built from the vars above and injected as a RAW
  // token so it survives plainifyBody (which strips the DB template's styles).
  vars.doctor_card_html = doctorCardHtml(vars);
  // Card-as-image (Hasan): if the dispatcher captured a profile-card PNG in the
  // Send Profile dialog, its URL rides in metadata. The profile_sent_hospital
  // template renders it inline ABOVE the data table via the
  // {{#doctor_card_image_url}} section, then the table always follows — so the
  // hospital sees BOTH the pixel-perfect card (empty fields dropped) and the full
  // detail table. Empty string ⇒ just the table renders.
  vars.doctor_card_image_url = String(md.doctor_card_image_url ?? "").trim();
  // The full horizontal data row UNDER the card (team's existing hospital-comms
  // format), minus the Area of Interest column. Styled token so it survives
  // plainifyBody and keeps its coloured header.
  vars.doctor_row_table_html = doctorRowTableHtml(vars);

  const subject = collapseDoubledDr(render(tpl.subject ?? "", vars));
  // HTML gets escaped token values (so a doctor name like "Dr. <Smith>" or
  // a Claude-extracted field with stray HTML doesn't break the layout or
  // become an XSS vector in a hospital recipient's inbox). Plain text gets
  // raw values.
  //
  // plainifyBody strips fancy inline styling from the stored template body
  // (buttons / cards / coloured pills) BEFORE we splice in the signature.
  // The signature itself has to keep its own inline styles (teal sign-off,
  // logo block) so plainify runs only on the body source.
  const rawBody       = positionHospitalImage(tpl.body_html || wrapHtml(tpl.body_text));
  const plainBody     = plainifyBody(rawBody);
  const renderedBody  = collapseDoubledDr(render(plainBody, vars, true));
  // Wrap the rendered body in a serif container so every <p>/<table>
  // inherits the sans-serif look from the user's reference email.
  // Inline styles on individual elements still win (signature keeps
  // its teal-bold weight, link colour, etc.).
  const html          = `${FONT_IMPORT}<div style="font-family:${FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">${renderedBody}</div>`;
  const text          = collapseDoubledDr(render(tpl.body_text ?? "", vars));

  // Refuse to send templates that still carry the PLACEHOLDER stub copy
  // from the seed migrations. The template editor warns the team, but
  // this guard is what actually stops a misclick from shipping
  // "PLACEHOLDER — generic profile-introduction email…" to a hospital.
  // Dry-runs skip the guard so you can still preview a placeholder.
  const placeholderRe = /^\s*PLACEHOLDER\b|^\s*\(PLACEHOLDER\)/i;
  if (!dryRun && (placeholderRe.test(text) || placeholderRe.test(subject))) {
    return json({
      ok: false,
      error: `Template "${templateKey}" still contains PLACEHOLDER copy. Edit it in /automations → Email Templates before sending.`,
    }, 422);
  }

  // ── Pick recipient ────────────────────────────────────────────────────────
  // For Flow 2's hospital-stage, the recipient is the hospital's recruiter
  // email (not the doctor). For every other stage, the doctor.
  // For a hospital send, honour the routed recipient stored on the run
  // (metadata.hospital_email) — the Send Profile flow writes the hospital's
  // chosen contact there, or, for 'all' mode, a COMMA-JOINED list of every
  // eligible contact. Falls back to the hospital row's primary_recruiter_email.
  const routedHospitalEmail = String((run.metadata as Record<string, unknown> | null)?.hospital_email ?? "").trim();
  const stageRecipient =
    run.current_stage === "email_hospital"
      ? (routedHospitalEmail || (hospital?.primary_recruiter_email as string | undefined))
      : (run.doctor_email as string | undefined);

  // A valid To override from the preview replaces the resolved recipient for
  // this send (dry runs always preview the resolved recipient, so this only
  // bites on a real send). TEST_OVERRIDE still trumps everything.
  const toOverrideRaw = typeof body.to_override === "string" ? body.to_override.trim() : "";
  const toOverride    = !dryRun && toOverrideRaw.includes("@") ? toOverrideRaw : "";
  const actualRecipient = stageRecipient ?? "";
  const effectiveTo = TEST_OVERRIDE || toOverride || actualRecipient;
  // effectiveTo may carry several comma/semicolon-separated addresses ('all'
  // mode) — split into the real To array. toSet dedups CC/BCC against every To.
  const toList = effectiveTo.split(/[,;]+/).map(s => s.trim()).filter(s => s.includes("@"));
  const toSet  = new Set(toList.map(s => s.toLowerCase()));
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
      preview: { from: sender.fromHeader, to: effectiveTo, subject, html, text },
      template_key: templateKey,
      stage: run.current_stage,
      next_stage: route.next_stage,
    }, 200);
  }

  // ── Apply editable-preview overrides ──────────────────────────────────────
  // Two sources, in precedence order:
  //   1. Request body (subject_override/html_override) — a one-shot edit for
  //      the stage being sent right now (used by the single-send preview gates).
  //   2. run.metadata.stage_overrides[<stage>] — edits stashed on the run,
  //      keyed by stage. This is how an email that fires LATER (server-side
  //      auto-continue, e.g. the doctor heads-up after the hospital intro)
  //      still ships the team's edited version: each stage reads its own entry.
  // Empty/whitespace overrides are ignored so a blank field can't send an empty
  // email. Text fallback is derived from the edited HTML when not supplied.
  const stageOverrides = (run.metadata as { stage_overrides?: Record<string, { subject_override?: string; html_override?: string }> } | null)?.stage_overrides;
  const metaOverride   = stageOverrides?.[run.current_stage];
  const ovSubject = (body.subject_override ?? "").trim() ? String(body.subject_override)
                  : (metaOverride?.subject_override ?? "").trim() ? String(metaOverride!.subject_override)
                  : "";
  const ovHtml    = (body.html_override ?? "").trim() ? String(body.html_override)
                  : (metaOverride?.html_override ?? "").trim() ? String(metaOverride!.html_override)
                  : "";
  const finalSubject = ovSubject || subject;
  const finalHtml    = ovHtml    || html;
  const finalText    = (body.text_override ?? "").trim() ? String(body.text_override)
                     : ovHtml ? htmlToText(ovHtml)
                     : text;
  const wasEdited = !!ovSubject || !!ovHtml;

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

  // ── Reply-To + BCC routing ──────────────────────────────────────────
  // Two patterns depending on whether this run has a known HI sender:
  //
  // (a) Run is assigned to a HI member (rodaina/mohamed/sohaila/ishak/ammar):
  //     - Reply-To = their mailbox → hospital replies land in their inbox
  //       natively, so the back-and-forth happens in Gmail like normal
  //       correspondence.
  //     - BCC      = whoever the dispatcher picked (defaults to the
  //       sender so they have a copy; overridable per-run via
  //       metadata.bcc_override so the team can also loop in colleagues).
  //     - Trade-off: the dashboard's inbound parser doesn't see these
  //       replies. We capture sent events + the HI member can paste any
  //       important context back via notes. A follow-up Gmail-OAuth
  //       integration would make replies dashboard-visible again.
  //
  // (b) Unowned run (system sends, sales, fallback):
  //     - Reply-To = the per-run parser address. Dashboard captures
  //       replies via Resend Inbound + the inbound-hospital-reply edge
  //       function. metadata.bcc_override still honoured if set.
  const personalRouting = !!sender.replyHint;
  const parserReplyTo   = `reply-${run.id}@${MAIL_REPLY_DOMAIN}`;
  const replyToAddress  = personalRouting ? sender.replyHint : parserReplyTo;

  // BCC list — an EXPLICIT override the team typed in the CcBccPicker wins,
  // even under TEST_OVERRIDE, so they can BCC themselves/colleagues to verify a
  // send while the main recipient is still redirected to the test inbox (Sean:
  // "have it send to the people we CC and BCC even with the training wheels on").
  // Only the DEFAULT auto-BCC (sender mailbox) is suppressed in test mode.
  // Body wins over run metadata so the preview's CcBccPicker can add recipients
  // at send time; falls back to whatever was stashed on the run.
  const bccOverrideRaw = (body.bcc_override ?? md.bcc_override) as unknown;
  const bccOverride: string[] | null = Array.isArray(bccOverrideRaw)
    ? (bccOverrideRaw as unknown[])
        .map(v => typeof v === "string" ? v.trim().toLowerCase() : "")
        .filter(v => v.length > 0 && v.includes("@"))
    : null;
  let bccList: string[] | undefined;
  if (bccOverride !== null) {
    // Explicit BCC — honoured always. Drop the To (test-redirect target or the
    // real recipient) and Ammar so nobody's double-listed. Empty = 'BCC no-one'.
    const cleaned = bccOverride.filter(a => !toSet.has(a) && a !== "ammar@allocationassist.com");
    bccList = cleaned.length > 0 ? cleaned : undefined;
  } else if (TEST_OVERRIDE) {
    bccList = undefined;              // test mode + no explicit BCC → no auto-BCC
  } else if (personalRouting) {
    bccList = [sender.replyHint];
  }

  // In test mode, CC any EXTRA override addresses (everything after the first,
  // which is the To), deduped and excluding the To so nobody's double-listed.
  // Ammar left the team — strip him even if he's still in the override env var.
  const EXCLUDED_RECIPIENT = "ammar@allocationassist.com";
  const testCc: string[] = TEST_OVERRIDE
    ? [...new Set(TEST_OVERRIDE_LIST.slice(1))]
        .filter(a => a
          && !toSet.has(a.toLowerCase())
          && a.toLowerCase() !== EXCLUDED_RECIPIENT)
    : [];

  // Explicit CC override from the dispatcher (e.g. CC a manager on the send).
  // Merged with any test CCs, deduped, and never CC the To.
  const ccOverrideRaw = (body.cc_override ?? md.cc_override) as unknown;
  const ccOverride: string[] = Array.isArray(ccOverrideRaw)
    ? (ccOverrideRaw as unknown[])
        .map(v => typeof v === "string" ? v.trim() : "")
        .filter(v => v.length > 0 && v.includes("@"))
    : [];
  const ccSet = new Set<string>();
  for (const a of [...testCc, ...ccOverride]) {
    const lc = a.toLowerCase();
    if (lc && !toSet.has(lc) && lc !== EXCLUDED_RECIPIENT) ccSet.add(a);
  }
  const ccList: string[] | undefined = ccSet.size ? [...ccSet] : undefined;

  // ── User-uploaded attachments (CVs, logbooks) ──────────────────────────────
  // Source order (first non-empty wins), so ANY stage can carry attachments:
  //   1. metadata.attachments_<stage>  → per-stage set written on the run
  //   2. legacy keys for the two original stages — metadata.attachments
  //      (email_hospital) / metadata.attachments_doctor (email_doctor), so old
  //      runs keep working with NO migration
  //   3. body.attachments              → one-shot set on THIS invoke, used by
  //      FlowSendPreviewDialog so any flow email can carry a CV/doc
  // Each entry is { filename, path } where path is the public email-attachments
  // URL Resend fetches server-side. Merged after any relocation-guide files.
  // Auto-continue re-invokes with run_id only, so body attachments are one-shot.
  const metadataKey = `attachments_${run.current_stage}`;
  const legacyAttachments =
    run.current_stage === "email_hospital" ? md.attachments
    : run.current_stage === "email_doctor" ? md.attachments_doctor
    : undefined;
  const attachmentsForStage =
    (md[metadataKey] as unknown) ?? legacyAttachments ?? (body.attachments as unknown);
  const userAttachments: Array<{ filename: string; path: string }> =
    Array.isArray(attachmentsForStage)
      ? (attachmentsForStage as Array<Record<string, unknown>>)
          .map(a => ({ filename: String(a?.filename ?? "attachment"), path: String(a?.path ?? "") }))
          .filter(a => a.path.startsWith("http"))
      : [];
  const outgoingAttachments = [...relocationAttachments, ...userAttachments];
  if (userAttachments.length) {
    console.log(`[send-flow-email] ${userAttachments.length} user attachment(s) on ${run.current_stage}`);
  }

  // ── Build attachments as base64 content (bulletproof) ──────────────────────
  // Fetch each file ourselves and inline it as base64 instead of handing Resend
  // a URL to fetch. A bad/unreachable URL or an oversized file is SKIPPED — it
  // can NEVER fail the whole email. Getting the email to the hospital matters
  // more than any single attachment. Total capped under Resend's request limit.
  const MAX_TOTAL_ATTACH_BYTES = 25 * 1024 * 1024;
  const toBase64 = (bytes: Uint8Array): string => {
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const builtAttachments: Array<{ filename: string; content: string }> = [];
  const droppedAttachments: string[] = [];
  let attachTotal = 0;
  for (const a of outgoingAttachments) {
    try {
      const res = await fetch(a.path);
      if (!res.ok) { droppedAttachments.push(a.filename); console.warn(`[send-flow-email] attachment "${a.filename}" fetch HTTP ${res.status} — skipping`); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0) { droppedAttachments.push(a.filename); console.warn(`[send-flow-email] attachment "${a.filename}" is empty — skipping`); continue; }
      if (attachTotal + bytes.byteLength > MAX_TOTAL_ATTACH_BYTES) { droppedAttachments.push(a.filename); console.warn(`[send-flow-email] attachment "${a.filename}" exceeds size budget — skipping`); continue; }
      attachTotal += bytes.byteLength;
      builtAttachments.push({ filename: a.filename, content: toBase64(bytes) });
    } catch (e) {
      droppedAttachments.push(a.filename);
      console.warn(`[send-flow-email] attachment "${a.filename}" fetch failed — skipping`, e);
    }
  }
  if (droppedAttachments.length) {
    console.warn(`[send-flow-email] ${droppedAttachments.length} attachment(s) skipped, email still sending: ${droppedAttachments.join(", ")}`);
  }

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:     sender.fromHeader,
        to:       toList.length ? toList : [effectiveTo],
        cc:       ccList,
        bcc:      bccList,
        reply_to: replyToAddress,
        subject: finalSubject,
        html:    finalHtml,
        text:    finalText,
        headers,
        // Base64-inlined (built above) — never a remote URL, so a bad file can't
        // fail the send. Combines relocation-guide PDFs + any CV/logbook attached
        // in the Send Profile dialog.
        attachments: builtAttachments.length > 0 ? builtAttachments : undefined,
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
  // Stamp the resolved From + Reply-To + BCC into the event payload so
  // the team can audit later from the run timeline ("did this go from
  // Rodaina or the fallback? where will the reply land?").
  await supabase.from("automation_flow_events").insert({
    run_id:     run.id,
    stage_key:  run.current_stage,
    event_type: "email_sent",
    message:    `Sent "${finalSubject}" from ${sender.fromHeader} to ${effectiveTo}${personalRouting ? ` · replies land in ${sender.replyHint}` : ""}${TEST_OVERRIDE && actualRecipient !== TEST_OVERRIDE ? ` (test override; would have gone to ${actualRecipient})` : ""}${builtAttachments.length ? ` · ${builtAttachments.length} attachment(s)` : ""}${droppedAttachments.length ? ` · ⚠ ${droppedAttachments.length} attachment(s) skipped (too large/unreachable): ${droppedAttachments.join(", ")}` : ""}.`,
    payload:    {
      resend_message_id:   messageId,
      template_key:        templateKey,
      edited:              wasEdited,
      original_recipient:  actualRecipient,
      effective_recipient: effectiveTo,
      from:                sender.fromHeader,
      reply_to:            replyToAddress,
      cc:                  ccList ?? null,
      bcc:                 bccList ?? null,
      personal_routing:    personalRouting,
      attachments_sent:    builtAttachments.map(a => a.filename),
      attachments_skipped: droppedAttachments,
    },
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
const RAW_HTML_TOKENS = new Set(["signature", "doctors_table_html", "doctor_card_html", "doctor_row_table_html", "logo_header", "hospital_image"]);

/** Age from WP date_of_birth. Accepts "YYYYMMDD", "YYYY-MM-DD", or
 *  human-formatted "4 September 1987". Returns null if unparseable. */
/** Short "A, B & C" areas-of-interest line. MIRROR of src/lib/format-list.ts
 *  (and send-batch's copy) — keep all three in lockstep so the token renders the
 *  same in the preview and the sent email.
 *
 *  `area_of_interest` often holds free-text BIO prose (WordPress doctors have no
 *  separate bio field), so only segments that LOOK like interest terms survive;
 *  if none do, fall back to the job title rendered as a field ("Consultant
 *  Plastic Surgeon" → "Plastic Surgery") rather than dumping a paragraph into
 *  the hospital table (Hasan 2026-07-22: "no fluff at all"). */
const PROSE_WORDS = new Set([
  "he", "she", "his", "her", "him", "they", "their", "them", "i", "we", "our", "who", "which", "that",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "holds", "holding",
  "with", "from", "the", "an", "including", "include", "includes", "also", "currently",
  "experience", "experienced", "extensive", "certification", "certified", "qualification", "qualified",
  "university", "master", "masters", "bachelor", "degree", "diploma", "training", "trained",
  "graduated", "graduate", "years", "year", "over", "more", "than", "after", "before", "during",
  "since", "worked", "works", "working", "completed", "obtained", "received", "awarded",
  "specialises", "specializes", "specialising", "specializing", "dr", "doctor", "consultant",
  "status", "registration", "registered", "chartered", "accredited", "license", "licensed",
  "roles", "role", "managerial", "management", "manager", "leadership", "leading", "led",
  "operations", "operational", "governance", "consultancy", "consulting", "organisation",
  "organisations", "organization", "organizations", "organizational", "teams", "team",
  "deputy", "service", "services", "held", "key", "senior", "head", "director", "board",
  "multisite", "multidisciplinary", "academic", "academia", "strategy", "strategic",
  "stakeholder", "delivery", "compliance", "audit", "policy",
]);
const GRADE_WORDS = new Set([
  "consultant", "specialist", "senior", "junior", "associate", "assistant", "attending",
  "registrar", "fellow", "head", "department", "chief", "staff", "locum", "trainee", "resident",
  "dr", "doctor", "of", "and",
]);
const ROLE_TO_FIELD: Array<[RegExp, string]> = [
  [/^surgeons?$/i,                                  "Surgery"],
  [/^physicians?$/i,                                "Medicine"],
  [/^an(a)?esthetists?$|^an(a)?esthesiologists?$/i, "Anaesthesia"],
  [/^obstetricians?$/i,                             "Obstetrics"],
  [/^gyn(a)?ecologists?$/i,                         "Gynaecology"],
  [/^p(a)?ediatricians?$/i,                         "Paediatrics"],
  [/^psychiatrists?$/i,                             "Psychiatry"],
  [/^dentists?$/i,                                  "Dentistry"],
  [/^radiographers?$/i,                             "Radiography"],
  [/^nurses?$/i,                                    "Nursing"],
  [/^midwi(fe|ves)$/i,                              "Midwifery"],
];
function isInterestTerm(term: string): boolean {
  if (!term) return false;
  if (/[0-9()]/.test(term)) return false;
  const words = term.split(/\s+/);
  if (words.length > 4) return false;
  return !words.some(w => PROSE_WORDS.has(w.replace(/[^a-z]/gi, "").toLowerCase()));
}
function capitaliseWord(w: string): string {
  if (!w) return w;
  if (w.length <= 4 && w === w.toUpperCase()) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}
function specialtyToField(title: string | null | undefined): string {
  if (!title) return "";
  const words = String(title)
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !GRADE_WORDS.has(w.toLowerCase()));
  if (!words.length) return "";
  const last = words[words.length - 1];
  let mapped = "";
  for (const [re, field] of ROLE_TO_FIELD) if (re.test(last)) { mapped = field; break; }
  if (!mapped && /ologist$/i.test(last)) mapped = last.replace(/ologist$/i, "ology");
  if (!mapped && /iatrist$/i.test(last)) mapped = last.replace(/iatrist$/i, "iatry");
  if (mapped) words[words.length - 1] = mapped;
  return words.map(capitaliseWord).join(" ");
}
function formatAreasOfInterest(
  raw: string | null | undefined,
  opts: { fallback?: string; maxWords?: number } = {},
): string {
  const { fallback = "", maxWords = 30 } = opts;
  const fromTitle = () => specialtyToField(fallback);
  if (!raw) return fromTitle();
  const parts = String(raw)
    .split(/\s*(?:[,;/\n·•]|\.\s|\band\b|&)\s*/i)
    .map(s => s.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const p of parts) {
    if (!isInterestTerm(p)) continue;
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); terms.push(p); }
  }
  const rawWords = String(raw).trim().split(/\s+/).length;
  if (!terms.length || rawWords > 14 || terms.length > 6) return fromTitle();
  const kept: string[] = [];
  let words = 0;
  for (const t of terms) { const w = t.split(/\s+/).length; if (kept.length && words + w > maxWords) break; kept.push(t); words += w; }
  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(", ")} & ${kept[kept.length - 1]}`;
}

function computeAgeFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  let d: Date | null = null;
  if (/^\d{8}$/.test(dob))                 d = new Date(`${dob.slice(0,4)}-${dob.slice(4,6)}-${dob.slice(6,8)}`);
  else if (/^\d{4}-\d{2}-\d{2}/.test(dob)) d = new Date(dob);
  else                                     { const p = new Date(dob); if (!isNaN(p.valueOf())) d = p; }
  if (!d || isNaN(d.valueOf())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

/** Format a WP date_of_birth as "19 January 1981" (same input formats as
 *  computeAgeFromDob). Returns "" if unparseable/empty. */
function formatDobLong(dobIn: string | null | undefined): string {
  if (!dobIn) return "";
  let dob = String(dobIn).trim();
  // JotForm date control: {"day":"04","month":"04","year":"1973"} → ISO, so a
  // legacy JSON-stored DOB renders a real date instead of blank in the email.
  if (dob.startsWith("{") && dob.toLowerCase().includes("year")) {
    try {
      const o = JSON.parse(dob) as { day?: unknown; month?: unknown; year?: unknown };
      const y = String(o.year ?? "").trim();
      if (/^\d{4}$/.test(y)) {
        const m = /^\d{1,2}$/.test(String(o.month ?? "")) ? String(o.month).padStart(2, "0") : "01";
        const da = /^\d{1,2}$/.test(String(o.day ?? ""))   ? String(o.day).padStart(2, "0")   : "01";
        dob = `${y}-${m}-${da}`;
      }
    } catch { /* fall through */ }
  }
  let d: Date | null = null;
  if (/^\d{8}$/.test(dob))                 d = new Date(`${dob.slice(0,4)}-${dob.slice(4,6)}-${dob.slice(6,8)}`);
  else if (/^\d{4}-\d{2}-\d{2}/.test(dob)) d = new Date(dob);
  else                                     { const p = new Date(dob); if (!isNaN(p.valueOf())) d = p; }
  if (!d || isNaN(d.valueOf())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Second-payment due date: an explicit metadata.due_date wins; otherwise
 *  45 days after the logged joining_date (AA terms). Formats as "23 July 2026".
 *  Returns "" when neither is available. */
function computeDueDate(md: Record<string, unknown>): string {
  const explicit = String(md.due_date ?? "").trim();
  if (explicit) return explicit;
  const joining = String(md.joining_date ?? "").trim();
  if (!joining) return "";
  const d = new Date(joining);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 45);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function render(body: string, vars: Record<string, string>, html = false): string {
  // Pass 1: conditional sections
  body = body.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return "";
    return inner;
  });
  // Pass 1b: inverted sections `{{^token}}...{{/token}}` — render inner only
  // when the variable is FALSY (missing/empty). Lets the hospital template show
  // the captured profile IMAGE when present, else fall back to the data table.
  body = body.replace(/\{\{\^([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    return (v === undefined || v === null || v === "") ? inner : "";
  });
  // Pass 2: variable substitution
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") {
      // Structural HTML tokens (hospital photo, profile card, tables, signature,
      // logo) are layout blocks, not debug placeholders — when empty they MUST
      // disappear, never leak as a literal "{{token}}" into a doctor's inbox.
      // This is what put a raw "{{hospital_image}}" in the Working-Opportunity
      // emails whenever a hospital had no photo on file. Not-yet-wired URL
      // placeholders (form_link, profile_link, …) still render literal so a test
      // recipient can see what still needs resolving.
      return RAW_HTML_TOKENS.has(key) ? "" : `{{${key}}}`;
    }
    if (!html) return v;
    return RAW_HTML_TOKENS.has(key) ? v : escapeHtml(v);
  });
}

/** Collapse a doubled honorific. Every current doctor template hard-codes
 *  "Hello Dr. {{doctor_name}}", but a stored name like "Dr. Manuel Hevia"
 *  already carries the title — which rendered "Hello Dr. Dr. Manuel Hevia!".
 *  Tolerates an inline tag between the two "Dr."s (the HTML greeting wraps the
 *  name in <strong>). No real person is "Dr. Dr.", so this is safe to run on the
 *  whole subject/body. */
function collapseDoubledDr(s: string): string {
  return s.replace(/\bDr\.?\s*((?:<[^>]+>\s*)*)Dr\.?\s+/gi, (_m, tags = "") => `Dr. ${tags}`);
}

/** Move the {{hospital_image}} token to sit right BEFORE the first link in the
 *  doctor "working opportunity" email (the "More about <hospital>" hospital
 *  link), instead of right after the greeting (team 2026-07-10: "image right
 *  before the first link"). Anchors on the link's wrapping conditional/paragraph
 *  so the photo still renders even when that link's section is empty; falls back
 *  to after the first paragraph, then the top. No-op when the body has no token. */
function positionHospitalImage(html: string): string {
  if (!html.includes("{{hospital_image}}")) return html;
  const stripped = html.replace(/[ \t]*\{\{hospital_image\}\}[ \t]*\r?\n?/g, "");
  const anchors = [/\{\{#hospital_profile_url\}\}/i, /<p[^>]*>\s*<a\b/i, /<a\b/i];
  for (const re of anchors) {
    const m = stripped.match(re);
    if (m && m.index !== undefined) {
      return `${stripped.slice(0, m.index)}{{hospital_image}}\n${stripped.slice(m.index)}`;
    }
  }
  const pEnd = stripped.indexOf("</p>");
  return pEnd === -1 ? `{{hospital_image}}\n${stripped}` : `${stripped.slice(0, pEnd + 4)}\n{{hospital_image}}${stripped.slice(pEnd + 4)}`;
}

/** WordPress-style profile card for the individual profile_sent_hospital email
 *  — reproduces the website's profile look in-email: a teal photo sidebar
 *  (circular photo, name, title, sector, age, contact) next to a white panel
 *  with the "Specific areas of interests within the specialization" heading +
 *  bio, then View full profile / View CV buttons. The detailed facts live in
 *  the data table beneath (doctorRowTableHtml), so the card stays visual. Reads
 *  from the assembled `vars`; injected via the {{doctor_card_html}} RAW token
 *  so its inline styling survives plainifyBody. Keep in sync with the client
 *  mirror previewDoctorCardHtml() in SendProfileDialog.tsx. */
function doctorCardHtml(v: Record<string, string>): string {
  const name      = (v.doctor_name  || "Candidate").trim();
  const title     = (v.doctor_title || "").trim();
  const specialty = (v.doctor_specialty || "").trim();
  const phone     = (v.doctor_phone || "").trim();
  const email     = (v.doctor_email || "").trim();
  const photo     = (v.doctor_photo_url || "").trim();
  const bioRaw    = (v.doctor_bio || v.doctor_area_of_interest || "").trim();
  const bio       = bioRaw ? escapeHtml(htmlToText(bioRaw)).replace(/\r?\n+/g, "<br>") : "";

  const photoImg = photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}" width="112" height="112" style="display:block;margin:0 auto 14px;width:112px;height:112px;border-radius:50%;border:3px solid rgba(255,255,255,0.9);object-fit:cover;" />`
    : "";
  const sectorPill = specialty
    ? `<div style="display:inline-block;margin-top:10px;background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 13px;font-size:12px;color:#ffffff;">${escapeHtml(specialty)}</div>`
    : "";
  const contactBlock = (phone || email) ? `
          <div style="border-top:1px solid rgba(255,255,255,0.28);margin-top:16px;padding-top:13px;text-align:left;">
            ${phone ? `<div style="font-size:12px;margin-bottom:7px;color:#ffffff;"><span style="opacity:0.85;">&#9742;</span> ${escapeHtml(phone)}</div>` : ""}
            ${email ? `<div style="font-size:12px;word-break:break-all;color:#ffffff;"><span style="opacity:0.85;">&#9993;</span> ${escapeHtml(email)}</div>` : ""}
          </div>` : "";

  // Full WordPress-profile field set beside the bio (team: "the card should
  // have all the data available in the profile on wordpress"). Two columns,
  // only non-empty values; skip what the sidebar already shows (specialty/age)
  // and dedupe obvious repeats.
  const facts: Array<[string, string]> = [
    ["Subspecialty",         v.doctor_subspecialty],
    ["Title / rank",         v.doctor_rank && v.doctor_rank !== title ? v.doctor_rank : ""],
    ["Country of training",  v.doctor_country_training],
    ["Years of experience",  v.doctor_years_experience],
    ["Current location",     v.doctor_current_location],
    ["Targeted locations",   v.doctor_targeted_locations],
    ["Nationality",          v.doctor_nationality],
    ["Age",                  v.doctor_age],
    ["Date of birth",        v.doctor_dob],
    ["Marital status",       v.doctor_marital_status],
    ["Family status",        v.doctor_family_status && v.doctor_family_status !== v.doctor_marital_status ? v.doctor_family_status : ""],
    ["Languages",            v.doctor_languages],
    ["English level",        v.doctor_english_level],
    ["UAE license",          v.doctor_license],
    ["License types",        v.doctor_license_types && v.doctor_license_types !== v.doctor_license ? v.doctor_license_types : ""],
    ["Salary expectation",   v.doctor_salary_expectation || "Market Range"],
    ["Notice period",        v.doctor_notice_period],
  ];
  // Facts render as a full-width grid of icon tiles BELOW the photo+bio row —
  // the WordPress layout: "text above, then stuff with icons below it". Each
  // tile shows a hosted teal line-icon (PNG in the email-assets bucket — SVG/
  // icon-fonts don't survive most inboxes, so they're rasterised) in a soft
  // grey circle, like the website. 3 tiles per row.
  const factTiles = facts
    .filter(([, val]) => val && val.trim() && val.trim() !== "—")
    .map(([label, val]) => `
              <td width="33%" valign="top" style="padding:14px 16px 14px 0;font-family:${CARD_FONT};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="52" valign="top">
                    <div style="width:44px;height:44px;border-radius:50%;background:#f1f5f9;text-align:center;line-height:44px;">
                      <img src="${ICON_BASE}/${FACT_ICON[label] ?? "badge"}.png" width="22" height="22" alt="" style="vertical-align:middle;border:0;" />
                    </div>
                  </td>
                  <td valign="top" style="padding-left:12px;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;font-weight:600;">${escapeHtml(label)}</div>
                    <div style="font-size:14px;color:#1a2332;font-weight:500;margin-top:2px;">${escapeHtml(val.trim())}</div>
                  </td>
                </tr></table>
              </td>`);
  const factTileRows: string[] = [];
  for (let i = 0; i < factTiles.length; i += 3) {
    factTileRows.push(`<tr>${factTiles[i]}${factTiles[i + 1] ?? '<td width="33%"></td>'}${factTiles[i + 2] ?? '<td width="33%"></td>'}</tr>`);
  }
  const factsBlock = factTileRows.length
    ? `<tr><td colspan="2" style="background:#f8fafc;border-top:1px solid #eef2f7;padding:10px 26px 18px;font-family:${CARD_FONT};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody>${factTileRows.join("")}</tbody></table>
      </td></tr>`
    : "";

  const bioBlock = bio
    ? `<div style="font-size:16px;font-weight:700;color:#0f766e;margin-bottom:10px;">Specific areas of interests within the specialization</div>
          <div style="font-size:15px;color:#334155;line-height:1.6;">${bio}</div>`
    : `<div style="font-size:16px;font-weight:700;color:#0f766e;">${escapeHtml(title || specialty || name)}</div>`;

  const buttons: string[] = [];
  const profileUrl = (v.profile_url || v.doctor_wp_link || "").trim();
  if (profileUrl && !/allocationassist\.com\/?$/.test(profileUrl)) {
    buttons.push(`<a href="${escapeHtml(profileUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px;">View full profile &rarr;</a>`);
  }
  const cvUrl = (v.doctor_cv_url || "").trim();
  if (cvUrl) {
    buttons.push(`<a href="${escapeHtml(cvUrl)}" style="display:inline-block;color:#0f766e;text-decoration:none;font-size:15px;font-weight:600;padding:11px 18px;border:1px solid #0f766e;border-radius:8px;">View CV</a>`);
  }
  const buttonsHtml = buttons.length
    ? `<div style="margin:14px 0 6px;font-family:${CARD_FONT};">${buttons.join(`<span style="display:inline-block;width:10px;"></span>`)}</div>`
    : "";

  // Wide WordPress-style layout: row 1 = teal photo sidebar | bio; row 2 = the
  // icon fact-grid spanning the full width. font-family:CARD_FONT on the wrapper
  // AND every cell (Outlook resets fonts on tables).
  return `
<div style="font-family:${CARD_FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:1040px;margin:20px 0 0;font-family:${CARD_FONT};">
  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;border:1px solid #d1f0ec;border-radius:14px;overflow:hidden;background:#ffffff;">
      <tr>
        <td width="240" valign="top" bgcolor="#0f766e" style="width:240px;font-family:${CARD_FONT};background:#0f766e;background:linear-gradient(160deg,#0f766e,#14b8a6);padding:26px 20px;text-align:center;color:#ffffff;">
          ${photoImg}
          <div style="font-size:19px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(name)}</div>
          ${title ? `<div style="font-size:13px;opacity:0.92;margin-top:4px;color:#ffffff;">${escapeHtml(title)}</div>` : ""}
          ${sectorPill}
          ${contactBlock}
        </td>
        <td valign="top" style="padding:24px 26px;background:#ffffff;font-family:${CARD_FONT};">
          ${bioBlock}
        </td>
      </tr>
      ${factsBlock}
    </table>
  </td></tr>
</table>
${buttonsHtml}
</div>`;
}

/** The single doctor's profile as the wide "Available Doctor Format" table —
 *  GREEN (teal) header row, one data row, wrapped in an overflow-x:auto box so
 *  it scrolls sideways instead of crushing (Hasan 2026-07-06: "all emails have
 *  scrollable tables with the green header"). Same styling as the batch table so
 *  every hospital email's table looks identical. Inline styles → survives
 *  plainifyBody. */
function doctorRowTableHtml(v: Record<string, string>): string {
  const cols: Array<[string, string]> = [
    ["#",                                            "1"],
    ["Name",                                         v.doctor_name || ""],
    ["Title and Specialty as per the UAE license",   v.doctor_title || ""],
    ["Area of Interest",                             v.doctor_area_of_interest || ""],
    ["Country Of Training",                          v.doctor_country_training || ""],
    ["Years of Experience",                          v.doctor_years_experience || ""],
    ["Nationality",                                  v.doctor_nationality || ""],
    ["Age",                                          v.doctor_age || ""],
    ["Marital Status",                               v.doctor_marital_status || ""],
    ["Family Status",                                v.doctor_family_status || ""],
    ["UAE license type / Status",                    v.doctor_license || ""],
    ["Salary Expectation",                           v.doctor_salary_expectation || "Market Range"],
    ["Notice Period",                                v.doctor_notice_period || ""],
    ["Mobile",                                       v.doctor_phone || ""],
    ["Email",                                        v.doctor_email || ""],
  ];
  const th = cols.map(([h]) =>
    `<th style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;background:#0f766e;color:#ffffff;font-size:13px;font-weight:600;white-space:nowrap;">${escapeHtml(h)}</th>`).join("");
  const td = cols.map(([, val]) =>
    `<td style="text-align:center;border:1px solid #cbd5e1;padding:8px 11px;font-size:14px;color:#1a2332;vertical-align:top;">${escapeHtml(val)}</td>`).join("");
  return `
<div style="overflow-x:auto;max-width:100%;margin:18px 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border:1px solid #cbd5e1;">
    <thead><tr>${th}</tr></thead>
    <tbody><tr>${td}</tr></tbody>
  </table>
</div>`;
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

/** Strip HTML markup down to plain text. WP's Area of Interest field often
 *  holds Google-Docs paste HTML (<p class="cvGsUA">…<span class="a_GcMg">),
 *  which — once escaped for safe insertion — shows the raw tags as text.
 *  Convert block ends to newlines, drop all tags, decode the common entities,
 *  collapse whitespace. The caller still escapeHtml()s the result. */
function htmlToText(s: string): string {
  if (!s) return "";
  let t = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_m, n) => { const c = parseInt(n, 10); return c ? String.fromCharCode(c) : ""; });
  return t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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

/**
 * Strip the "fancy" inline styling from a template's body HTML at send
 * time so every email lands in the recipient's inbox as plain text with
 * a clean signature — same look across templates without rewriting the
 * stored bodies. Ammar's reference (2026-06-06) shows the target: bare
 * paragraphs, no buttons, no card frames, just text + a teal signature.
 *
 * What we strip:
 *   - Every `style="…"` attribute (so buttons, cards, coloured pills,
 *     background frames all collapse to bare text + a default link).
 *   - <div> and <span> tags themselves (their content stays). Keeps
 *     the document structure but removes the fancy chrome those tags
 *     were carrying.
 *   - Inline class/id/align attributes — same reason.
 *
 * What we keep:
 *   - <p>, <br>, <a>, <strong>, <em>, <ul>/<li>, <h1>-<h3>, <hr>.
 *   - The signature block — preserved verbatim because it's appended
 *     AFTER this transform runs. We just leave the {{signature}} token
 *     alone in the input.
 */
function plainifyBody(html: string): string {
  if (!html) return html;
  return html
    // Drop every `style="…"` and `style='…'` attribute on any tag.
    .replace(/\s+style\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+style\s*=\s*'[^']*'/gi, "")
    // Drop class / id / align — common chrome carriers.
    .replace(/\s+class\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+class\s*=\s*'[^']*'/gi, "")
    .replace(/\s+id\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+id\s*=\s*'[^']*'/gi, "")
    .replace(/\s+align\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+align\s*=\s*'[^']*'/gi, "")
    .replace(/\s+bgcolor\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+bgcolor\s*=\s*'[^']*'/gi, "")
    // Unwrap <div> / <span> — keep contents, lose the tags. Buttons in
    // the templates were typically `<div ...><a ...>Pay</a></div>` so
    // unwrapping the div + stripping the link's style gives a plain
    // hyperlink in the paragraph flow.
    .replace(/<\/?(?:div|span)\b[^>]*>/gi, "")
    // Collapse runs of whitespace introduced by the above.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
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
