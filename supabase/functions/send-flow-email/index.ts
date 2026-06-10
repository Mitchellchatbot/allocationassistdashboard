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
import { summarizeAreaOfInterest } from "../_shared/summarize.ts";

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
  // Flow 6 · Relocation — guide + attestation go together (per Saif's spec)
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
};

/** Resolve the From line + signature variant from a run's assigned_to. */
function pickSender(assignedTo: string | null | undefined): { fromHeader: string; replyHint: string; first: string; last: string; title: string; phone: string } {
  const key = (assignedTo ?? "").trim().toLowerCase();
  const s = SENDERS[key];
  if (s) {
    return {
      fromHeader: `${s.displayName} <${s.email}>`,
      replyHint:  s.email,
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
// Sans-serif stack matching the user's reference (clean system font,
// like Gmail / Apple Mail defaults). Used by signature AND by the
// body wrapper so the whole email reads as a single typeface.
const SANS_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// Public URL for the logo image (uploaded to the email-assets bucket,
// migration 20260608000004). Lives on Supabase Storage so email clients
// hot-link without auth.
const LOGO_URL = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/logo.png`;

function signatureHtml(first: string, last: string, title: string, phone: string): string {
  const fullName = [first, last].filter(Boolean).join(" ") || "Allocation Assist";
  const teal     = `color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${SANS_STACK};`;
  const grey     = `color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${SANS_STACK};`;
  const linkLine = `font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${SANS_STACK};`;
  return `
<p style="margin:24px 0 0;font-family:${SANS_STACK};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
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
    // Step 1: WP candidate — most recent linked row (a doctor *should*
    // only have one, but order-by-modified just in case).
    const { data: wp } = await supabase
      .from("wordpress_candidates")
      .select("*")
      .eq("doctor_id", run.doctor_id)
      .order("wp_modified", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (wp) {
      const age = computeAgeFromDob(wp.date_of_birth);
      profileTokens = {
        doctor_title:              String(wp.job_title              ?? ""),
        doctor_bio:                String(wp.area_of_interest       ?? ""),  // WP has no bio; closest analogue
        doctor_area_of_interest:   String(wp.area_of_interest       ?? ""),
        doctor_country_training:   String(wp.country_of_training    ?? ""),
        doctor_years_experience:   wp.years_experience != null ? String(wp.years_experience) : "",
        doctor_nationality:        String(wp.nationality            ?? ""),
        doctor_age:                age != null ? String(age) : "",
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
        doctor_area_of_interest:   String(sacf.specific_areas_of_interests_within_the_specialization ?? ""),
        doctor_country_training:   String(sacf.country_of_training    ?? ""),
        doctor_years_experience:   sacf.years_of_experience_post_specialization != null ? String(sacf.years_of_experience_post_specialization) : "",
        doctor_nationality:        String(sacf.nationality            ?? ""),
        doctor_age:                age != null ? String(age) : "",
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

  // ── Condense a long "Area of Interest" so the wide profile table doesn't
  //    blow out (Ammar 2026-06-09: summarise it with Claude). No-ops when
  //    already short, when ANTHROPIC_API_KEY is unset, or on any API error —
  //    it must never fail the send. Runs once per send; the doctor's stored
  //    area_of_interest is left untouched.
  if (profileTokens.doctor_area_of_interest) {
    const short = await summarizeAreaOfInterest(profileTokens.doctor_area_of_interest);
    if (short && short !== profileTokens.doctor_area_of_interest) {
      console.log(`[send-flow-email] area of interest condensed: ${profileTokens.doctor_area_of_interest.length}→${short.length} chars`);
      profileTokens.doctor_area_of_interest = short;
    }
  }

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
      const citySlug = String(hospital?.city ?? "")
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
    amount:             String(md.amount ?? ""),
    invoice_number:     String(md.invoice_number ?? ""),
    invoice_issue_date: String(md.invoice_issue_date ?? ""),
    late_fee_amount:    String(md.late_fee_amount ?? ""),
    due_date:           String(md.due_date ?? ""),
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

  const subject = render(tpl.subject ?? "", vars);
  // HTML gets escaped token values (so a doctor name like "Dr. <Smith>" or
  // a Claude-extracted field with stray HTML doesn't break the layout or
  // become an XSS vector in a hospital recipient's inbox). Plain text gets
  // raw values.
  //
  // plainifyBody strips fancy inline styling from the stored template body
  // (buttons / cards / coloured pills) BEFORE we splice in the signature.
  // The signature itself has to keep its own inline styles (teal sign-off,
  // logo block) so plainify runs only on the body source.
  const rawBody       = tpl.body_html || wrapHtml(tpl.body_text);
  const plainBody     = plainifyBody(rawBody);
  const renderedBody  = render(plainBody, vars, true);
  // Wrap the rendered body in a serif container so every <p>/<table>
  // inherits the sans-serif look from the user's reference email.
  // Inline styles on individual elements still win (signature keeps
  // its teal-bold weight, link colour, etc.).
  const html          = `<div style="font-family:${SANS_STACK};font-size:14px;color:#1a2332;line-height:1.55;">${renderedBody}</div>`;
  const text          = render(tpl.body_text ?? "", vars);

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
      preview: { from: sender.fromHeader, to: effectiveTo, subject, html, text },
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

  // BCC list — explicit override from the dispatcher wins; otherwise
  // default to sender's mailbox under personal routing. TEST_OVERRIDE
  // bypasses BCC entirely so test runs don't double-deliver.
  const bccOverrideRaw = (md.bcc_override as unknown);
  const bccOverride: string[] | null = Array.isArray(bccOverrideRaw)
    ? (bccOverrideRaw as unknown[])
        .map(v => typeof v === "string" ? v.trim().toLowerCase() : "")
        .filter(v => v.length > 0 && v.includes("@"))
    : null;
  let bccList: string[] | undefined;
  if (TEST_OVERRIDE) {
    bccList = undefined;
  } else if (bccOverride !== null) {
    // Empty array on the override means 'BCC no-one' — respect it.
    bccList = bccOverride.length > 0 ? bccOverride : undefined;
  } else if (personalRouting) {
    bccList = [sender.replyHint];
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
        to:       [effectiveTo],
        // When the test-override is a multi-address list, CC the rest of the
        // team so every test email lands in everyone's inbox.
        cc:       TEST_OVERRIDE_LIST.length > 1 ? TEST_OVERRIDE_LIST.slice(1) : undefined,
        bcc:      bccList,
        reply_to: replyToAddress,
        subject,
        html,
        text,
        headers,
        // Resend fetches each `path` URL and attaches it. Only the relocation
        // stage populates this; everything else sends with no attachments.
        attachments: relocationAttachments.length > 0 ? relocationAttachments : undefined,
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
    message:    `Sent "${subject}" from ${sender.fromHeader} to ${effectiveTo}${personalRouting ? ` · replies land in ${sender.replyHint}` : ""}${TEST_OVERRIDE && actualRecipient !== TEST_OVERRIDE ? ` (test override; would have gone to ${actualRecipient})` : ""}.`,
    payload:    {
      resend_message_id:   messageId,
      template_key:        templateKey,
      original_recipient:  actualRecipient,
      effective_recipient: effectiveTo,
      from:                sender.fromHeader,
      reply_to:            replyToAddress,
      bcc:                 bccList ?? null,
      personal_routing:    personalRouting,
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
const RAW_HTML_TOKENS = new Set(["signature", "doctors_table_html", "logo_header"]);

/** Age from WP date_of_birth. Accepts "YYYYMMDD", "YYYY-MM-DD", or
 *  human-formatted "4 September 1987". Returns null if unparseable. */
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
