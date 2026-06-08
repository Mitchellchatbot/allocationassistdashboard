/**
 * Shared notify() — one entry point for every notification the
 * platform produces. Inserts into the notifications table AND, when
 * severity warrants it, posts to Slack via the configured webhook.
 *
 * Why centralise:
 *   - Producers (tick-scheduler, classify-hospital-reply, …) used to
 *     each open their own supabase.from("notifications").insert(...)
 *     calls with bespoke field shapes. Drift was inevitable.
 *   - Severity routing (info vs action vs critical) lives in ONE
 *     place — the kind catalog below. Tuning who pings Slack means
 *     editing this file, not every producer.
 *
 * Slack mode (controlled by the SLACK_WEBHOOK_URL env var):
 *   - unset → no-op (logs a skip reason). The dashboard still shows
 *             the notification; only the chat channel stays quiet.
 *   - set   → POST a Block Kit message to the webhook URL. We render
 *             a title, body, "Open in dashboard" link button, and the
 *             optional cta_label action button.
 *
 * If a notification is `action` severity AND the assignee has a
 * slack_handle in user_profiles, we prefix the body with @handle so
 * Slack mentions them in the team channel even on webhook mode.
 *
 * Dedupe stays the responsibility of the partial unique indices on
 * the notifications table itself — we just .upsert(..., ignoreDuplicates).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SLACK_WEBHOOK_URL     = Deno.env.get("SLACK_WEBHOOK_URL")         ?? "";
const APP_ORIGIN            = (Deno.env.get("APP_ORIGIN") ?? "https://allocationassist.com").replace(/\/+$/, "");

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client) _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  return _client;
}

export type Severity = "info" | "action" | "critical";

export interface NotifyInput {
  /** Stable identifier — drives dedupe indices + the kind catalog lookup. */
  kind:                string;
  title:               string;
  body?:               string;
  /** App-relative path (e.g. /automations?run=…) — rendered as a deep
   *  link in both the in-dash card and the Slack button. */
  link_path?:          string;
  related_run_id?:     string | null;
  related_vacancy_id?: string | null;
  related_doctor_id?:  string | null;
  /** Email of the person responsible. Slack @-mention is derived from
   *  this via user_profiles.slack_handle. Null = team-wide. */
  for_user?:           string | null;
  /** Optional explicit override of the kind catalog's severity. */
  severity?:           Severity;
  /** Optional CTA shown both in the dashboard card and as a Slack button. */
  cta_label?:          string;
  cta_kind?:           string;
}

interface KindRule {
  severity:  Severity;
  cta_label: string;
  cta_kind:  string;
}

/** The catalog. Every notification kind we emit needs an entry here.
 *  Adding a new kind without updating this table = the producer
 *  defaults to info-severity + no CTA, which is the safe failure
 *  mode (in-dashboard, never Slack). */
const KIND_RULES: Record<string, KindRule> = {
  // — actionable —
  shortlist_suggested:    { severity: "action",   cta_label: "Review reply",      cta_kind: "open_run" },
  interview_proposed:     { severity: "action",   cta_label: "Pick a time",       cta_kind: "open_run" },
  hospital_reply_overdue: { severity: "action",   cta_label: "Chase hospital",    cta_kind: "open_run" },
  interview_followup:     { severity: "action",   cta_label: "Log follow-up",     cta_kind: "open_run" },
  signed_not_joined:      { severity: "action",   cta_label: "Set joining date",  cta_kind: "open_doctor" },
  availability_checkin:   { severity: "action",   cta_label: "Confirm available", cta_kind: "open_doctor" },
  // — high-signal events —
  contract_signed:        { severity: "action",   cta_label: "Log in Reports",    cta_kind: "open_doctor" },
  cv_uploaded:            { severity: "action",   cta_label: "Review CV",         cta_kind: "open_doctor" },
  slack_archive_due:      { severity: "action",   cta_label: "Archive channel",   cta_kind: "open_doctor" },
  batch_send_failed:      { severity: "action",   cta_label: "Open automations",  cta_kind: "navigate" },
  // — escalations —
  placement_payment_overdue: { severity: "critical", cta_label: "Send invoice reminder", cta_kind: "open_doctor" },
  sla_breach:                { severity: "critical", cta_label: "Open connection",       cta_kind: "navigate" },
  // — for awareness —
  vacancy_match:          { severity: "info",     cta_label: "View match",        cta_kind: "open_vacancy" },
  wp_sync_summary:        { severity: "info",     cta_label: "View candidates",   cta_kind: "navigate" },
  // A new form submission is real but routine. Kept at info so it
  // sits in the bell's quiet tier WITHOUT Slack-blasting the channel
  // or amber-highlighting the bell for every intake. The Slack-worthy
  // signal is the once-daily `form_digest` ("N new submissions") fired
  // from tick-scheduler — one consolidated nudge, not per-submission spam.
  new_form_submission:    { severity: "info",     cta_label: "Review profile",    cta_kind: "navigate" },
  form_digest:            { severity: "action",   cta_label: "Review submissions", cta_kind: "navigate" },
};

const fallbackRule: KindRule = { severity: "info", cta_label: "Open", cta_kind: "navigate" };

