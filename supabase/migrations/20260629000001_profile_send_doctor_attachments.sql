-- Per-email attachments for scheduled Send-Profile campaigns. Attachments are
-- now split by recipient: `attachments` rides the hospital email, the new
-- `attachments_doctor` rides the doctor "working opportunity" email. The
-- scheduler (tick-sends) copies each set into the run metadata under the same
-- keys send-flow-email reads (metadata.attachments / metadata.attachments_doctor).
-- Existing rows keep an empty doctor set, so their behaviour is unchanged.

alter table public.scheduled_profile_sends
  add column if not exists attachments_doctor jsonb not null default '[]'::jsonb;
