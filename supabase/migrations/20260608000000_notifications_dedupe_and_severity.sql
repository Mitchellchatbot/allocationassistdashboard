-- Notifications v3 — dedupe the webhook/classifier kinds + tame form noise.
--
-- Two problems this fixes:
--
-- 1. Re-delivered webhooks / re-run classifiers double-post.
--    notify() swallows "duplicate key" errors, but the only partial
--    unique indices we had were for vacancy_match and interview_followup
--    (see 20260524000011). A BoldSign webhook retry or a re-run of the
--    hospital-reply classifier therefore created a second identical
--    notification. Add the missing dedupe indices so those kinds are
--    idempotent too.
--
-- 2. Every form submission was bumped to 'action' severity, which made
--    it Slack-blast the channel and amber-highlight the bell for routine
--    intake. We're moving new_form_submission back to 'info' in the kind
--    catalog (_shared/notify.ts) — a once-daily 'form_digest' nudge
--    (tick-scheduler) carries the Slack-worthy summary instead. Downgrade
--    the existing rows here so the bell stops over-reporting on day one.

-- ── Dedupe indices ─────────────────────────────────────────────────────────
-- Each index is preceded by a one-off cleanup that collapses any rows that
-- already violate it (keeping the most recent), so the migration can't fail
-- on pre-existing duplicates from before the index existed.

-- At most one contract_signed per doctor. BoldSign occasionally re-delivers
-- the signing webhook; without this the team got the celebration twice.
-- (A genuine re-sign for the same doctor is rare enough that one row is the
--  right trade-off — the team can always log the placement manually.)
delete from public.notifications a
using public.notifications b
where a.kind = 'contract_signed' and b.kind = 'contract_signed'
  and a.related_doctor_id is not null
  and a.related_doctor_id = b.related_doctor_id
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.ctid < b.ctid));

create unique index if not exists notifications_contract_signed_unique
  on public.notifications (related_doctor_id)
  where kind = 'contract_signed' and related_doctor_id is not null;

-- At most one shortlist_suggested per flow run. The hospital-reply
-- classifier can re-run on the same inbound thread.
delete from public.notifications a
using public.notifications b
where a.kind = 'shortlist_suggested' and b.kind = 'shortlist_suggested'
  and a.related_run_id is not null
  and a.related_run_id = b.related_run_id
  and (a.created_at < b.created_at
       or (a.created_at = b.created_at and a.ctid < b.ctid));

create unique index if not exists notifications_shortlist_suggested_unique
  on public.notifications (related_run_id)
  where kind = 'shortlist_suggested' and related_run_id is not null;

-- ── Tame form-submission noise ─────────────────────────────────────────────

update public.notifications
   set severity = 'info'
 where kind = 'new_form_submission'
   and severity = 'action';
