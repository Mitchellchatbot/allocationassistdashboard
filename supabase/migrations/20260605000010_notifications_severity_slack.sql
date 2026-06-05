-- Notifications v2 — severity + Slack delivery.
--
-- The previous model treated every nudge the same: a flat list, all
-- equal weight, in-dashboard only. The team got desensitised — the
-- ones that actually needed a click drowned in the routine ones.
--
-- This migration introduces:
--   - severity: 'info' | 'action' | 'critical'
--       info     = surface in the bell, no Slack
--       action   = someone has to do something. DM the assignee on
--                  Slack; bell highlights it in amber.
--       critical = team-level escalation (e.g. nothing's moving, an
--                  SLA breached). Posts to the shared channel + bell.
--   - cta_label / cta_kind: the button rendered on the in-dash card
--                           AND inside the Slack Block Kit message,
--                           so the user can act in one click.
--   - slack_delivered_at / slack_message_ts: idempotency stamp + a
--                           handle for future updates (we'll reply
--                           in-thread when the underlying state
--                           changes, e.g. "shortlisted → confirmed").
--
-- And on user_profiles:
--   - slack_handle: the Slack username (no @) we'll mention when an
--                   action-severity notification is for that person.

alter table public.notifications
  add column if not exists severity            text not null default 'info' check (severity in ('info', 'action', 'critical')),
  add column if not exists cta_label           text,
  add column if not exists cta_kind            text,
  add column if not exists slack_delivered_at  timestamptz,
  add column if not exists slack_message_ts    text,
  add column if not exists slack_skip_reason   text;

create index if not exists notifications_severity_idx
  on public.notifications (severity, created_at desc)
  where read_at is null and dismissed_at is null;

create index if not exists notifications_slack_pending_idx
  on public.notifications (created_at)
  where slack_delivered_at is null and severity <> 'info';

-- Per-user Slack mapping. Used for @-mentions in the shared channel,
-- and (later) for DM routing once we promote from webhook → bot token.
alter table public.user_profiles
  add column if not exists slack_handle text;

-- Backfill severity on existing rows. Conservative defaults: kinds
-- that clearly need an action go to 'action', everything else stays
-- 'info' so we don't suddenly Slack-blast on day one.
update public.notifications
  set severity = case
    when kind = 'shortlist_suggested'    then 'action'
    when kind = 'hospital_reply_overdue' then 'action'
    when kind = 'interview_followup'     then 'action'
    when kind = 'signed_not_joined'      then 'action'
    when kind = 'availability_checkin'   then 'action'
    when kind = 'vacancy_match'          then 'info'
    else                                       'info'
  end
where severity = 'info';
