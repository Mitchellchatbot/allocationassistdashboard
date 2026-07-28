-- One-off batches ─────────────────────────────────────────────────────────
-- An on-demand "send these doctors to these hospitals as one tabular email per
-- hospital, right now" — folds the old Bulk-send "combined" mode into the single
-- batch flow (/batches). A one-off is a first-class, persisted, resendable
-- `scheduled_batch_sends` row (kind = 'one_off') that:
--   • does NOT participate in the specialty rotation, and
--   • targets an EXPLICIT set of hospital recruiter emails (recipient_emails)
--     rather than a whole country.

-- 1. Allow the new kind. The original inline column check is auto-named
--    `scheduled_batch_sends_kind_check` (from 20260525000002). Drop + re-add so
--    this is idempotent and safe to re-run.
alter table public.scheduled_batch_sends
  drop constraint if exists scheduled_batch_sends_kind_check;
alter table public.scheduled_batch_sends
  add constraint scheduled_batch_sends_kind_check
  check (kind in ('daily_duo', 'tuesday_top_15', 'specialty_of_day', 'one_off'));

-- 2. Explicit recipient hospitals for a one-off (recruiter emails). The other
--    kinds leave this empty and scope by country as before.
alter table public.scheduled_batch_sends
  add column if not exists recipient_emails text[] not null default '{}';

comment on column public.scheduled_batch_sends.recipient_emails is
  'One-off batches only: the explicit hospital recruiter emails to send to (replaces the country scope). Empty for the recurring kinds (daily_duo / tuesday_top_15 / specialty_of_day).';

-- NOTE: we intentionally do NOT touch the (kind, scheduled_for, specialty,
-- country) "one live batch per slot" unique index here. On this project that
-- index is not currently present (and the live data contains same-slot rows that
-- would violate it), so recreating it — even to exclude one_off — would fail.
-- one_off rows are therefore unconstrained by it, which is the desired behaviour
-- (you can fire several one-offs the same day). The client-side duplicate check
-- in BatchDialog still guards the recurring kinds.
