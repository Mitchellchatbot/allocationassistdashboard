-- Per-batch email attachments (CVs, logbooks) for the Batches sender.
-- Mirrors the Send Profile dialog's attachment support (Amir 2026-06-26) so a
-- daily-duo / top-15 / specialty batch can carry the same files to every
-- hospital. Each element is { filename, path, storage_path, size } — send-batch
-- forwards { filename, path } to Resend, which fetches each public URL.
alter table public.scheduled_batch_sends
  add column if not exists attachments jsonb not null default '[]'::jsonb;
