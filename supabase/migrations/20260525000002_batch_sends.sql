-- Phase 6 — Recurring send schedules.
--
-- Three send kinds (per the May 20 spec):
--   1. daily_duo        — Mon-Fri 10:30 AM: 2 profiles to all 95 hospitals
--   2. tuesday_top_15   — Tuesday between 11 AM and 4 PM: 15 mixed-specialty profiles
--   3. specialty_of_day — Wed-Fri: rotates through ~60 specialties (one per day)
--
-- The TEAM picks doctors manually (queueing them into `doctor_ids`); the
-- system handles assembling the multi-doctor email, BCC'ing all hospitals,
-- and bookkeeping (status, sent_at, hospital_count).
--
-- The specialty rotation cursor is a single-row singleton table — when
-- a specialty_of_day batch sends, tick-scheduler advances the cursor.

create table if not exists public.scheduled_batch_sends (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('daily_duo', 'tuesday_top_15', 'specialty_of_day')),
  scheduled_for   date not null,
  -- For specialty_of_day this is the day's chosen specialty. For the others
  -- it can be left null or set to a label like "Mixed specialties".
  specialty       text,
  status          text not null default 'draft' check (status in ('draft', 'sent', 'cancelled', 'failed')),
  -- Prefixed doctor ids (lead:<id> or dob:<id>) in display order.
  doctor_ids      text[] not null default '{}',
  hospital_count  int,
  sent_at         timestamptz,
  sent_message_id text,
  error           text,
  notes           text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists scheduled_batch_sends_kind_idx
  on public.scheduled_batch_sends (kind, scheduled_for desc);
create index if not exists scheduled_batch_sends_status_idx
  on public.scheduled_batch_sends (status, scheduled_for);

-- At most one "live" (non-cancelled) draft+sent row per (kind, date, specialty).
-- Cancelled rows can coexist so the team can re-create after cancelling.
create unique index if not exists scheduled_batch_sends_kind_date_specialty_unique
  on public.scheduled_batch_sends (kind, scheduled_for, coalesce(specialty, ''))
  where status <> 'cancelled';

-- Singleton row holding the rotation queue + cursor. The team edits this in
-- the Batches page Settings panel.
create table if not exists public.specialty_rotation_state (
  id                int primary key default 1,
  queue             text[] not null default '{}',
  cursor_index      int    not null default 0,
  last_sent_specialty text,
  last_sent_at      timestamptz,
  updated_at        timestamptz not null default now(),
  constraint specialty_rotation_singleton check (id = 1)
);

insert into public.specialty_rotation_state (id, queue)
values (1, '{}'::text[])
on conflict (id) do nothing;

alter table public.scheduled_batch_sends     enable row level security;
alter table public.specialty_rotation_state  enable row level security;

drop policy if exists "service role full batches" on public.scheduled_batch_sends;
drop policy if exists "auth read batches"         on public.scheduled_batch_sends;
drop policy if exists "auth write batches"        on public.scheduled_batch_sends;
drop policy if exists "service role full rotation" on public.specialty_rotation_state;
drop policy if exists "auth read rotation"         on public.specialty_rotation_state;
drop policy if exists "auth write rotation"        on public.specialty_rotation_state;

create policy "service role full batches"   on public.scheduled_batch_sends     for all to service_role using (true) with check (true);
create policy "auth read batches"           on public.scheduled_batch_sends     for select to authenticated using (true);
create policy "auth write batches"          on public.scheduled_batch_sends     for all    to authenticated using (true) with check (true);
create policy "service role full rotation"  on public.specialty_rotation_state  for all to service_role using (true) with check (true);
create policy "auth read rotation"          on public.specialty_rotation_state  for select to authenticated using (true);
create policy "auth write rotation"         on public.specialty_rotation_state  for all    to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.scheduled_batch_sends;
alter publication supabase_realtime add table public.specialty_rotation_state;
