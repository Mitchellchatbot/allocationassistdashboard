-- Persist the hospitals a batch EXCLUDES on the row itself, so a SCHEDULED send
-- (which fires server-side with no preview) honours the same exclusions the team
-- set in the preview (Sean: "work the scheduled stuff"). Mirrors how attachments
-- are persisted for the scheduler. Defaults to none.
alter table public.scheduled_batch_sends
  add column if not exists excluded_emails text[] not null default '{}';
