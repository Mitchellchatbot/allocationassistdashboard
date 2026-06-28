-- Amir #5 — schedule batches at a TIME of day (not just a date) and allow two
-- same-day same-country batches at DIFFERENT times (e.g. the duo at 09:00 and a
-- second duo at 14:00 Gulf). Also add a recurrence rule + a persisted next_run.

alter table public.scheduled_batch_sends
  add column if not exists scheduled_at_time time,
  add column if not exists timezone text not null default 'Asia/Dubai',
  add column if not exists recurrence jsonb not null default '{"freq":"none"}'::jsonb,
  add column if not exists next_run_at timestamptz;

-- Rebuild the live-row unique index to include the time, so two batches of the
-- same kind+date+country at different times are allowed (the core "two daily
-- emails at different times" enabler). coalesce so a null time still slots in.
drop index if exists scheduled_batch_sends_kind_date_specialty_country_unique;

create unique index if not exists scheduled_batch_sends_kind_date_spec_country_time_unique
  on public.scheduled_batch_sends
     (kind, scheduled_for, coalesce(specialty, ''), coalesce(country, ''), coalesce(scheduled_at_time, '00:00'::time))
  where status <> 'cancelled';

create index if not exists scheduled_batch_sends_next_run_idx
  on public.scheduled_batch_sends (next_run_at)
  where status = 'draft';
