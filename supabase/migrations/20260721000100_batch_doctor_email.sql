-- Batch "working opportunity" doctor email (Hasan 2026-07-20): a batch send can
-- ALSO email each queued doctor a working-opportunity note listing the hospitals
-- they're being recommended to (grouped by city, with hospital photos) — shown +
-- editable in the batch preview. Off by default; the preview toggles it on.
alter table public.scheduled_batch_sends
  add column if not exists include_doctor_email boolean not null default false;