function ruleFor(kind: string): KindRule {
  return KIND_RULES[kind] ?? fallbackRule;
}

/** Main entry point. Idempotent against the table's dedupe indices —
 *  duplicate inserts are swallowed silently. */
export async function notify(input: NotifyInput): Promise<{ id: string | null; slack_sent: boolean; slack_skip_reason?: string }> {
  const rule     = ruleFor(input.kind);
  const severity = input.severity  ?? rule.severity;
  const ctaLabel = input.cta_label ?? rule.cta_label;
  const ctaKind  = input.cta_kind  ?? rule.cta_kind;

  // 1. Insert into the notifications table. We let the partial unique
  //    indices reject duplicates (per-vacancy/doctor for matches,
  //    per-run for interview followups, etc.) — the error message
  //    contains "duplicate key" which we treat as a no-op.
  const { data: inserted, error: insertErr } = await sb()
    .from("notifications")
    .insert({
      kind:               input.kind,
      title:              input.title,
      body:               input.body ?? null,
      link_path:          input.link_path ?? null,
      related_run_id:     input.related_run_id ?? null,
      related_vacancy_id: input.related_vacancy_id ?? null,
      related_doctor_id:  input.related_doctor_id ?? null,
      for_user:           input.for_user ?? null,
      severity,
      cta_label:          ctaLabel,
      cta_kind:           ctaKind,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    if (/duplicate key/i.test(insertErr.message)) {
      return { id: null, slack_sent: false, slack_skip_reason: "duplicate" };
    }
    console.error("[notify] insert failed:", insertErr.message);
    return { id: null, slack_sent: false, slack_skip_reason: `insert_error: ${insertErr.message}` };
  }

  const notifId = inserted?.id ?? null;

  // 2. Slack delivery. Only `action` + `critical` go to Slack — info
  //    stays in-dashboard. If SLACK_WEBHOOK_URL isn't set we record
  //    why we skipped so it's visible in the row + obvious to debug.
  if (severity === "info") {
    return { id: notifId, slack_sent: false, slack_skip_reason: "severity_info" };
  }
  if (!SLACK_WEBHOOK_URL) {
    if (notifId) {
      await sb().from("notifications")
        .update({ slack_skip_reason: "no_webhook_configured" })
        .eq("id", notifId);
    }
    return { id: notifId, slack_sent: false, slack_skip_reason: "no_webhook_configured" };
  }

  // 3. Resolve the recipient's Slack handle if we have one. Webhook
  //    mode means we always post to the same channel — we just
  //    @-mention them in the message body to make it personal.
  let mention = "";
  if (input.for_user) {
    const { data: profile } = await sb()
      .from("user_profiles")
      .select("slack_handle")
      .eq("email", input.for_user)
      .maybeSingle();
    const handle = (profile as { slack_handle?: string | null } | null)?.slack_handle;
    if (handle && handle.trim()) {
      mention = `<@${handle.replace(/^@/, "")}> `;
    } else if (input.for_user) {
      // No handle on file — fall back to email so the team can still
      // see who owns it.
      mention = `*${input.for_user}* `;
    }
  }

  const deepLink = input.link_path ? `${APP_ORIGIN}${input.link_path}` : APP_ORIGIN;
  const severityEmoji = severity === "critical" ? ":rotating_light:" : ":bell:";
  const severityColor = severity === "critical" ? "#dc2626" : "#d97706";

  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${severityEmoji} *${input.title}*` },
    },
    ...(input.body
      ? [{
          type: "section",
          text: { type: "mrkdwn", text: `${mention}${input.body}` },
        }]
      : (mention
          ? [{ type: "section", text: { type: "mrkdwn", text: mention.trim() } }]
          : [])),
    {
      type: "actions",
      elements: [
        // One CTA — labelled with what the click ACCOMPLISHES
        // ("Chase hospital", "Review reply", …) and coloured by
        // severity. A single button lands on the deep-link; a second
        // "View in dashboard" pointing at the same URL was just noise.
        {
          type: "button",
          text: { type: "plain_text", text: ctaLabel },
          url:  deepLink,
          style: severity === "critical" ? "danger" : "primary",
        },
      ],
    },
  ];

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        // attachments carries the colour bar on the left edge of the
        // message — Block Kit alone doesn't expose it directly.
        attachments: [{ color: severityColor, blocks }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[notify] slack post failed:", res.status, text.slice(0, 200));
      if (notifId) {
        await sb().from("notifications")
          .update({ slack_skip_reason: `slack_${res.status}` })
          .eq("id", notifId);
      }
      return { id: notifId, slack_sent: false, slack_skip_reason: `slack_${res.status}` };
    }
  } catch (err) {
    console.error("[notify] slack fetch threw:", err);
    if (notifId) {
      await sb().from("notifications")
        .update({ slack_skip_reason: `slack_fetch_error: ${(err as Error).message}` })
        .eq("id", notifId);
    }
    return { id: notifId, slack_sent: false, slack_skip_reason: "slack_fetch_error" };
  }

  if (notifId) {
    await sb().from("notifications")
      .update({ slack_delivered_at: new Date().toISOString() })
      .eq("id", notifId);
  }
  return { id: notifId, slack_sent: true };
}
